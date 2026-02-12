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

func setupAdminTestRouter(t *testing.T) (*gin.Engine, *redis.Client, *protocol.Manager) {
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

	adminHandler := NewAdminHandler(redisClient, wsManager, logger)
	sessionHandler := NewSessionHandler(redisClient, wsManager, logger)

	securityConfig := middleware.SecurityConfig{
		AdminAPIToken:      "test-admin-token",
		AllowedOrigins:     []string{"localhost"},
		EnableRateLimiting: false,
		EnableCSRF:         false,
	}
	securityMiddleware := middleware.NewSecurityMiddleware(securityConfig, logger)

	router := gin.New()
	router.GET("/health", sessionHandler.HealthCheck)
	router.GET("/admin/metrics/sessions", securityMiddleware.RequireAdmin(), adminHandler.GetSessionMetrics)
	router.GET("/admin/metrics/connections", securityMiddleware.RequireAdmin(), adminHandler.GetConnectionMetrics)
	router.GET("/admin/metrics/snapshots", securityMiddleware.RequireAdmin(), adminHandler.GetSnapshotMetrics)
	router.GET("/admin/metrics/all", securityMiddleware.RequireAdmin(), adminHandler.GetAllMetrics)
	router.GET("/admin/sessions", securityMiddleware.RequireAdmin(), adminHandler.GetActiveSessions)
	router.GET("/admin/connections", securityMiddleware.RequireAdmin(), adminHandler.GetActiveConnections)
	router.POST("/admin/broadcast", securityMiddleware.RequireAdmin(), adminHandler.BroadcastAdminMessage)

	return router, redisClient, wsManager
}

func TestGetSessionMetrics(t *testing.T) {
	router, redisClient, _ := setupAdminTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()

	snapshot1 := &models.SessionSnapshot{
		SessionID:   "admin-test-session-1",
		UserID:      "admin-test-user-1",
		StateData:   map[string]interface{}{"test": "data1"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-1",
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
	}

	snapshot2 := &models.SessionSnapshot{
		SessionID:   "admin-test-session-2",
		UserID:      "admin-test-user-2",
		StateData:   map[string]interface{}{"test": "data2"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-2",
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot1)
	require.NoError(t, err)
	err = redisClient.SaveSnapshot(ctx, snapshot2)
	require.NoError(t, err)

	t.Run("get session metrics", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/metrics/sessions", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.SessionMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotZero(t, response.TotalSessions)
		assert.NotNil(t, response.SessionsByDevice)
		assert.NotZero(t, response.Timestamp)
	})

	err = redisClient.DeleteSnapshot(ctx, snapshot1.SessionID, snapshot1.UserID)
	require.NoError(t, err)
	err = redisClient.DeleteSnapshot(ctx, snapshot2.SessionID, snapshot2.UserID)
	require.NoError(t, err)
}

func TestGetConnectionMetrics(t *testing.T) {
	router, redisClient, _ := setupAdminTestRouter(t)
	defer redisClient.Close()

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
}

func TestGetSnapshotMetrics(t *testing.T) {
	router, redisClient, _ := setupAdminTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()

	snapshot := &models.SessionSnapshot{
		SessionID:   "admin-test-snapshot-metrics",
		UserID:      "admin-test-user",
		StateData:   map[string]interface{}{"test": "data"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-1",
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("get snapshot metrics", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/metrics/snapshots", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response models.SnapshotMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotZero(t, response.TotalSnapshots)
		assert.NotZero(t, response.Timestamp)
	})

	err = redisClient.DeleteSnapshot(ctx, snapshot.SessionID, snapshot.UserID)
	require.NoError(t, err)
}

func TestGetAllMetrics(t *testing.T) {
	router, redisClient, _ := setupAdminTestRouter(t)
	defer redisClient.Close()

	t.Run("get all metrics", func(t *testing.T) {
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
	})
}

func TestGetActiveSessions(t *testing.T) {
	router, redisClient, _ := setupAdminTestRouter(t)
	defer redisClient.Close()

	ctx := context.Background()

	snapshot := &models.SessionSnapshot{
		SessionID:   "admin-active-session-test",
		UserID:      "admin-test-user",
		StateData:   map[string]interface{}{"test": "data"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "device-1",
		AppVersion:  "1.0.0",
		LastUpdated: time.Now(),
		Version:     1,
	}

	err := redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("get active sessions", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/sessions", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		sessions, ok := response["sessions"].([]interface{})
		assert.True(t, ok)
		assert.GreaterOrEqual(t, len(sessions), 0)
	})

	err = redisClient.DeleteSnapshot(ctx, snapshot.SessionID, snapshot.UserID)
	require.NoError(t, err)
}

func TestGetActiveConnections(t *testing.T) {
	router, redisClient, _ := setupAdminTestRouter(t)
	defer redisClient.Close()

	t.Run("get active connections", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/connections", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotNil(t, response["total_connections"])
		assert.NotNil(t, response["connected_devices"])
		assert.NotNil(t, response["unique_users"])
	})
}

func TestBroadcastAdminMessage(t *testing.T) {
	router, redisClient, _ := setupAdminTestRouter(t)
	defer redisClient.Close()

	t.Run("broadcast admin message", func(t *testing.T) {
		reqBody := map[string]string{
			"message": "Test admin message",
			"type":    "notification",
		}

		body, _ := json.Marshal(reqBody)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/admin/broadcast", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "Broadcast sent successfully", response["message"])
		assert.Equal(t, "notification", response["type"])
	})

	t.Run("broadcast with missing message", func(t *testing.T) {
		reqBody := map[string]string{
			"type": "notification",
		}

		body, _ := json.Marshal(reqBody)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/admin/broadcast", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Admin-Token", "test-admin-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})
}

func TestNewAdminHandler(t *testing.T) {
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

	handler := NewAdminHandler(redisClient, wsManager, logger)

	assert.NotNil(t, handler)
	assert.NotNil(t, handler.redisClient)
	assert.NotNil(t, handler.wsManager)
	assert.NotNil(t, handler.logger)
}
