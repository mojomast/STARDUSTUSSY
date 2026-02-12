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
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func setupIntegrationTestRouter(t *testing.T) (*gin.Engine, *redis.Client, *protocol.Manager) {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	redisConfig := redis.Config{
		Addr: "localhost:6379",
		DB:   15,
	}

	redisClient, err := redis.NewClient(redisConfig, logger)
	if err != nil {
		t.Skip("Redis not available for integration tests:", err)
	}

	wsManager := protocol.NewManager(logger)
	go wsManager.Run()

	sessionHandler := NewSessionHandler(redisClient, wsManager, logger)
	multiDeviceHandler := NewMultiDeviceHandler(redisClient, wsManager, logger)
	adminHandler := NewAdminHandler(redisClient, wsManager, logger)

	securityConfig := middleware.SecurityConfig{
		AdminAPIToken:      "test-admin-token",
		AllowedOrigins:     []string{"localhost"},
		EnableRateLimiting: false,
		EnableCSRF:         false,
	}
	securityMiddleware := middleware.NewSecurityMiddleware(securityConfig, logger)

	router := gin.New()

	router.POST("/session/snapshot", sessionHandler.CreateSnapshot)
	router.GET("/session/:uuid", sessionHandler.GetSnapshot)
	router.POST("/session/incremental", sessionHandler.ApplyIncrementalUpdate)
	router.POST("/session/conflict/resolve", sessionHandler.ResolveConflict)

	router.GET("/session/:uuid/devices", multiDeviceHandler.GetSessionDevices)
	router.POST("/session/:uuid/handoff", multiDeviceHandler.InitiateHandoff)
	router.GET("/session/:uuid/handoff/:token", multiDeviceHandler.ValidateHandoffToken)
	router.DELETE("/session/:uuid/device/:device_id", multiDeviceHandler.DisconnectDevice)

	router.GET("/admin/metrics/sessions", securityMiddleware.RequireAdmin(), adminHandler.GetSessionMetrics)
	router.GET("/admin/metrics/connections", securityMiddleware.RequireAdmin(), adminHandler.GetConnectionMetrics)
	router.GET("/admin/metrics/all", securityMiddleware.RequireAdmin(), adminHandler.GetAllMetrics)

	return router, redisClient, wsManager
}

func TestMultiDeviceSessionSync(t *testing.T) {
	router, redisClient, _ := setupIntegrationTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "multi-device-session-123"
	userID := "multi-device-user-456"

	t.Run("create snapshot from first device", func(t *testing.T) {
		snapshot := CreateSnapshotRequest{
			SessionID:  sessionID,
			UserID:     userID,
			StateData:  map[string]interface{}{"progress": 50, "mood": "calm"},
			DeviceID:   "device-phone",
			AppVersion: "2.1.0",
		}

		body, _ := json.Marshal(snapshot)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/snapshot", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusCreated, w.Code)

		var response SnapshotResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.NotZero(t, response.Version)
	})

	t.Run("register second device", func(t *testing.T) {
		deviceInfo := &models.DeviceInfo{
			DeviceID:    "device-tablet",
			DeviceType:  "tablet",
			DeviceName:  "iPad Pro",
			SessionID:   sessionID,
			UserID:      userID,
			ConnectedAt: time.Now(),
			LastSeen:    time.Now(),
			IsOnline:    true,
		}

		err := redisClient.RegisterDevice(ctx, deviceInfo)
		require.NoError(t, err)
	})

	t.Run("retrieve devices for session", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/devices", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response DeviceListResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, sessionID, response.SessionID)
		assert.GreaterOrEqual(t, response.Count, 1)
	})

	t.Run("apply incremental update from second device", func(t *testing.T) {
		update := IncrementalUpdateRequest{
			SessionID:   sessionID,
			UserID:      userID,
			DeviceID:    "device-tablet",
			BaseVersion: 1,
			Changes:     map[string]interface{}{"progress": 75, "meditation_time": 600},
			DeletedKeys: []string{},
		}

		body, _ := json.Marshal(update)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/incremental", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("verify updated snapshot", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var snapshot models.SessionSnapshot
		err := json.Unmarshal(w.Body.Bytes(), &snapshot)
		require.NoError(t, err)

		assert.Equal(t, 75, snapshot.StateData["progress"])
		assert.Equal(t, 600, snapshot.StateData["meditation_time"])
		assert.Equal(t, "calm", snapshot.StateData["mood"])
		assert.Greater(t, snapshot.Version, int64(0))
	})

	err := redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
}

