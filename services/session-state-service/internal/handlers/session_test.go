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

func setupTestRouter(t *testing.T) (*gin.Engine, *redis.Client, *protocol.Manager) {
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

	router := gin.New()
	router.GET("/health", sessionHandler.HealthCheck)
	router.POST("/session/snapshot", sessionHandler.CreateSnapshot)
	router.GET("/session/:uuid", sessionHandler.GetSnapshot)

	return router, redisClient, wsManager
}

func TestHealthCheck(t *testing.T) {
	router, redisClient, _ := setupTestRouter(t)
	defer redisClient.Close()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/health", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "healthy", response["status"])
	assert.NotNil(t, response["timestamp"])
	assert.NotNil(t, response["version"])
	assert.NotNil(t, response["uptime"])
	assert.NotNil(t, response["active_connections"])
}

func TestCreateSnapshot(t *testing.T) {
	router, redisClient, _ := setupTestRouter(t)
	defer redisClient.Close()

	t.Run("create valid snapshot", func(t *testing.T) {
		snapshot := CreateSnapshotRequest{
			SessionID:  "test-session-create",
			UserID:     "test-user",
			StateData:  map[string]interface{}{"key": "value", "count": 42},
			DeviceID:   "test-device",
			AppVersion: "1.0.0",
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

		assert.Equal(t, snapshot.SessionID, response.SessionID)
		assert.Equal(t, snapshot.UserID, response.UserID)
		assert.Equal(t, snapshot.DeviceID, response.DeviceID)
		assert.Equal(t, snapshot.AppVersion, response.AppVersion)
		assert.NotZero(t, response.CreatedAt)
		assert.NotZero(t, response.ExpiresAt)

		ctx := context.Background()
		err = redisClient.DeleteSnapshot(ctx, snapshot.SessionID, snapshot.UserID)
		require.NoError(t, err)
	})

	t.Run("create snapshot with invalid UUID", func(t *testing.T) {
		snapshot := CreateSnapshotRequest{
			SessionID: "invalid-uuid",
			UserID:    "test-user",
			StateData: map[string]interface{}{},
		}

		body, _ := json.Marshal(snapshot)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/snapshot", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("create snapshot with missing required fields", func(t *testing.T) {
		snapshot := map[string]interface{}{
			"session_id": "123e4567-e89b-12d3-a456-426614174000",
		}

		body, _ := json.Marshal(snapshot)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/session/snapshot", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestGetSnapshot(t *testing.T) {
	router, redisClient, _ := setupTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()
	snapshot := &models.SessionSnapshot{
		SessionID:  "test-session-get",
		UserID:     "test-user",
		StateData:  map[string]interface{}{"key": "value"},
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(models.SnapshotTTL),
		DeviceID:   "test-device",
		AppVersion: "1.0.0",
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("get existing snapshot", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/test-session-get", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.SessionSnapshot
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, snapshot.SessionID, response.SessionID)
		assert.Equal(t, snapshot.UserID, response.UserID)
	})

	t.Run("get non-existent snapshot", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/non-existent", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("get snapshot with empty UUID", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/session/", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	err = redisClient.DeleteSnapshot(ctx, snapshot.SessionID, snapshot.UserID)
	require.NoError(t, err)
}

func TestNewSessionHandler(t *testing.T) {
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

	handler := NewSessionHandler(redisClient, wsManager, logger)

	assert.NotNil(t, handler)
	assert.NotNil(t, handler.redisClient)
	assert.NotNil(t, handler.wsManager)
	assert.NotNil(t, handler.logger)
	assert.NotZero(t, handler.startTime)
}
