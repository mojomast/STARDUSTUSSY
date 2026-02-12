package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func setupMultiDeviceTestRouter(t *testing.T) (*gin.Engine, *redis.Client, *protocol.Manager) {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	redisConfig := redis.Config{
		Addr: "localhost:6379",
		DB:   15,
	}

	redisClient, err := redis.NewClient(redisConfig, logger)
	if err != nil {
		t.Skip("Redis not available for tests:", err)
	}

	wsManager := protocol.NewManager(logger)
	go wsManager.Run()

	sessionHandler := NewSessionHandler(redisClient, wsManager, logger)
	multiDeviceHandler := NewMultiDeviceHandler(redisClient, wsManager, logger)

	router := gin.New()
	router.GET("/health", sessionHandler.HealthCheck)
	router.POST("/session/snapshot", sessionHandler.CreateSnapshot)
	router.GET("/session/:uuid/devices", multiDeviceHandler.GetSessionDevices)
	router.POST("/session/:uuid/handoff", multiDeviceHandler.InitiateHandoff)
	router.GET("/session/:uuid/handoff/:token", multiDeviceHandler.ValidateHandoffToken)
	router.DELETE("/session/:uuid/device/:device_id", multiDeviceHandler.DisconnectDevice)

	return router, redisClient, wsManager
}

func TestGetSessionDevices(t *testing.T) {
	router, redisClient, _ := setupMultiDeviceTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "test-session-devices-123"
	userID := "test-user-456"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"test": "data"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-1",
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	deviceInfo := &models.DeviceInfo{
		DeviceID:    "device-1",
		DeviceType:  "mobile",
		DeviceName:  "Test Phone",
		SessionID:   sessionID,
		UserID:      userID,
		ConnectedAt: time.Now(),
		LastSeen:    time.Now(),
		IsOnline:    true,
	}

	err = redisClient.RegisterDevice(ctx, deviceInfo)
	require.NoError(t, err)

	t.Run("get devices for existing session", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/devices", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response DeviceListResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, sessionID, response.SessionID)
		assert.Equal(t, 1, response.Count)
		assert.Len(t, response.Devices, 1)
		assert.Equal(t, "device-1", response.Devices[0].DeviceID)
	})

	t.Run("get devices for non-existent session", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/non-existent-session/devices", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response DeviceListResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, 0, response.Count)
	})

	t.Run("get devices with missing session ID", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session//devices", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	err = redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
	err = redisClient.RemoveDevice(ctx, "device-1", userID, sessionID)
	require.NoError(t, err)
}

func TestInitiateHandoff(t *testing.T) {
	router, redisClient, _ := setupMultiDeviceTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "test-session-handoff-123"
	userID := "test-user-456"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"progress": 50, "mood": "happy"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-source",
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("initiate valid handoff", func(t *testing.T) {
		reqBody := HandoffRequest{
			SourceDevice: "device-source",
			TargetDevice: "device-target",
		}

		body, _ := json.Marshal(reqBody)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/"+sessionID+"/handoff", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var response HandoffResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotEmpty(t, response.Token)
		assert.Equal(t, sessionID, response.SessionID)
		assert.Equal(t, "device-source", response.SourceDevice)
		assert.Equal(t, "device-target", response.TargetDevice)
		assert.NotZero(t, response.ExpiresAt)
	})

	t.Run("initiate handoff for non-existent session", func(t *testing.T) {
		reqBody := HandoffRequest{
			SourceDevice: "device-source",
			TargetDevice: "device-target",
		}

		body, _ := json.Marshal(reqBody)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/non-existent/handoff", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("initiate handoff with missing source device", func(t *testing.T) {
		reqBody := map[string]string{
			"target_device": "device-target",
		}

		body, _ := json.Marshal(reqBody)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/"+sessionID+"/handoff", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	err = redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
}

func TestValidateHandoffToken(t *testing.T) {
	router, redisClient, _ := setupMultiDeviceTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "test-session-validate-123"
	userID := "test-user-456"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"test": "data"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-1",
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	token := "test-handoff-token-123"
	handoffToken := &models.HandoffToken{
		Token:        token,
		SessionID:    sessionID,
		SourceDevice: "device-source",
		TargetDevice: "device-target",
		UserID:       userID,
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(models.HandoffTokenTTL),
		StateData:    map[string]interface{}{"test": "data"},
	}

	err = redisClient.SaveHandoffToken(ctx, handoffToken)
	require.NoError(t, err)

	t.Run("validate valid handoff token", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/handoff/"+token, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response["valid"].(bool))
		assert.Equal(t, sessionID, response["session_id"])
		assert.Equal(t, "device-source", response["source_device"])
		assert.Equal(t, "device-target", response["target_device"])
	})

	t.Run("validate non-existent token", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/handoff/invalid-token", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("validate token for wrong session", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/wrong-session/handoff/"+token, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	err = redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
}

func TestDisconnectDevice(t *testing.T) {
	router, redisClient, _ := setupMultiDeviceTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "test-session-disconnect-123"
	userID := "test-user-456"
	deviceID := "device-to-disconnect"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"test": "data"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    deviceID,
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	deviceInfo := &models.DeviceInfo{
		DeviceID:    deviceID,
		DeviceType:  "mobile",
		DeviceName:  "Test Phone",
		SessionID:   sessionID,
		UserID:      userID,
		ConnectedAt: time.Now(),
		LastSeen:    time.Now(),
		IsOnline:    true,
	}

	err = redisClient.RegisterDevice(ctx, deviceInfo)
	require.NoError(t, err)

	t.Run("disconnect existing device", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", "/session/"+sessionID+"/device/"+deviceID, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "Device disconnected successfully", response["message"])
		assert.Equal(t, deviceID, response["device_id"])
		assert.Equal(t, sessionID, response["session_id"])
	})

	t.Run("disconnect device from non-existent session", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", "/session/non-existent/device/"+deviceID, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("disconnect with missing parameters", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", "/session//device/", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	err = redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
}

func TestNewMultiDeviceHandler(t *testing.T) {
	logger := zap.NewNop()
	wsManager := protocol.NewManager(logger)

	redisConfig := redis.Config{
		Addr: "localhost:6379",
		DB:   15,
	}

	redisClient, err := redis.NewClient(redisConfig, logger)
	if err != nil {
		t.Skip("Redis not available")
	}
	defer redisClient.Close()

	handler := NewMultiDeviceHandler(redisClient, wsManager, logger)

	assert.NotNil(t, handler)
	assert.NotNil(t, handler.redisClient)
	assert.NotNil(t, handler.wsManager)
	assert.NotNil(t, handler.logger)
}