func TestDeviceHandoffFlow(t *testing.T) {
	router, redisClient, _ := setupIntegrationTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "handoff-session-123"
	userID := "handoff-user-456"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"step": 5, "completed": false},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-phone",
		AppVersion:  "2.1.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	var handoffToken string

	t.Run("initiate handoff from phone to laptop", func(t *testing.T) {
		reqBody := HandoffRequest{
			SourceDevice: "device-phone",
			TargetDevice: "device-laptop",
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

		handoffToken = response.Token
		assert.NotEmpty(t, handoffToken)
		assert.Equal(t, "device-phone", response.SourceDevice)
		assert.Equal(t, "device-laptop", response.TargetDevice)
	})

	t.Run("validate handoff token", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/handoff/"+handoffToken, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.True(t, response["valid"].(bool))
		assert.Equal(t, sessionID, response["session_id"])
		assert.NotNil(t, response["state_data"])
	})

	t.Run("token is consumed after validation", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/handoff/"+handoffToken, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	err = redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
}

func TestConflictResolution(t *testing.T) {
	router, redisClient, _ := setupIntegrationTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "conflict-session-123"
	userID := "conflict-user-456"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"counter": 10, "status": "active"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-1",
		AppVersion:  "2.1.0",
		LastUpdated: time.Now(),
		Version:     1,
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("resolve conflict with server wins strategy", func(t *testing.T) {
		reqBody := ConflictResolutionRequest{
			SessionID:          sessionID,
			ClientVersion:      1,
			ClientState:        map[string]interface{}{"counter": 15, "new_field": "test"},
			ResolutionStrategy: "server_wins",
		}

		body, _ := json.Marshal(reqBody)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/conflict/resolve", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.ConflictInfo
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, sessionID, response.SessionID)
		assert.NotEmpty(t, response.ConflictingKeys)
		assert.Contains(t, response.ConflictingKeys, "counter")
	})

	t.Run("verify resolved state on server", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var snapshot models.SessionSnapshot
		err := json.Unmarshal(w.Body.Bytes(), &snapshot)
		require.NoError(t, err)

		assert.Greater(t, snapshot.Version, int64(1))
	})

	err = redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
}

func TestAdminDashboardMetrics(t *testing.T) {
	router, redisClient, _ := setupIntegrationTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()

	for i := 0; i < 3; i++ {
		snapshot := &models.SessionSnapshot{
			SessionID:   "admin-test-session-" + string(rune('a'+i)),
			UserID:      "admin-test-user-" + string(rune('a'+i)),
			StateData:   map[string]interface{}{"test": "data"},
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(models.SnapshotTTL),
			DeviceID:    "device-" + string(rune('a'+i)),
			AppVersion:  "2.1.0",
			LastUpdated: time.Now(),
		}
		err := redisClient.SaveSnapshot(ctx, snapshot)
		require.NoError(t, err)
	}

	t.Run("get all admin metrics", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/metrics/all", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.AdminMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotZero(t, response.Timestamp)
		assert.NotNil(t, response.Sessions.SessionsByDevice)
		assert.NotNil(t, response.Connections.ConnectionsByUser)
		assert.GreaterOrEqual(t, response.Sessions.TotalSessions, int64(0))
	})

	t.Run("get session metrics", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/metrics/sessions", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.SessionMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotNil(t, response.SessionsByDevice)
		assert.NotZero(t, response.Timestamp)
	})

	t.Run("get connection metrics", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/metrics/connections", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.ConnectionMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotNil(t, response.ConnectionsByUser)
		assert.NotZero(t, response.Timestamp)
	})

	for i := 0; i < 3; i++ {
		sessionID := "admin-test-session-" + string(rune('a'+i))
		userID := "admin-test-user-" + string(rune('a'+i))
		err := redisClient.DeleteSnapshot(ctx, sessionID, userID)
		require.NoError(t, err)
	}
}

func TestDeviceDisconnection(t *testing.T) {
	router, redisClient, _ := setupIntegrationTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	sessionID := "disconnect-session-123"
	userID := "disconnect-user-456"
	deviceID := "device-to-disconnect"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"test": "data"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    deviceID,
		AppVersion:  "2.1.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	deviceInfo := &models.DeviceInfo{
		DeviceID:    deviceID,
		DeviceType:  "mobile",
		DeviceName:  "Test Device",
		SessionID:   sessionID,
		UserID:      userID,
		ConnectedAt: time.Now(),
		LastSeen:    time.Now(),
		IsOnline:    true,
	}

	err = redisClient.RegisterDevice(ctx, deviceInfo)
	require.NoError(t, err)

	t.Run("verify device is registered", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/devices", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response DeviceListResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.GreaterOrEqual(t, response.Count, 1)
	})

	t.Run("disconnect device", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("DELETE", "/session/"+sessionID+"/device/"+deviceID, nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "Device disconnected successfully", response["message"])
	})

	t.Run("verify device is removed", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/"+sessionID+"/devices", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response DeviceListResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		found := false
		for _, device := range response.Devices {
			if device.DeviceID == deviceID {
				found = true
				break
			}
		}
		assert.False(t, found)
	})

	err = redisClient.DeleteSnapshot(ctx, sessionID, userID)
	require.NoError(t, err)
}
