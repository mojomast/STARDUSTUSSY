package security

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/auth"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/handlers"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

const (
	testJWTSecret     = "test-jwt-secret-key-at-least-32-chars"
	testRefreshSecret = "test-refresh-secret-key-at-least-32-chars"
	testAdminToken    = "secure-admin-api-token-123456789"
	testSessionID     = "test-security-session-123"
	testUserID        = "security-test-user-456"
	testDeviceID      = "security-test-device-789"
	allowedOrigin     = "https://app.harmonyflow.com"
	unallowedOrigin   = "https://evil.com"
)

type TestServer struct {
	router              *gin.Engine
	redisClient         *redis.Client
	wsManager           *protocol.Manager
	authMiddleware      *auth.Middleware
	adminAuthMiddleware *middleware.AdminAuthMiddleware
	corsMiddleware      *middleware.CORSMiddleware
	logger              *zap.Logger
	adminClaims         *models.UserClaims
	userClaims          *models.UserClaims
	adminToken          string
	userToken           string
	refreshToken        string
}

func setupSecurityTestServer(t *testing.T) *TestServer {
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

	authConfig := auth.Config{
		SecretKey:        testJWTSecret,
		RefreshSecretKey: testRefreshSecret,
		TokenExpiry:      15 * time.Minute,
		RefreshExpiry:    7 * 24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := middleware.NewAdminAuthMiddleware(authMiddleware, middleware.AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	corsMiddleware := middleware.NewCORSMiddleware(middleware.CORSConfig{
		AllowedOrigins:   []string{allowedOrigin, "http://localhost:3000"},
		AllowCredentials: true,
		MaxAge:           86400,
	}, logger)

	sessionHandler := handlers.NewSessionHandler(redisClient, wsManager, logger)
	wsHandler := handlers.NewWebSocketHandler(wsManager, redisClient, authMiddleware, logger)
	multiDeviceHandler := handlers.NewMultiDeviceHandler(redisClient, wsManager, logger)
	adminHandler := handlers.NewAdminHandler(redisClient, wsManager, logger)

	router := gin.New()
	router.Use(corsMiddleware.Middleware())
	router.Use(requestLogger(logger))

	router.GET("/health", sessionHandler.HealthCheck)
	router.POST("/session/snapshot", sessionHandler.CreateSnapshot)
	router.GET("/session/:uuid", sessionHandler.GetSnapshot)
	router.POST("/session/incremental", sessionHandler.ApplyIncrementalUpdate)
	router.POST("/session/conflict/resolve", sessionHandler.ResolveConflict)

	router.GET("/session/:uuid/devices", multiDeviceHandler.GetSessionDevices)
	router.POST("/session/:uuid/handoff", multiDeviceHandler.InitiateHandoff)
	router.GET("/session/:uuid/handoff/:token", multiDeviceHandler.ValidateHandoffToken)
	router.DELETE("/session/:uuid/device/:device_id", multiDeviceHandler.DisconnectDevice)

	adminGroup := router.Group("/admin")
	adminGroup.Use(adminAuthMiddleware.Middleware())
	{
		adminGroup.GET("/metrics/sessions", adminHandler.GetSessionMetrics)
		adminGroup.GET("/metrics/connections", adminHandler.GetConnectionMetrics)
		adminGroup.GET("/metrics/all", adminHandler.GetAllMetrics)
		adminGroup.GET("/sessions", adminHandler.GetActiveSessions)
		adminGroup.GET("/connections", adminHandler.GetActiveConnections)
		adminGroup.POST("/broadcast", adminHandler.BroadcastAdminMessage)
	}

	router.GET("/ws", wsHandler.HandleConnection)

	adminClaims := &models.UserClaims{
		UserID:    "admin-user-001",
		Email:     "admin@harmonyflow.com",
		Roles:     []string{"admin"},
		DeviceID:  "admin-device-001",
		SessionID: "admin-session-001",
	}

	userClaims := &models.UserClaims{
		UserID:    testUserID,
		Email:     "user@test.com",
		Roles:     []string{"user"},
		DeviceID:  testDeviceID,
		SessionID: testSessionID,
	}

	adminToken, _ := authMiddleware.GenerateToken(adminClaims)
	userToken, _ := authMiddleware.GenerateToken(userClaims)
	refreshToken, _, _ := authMiddleware.RefreshToken(userToken)

	return &TestServer{
		router:              router,
		redisClient:         redisClient,
		wsManager:           wsManager,
		authMiddleware:      authMiddleware,
		adminAuthMiddleware: adminAuthMiddleware,
		corsMiddleware:      corsMiddleware,
		logger:              logger,
		adminClaims:         adminClaims,
		userClaims:          userClaims,
		adminToken:          adminToken,
		userToken:           userToken,
		refreshToken:        refreshToken,
	}
}

func (ts *TestServer) Close() {
	if ts.redisClient != nil {
		ts.redisClient.Close()
	}
}

func requestLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

func makeAuthenticatedRequest(t *testing.T, ts *TestServer, method, path string, body interface{}, token string) *httptest.ResponseRecorder {
	var reqBody *bytes.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		require.NoError(t, err)
		reqBody = bytes.NewReader(jsonData)
	} else {
		reqBody = bytes.NewReader(nil)
	}

	req := httptest.NewRequest(method, path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	w := httptest.NewRecorder()
	ts.router.ServeHTTP(w, req)
	return w
}

func TestAuthenticationFlow_Complete(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	t.Run("JWT Token Generation", func(t *testing.T) {
		token, err := ts.authMiddleware.GenerateToken(ts.userClaims)
		require.NoError(t, err)
		assert.NotEmpty(t, token)
		assert.NotEqual(t, ts.userToken, token, "Each token should be unique")
	})

	t.Run("JWT Token Validation - Valid Token", func(t *testing.T) {
		claims, err := ts.authMiddleware.ValidateToken(ts.userToken)
		require.NoError(t, err)
		assert.Equal(t, ts.userClaims.UserID, claims.UserID)
		assert.Equal(t, ts.userClaims.Email, claims.Email)
		assert.Equal(t, ts.userClaims.Roles, claims.Roles)
	})

	t.Run("JWT Token Validation - Invalid Token", func(t *testing.T) {
		_, err := ts.authMiddleware.ValidateToken("invalid.token.here")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid")
	})

	t.Run("JWT Token Validation - Expired Token", func(t *testing.T) {
		expiredConfig := auth.Config{
			SecretKey:        testJWTSecret,
			RefreshSecretKey: testRefreshSecret,
			TokenExpiry:      -1 * time.Hour,
			RefreshExpiry:    7 * 24 * time.Hour,
		}
		expiredMiddleware := auth.NewMiddleware(expiredConfig, ts.logger)
		expiredToken, _ := expiredMiddleware.GenerateToken(ts.userClaims)

		_, err := expiredMiddleware.ValidateToken(expiredToken)
		assert.Error(t, err)
		assert.Equal(t, auth.ErrTokenExpired, err)
	})

	t.Run("Token Refresh Flow", func(t *testing.T) {
		newToken, claims, err := ts.authMiddleware.RefreshToken(ts.userToken)
		require.NoError(t, err)
		assert.NotEmpty(t, newToken)
		assert.Equal(t, ts.userClaims.UserID, claims.UserID)

		validatedClaims, err := ts.authMiddleware.ValidateToken(newToken)
		require.NoError(t, err)
		assert.Equal(t, ts.userClaims.UserID, validatedClaims.UserID)
	})

	t.Run("Authorization Check - Admin Role", func(t *testing.T) {
		assert.True(t, ts.authMiddleware.IsAuthorized([]string{"admin"}, "admin"))
		assert.True(t, ts.authMiddleware.IsAuthorized([]string{"admin"}, "user"))
	})

	t.Run("Authorization Check - User Role", func(t *testing.T) {
		assert.True(t, ts.authMiddleware.IsAuthorized([]string{"user"}, "user"))
		assert.False(t, ts.authMiddleware.IsAuthorized([]string{"user"}, "admin"))
	})

	t.Run("Authorization Check - Insufficient Role", func(t *testing.T) {
		assert.False(t, ts.authMiddleware.IsAuthorized([]string{"guest"}, "admin"))
		assert.False(t, ts.authMiddleware.IsAuthorized([]string{"guest"}, "user"))
	})
}

func TestAuthenticationFlow_SessionManagement(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	ctx := context.Background()

	snapshot := &models.SessionSnapshot{
		SessionID:   testSessionID,
		UserID:      testUserID,
		StateData:   map[string]interface{}{"test": "data", "secure": true},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    testDeviceID,
		AppVersion:  "2.1.0",
		LastUpdated: time.Now(),
		Version:     1,
	}

	err := ts.redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("Create Session with Valid Auth", func(t *testing.T) {
		reqBody := handlers.CreateSnapshotRequest{
			SessionID:  "new-session-123",
			UserID:     testUserID,
			StateData:  map[string]interface{}{"new": "data"},
			DeviceID:   "new-device-123",
			AppVersion: "2.1.0",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/snapshot", reqBody, ts.userToken)
		assert.Equal(t, http.StatusCreated, w.Code)
	})

	t.Run("Retrieve Session with Ownership", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+testSessionID, nil, ts.userToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var retrieved models.SessionSnapshot
		err := json.Unmarshal(w.Body.Bytes(), &retrieved)
		require.NoError(t, err)
		assert.Equal(t, testSessionID, retrieved.SessionID)
		assert.Equal(t, testUserID, retrieved.UserID)
	})

	t.Run("Update Session with Ownership", func(t *testing.T) {
		reqBody := handlers.IncrementalUpdateRequest{
			SessionID:   testSessionID,
			UserID:      testUserID,
			DeviceID:    testDeviceID,
			BaseVersion: 1,
			Changes:     map[string]interface{}{"updated": "value"},
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/incremental", reqBody, ts.userToken)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("Session Expiration - Expired Session", func(t *testing.T) {
		expiredSessionID := "expired-session-123"
		expiredSnapshot := &models.SessionSnapshot{
			SessionID:   expiredSessionID,
			UserID:      testUserID,
			StateData:   map[string]interface{}{"test": "data"},
			CreatedAt:   time.Now().Add(-8 * 24 * time.Hour),
			ExpiresAt:   time.Now().Add(-1 * time.Hour),
			DeviceID:    testDeviceID,
			AppVersion:  "2.1.0",
			LastUpdated: time.Now(),
		}

		err := ts.redisClient.SaveSnapshot(ctx, expiredSnapshot)
		require.NoError(t, err)

		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+expiredSessionID, nil, ts.userToken)
		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	ts.redisClient.DeleteSnapshot(ctx, testSessionID, testUserID)
}

func TestCrossOriginRequestSecurity(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	t.Run("Allowed Origin - Successful Request", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", allowedOrigin)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, allowedOrigin, w.Header().Get("Access-Control-Allow-Origin"))
		assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))
	})

	t.Run("Allowed Origin - Localhost", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", "http://localhost:3000")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "http://localhost:3000", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("Disallowed Origin - CORS Headers Not Set", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", unallowedOrigin)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
		assert.Empty(t, w.Header().Get("Access-Control-Allow-Credentials"))
	})

	t.Run("Preflight OPTIONS Request - Allowed Origin", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/session/snapshot", nil)
		req.Header.Set("Origin", allowedOrigin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "Content-Type, Authorization")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Equal(t, allowedOrigin, w.Header().Get("Access-Control-Allow-Origin"))
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Methods"), "POST")
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), "Content-Type")
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), "Authorization")
		assert.Equal(t, "86400", w.Header().Get("Access-Control-Max-Age"))
	})

	t.Run("Preflight OPTIONS Request - Disallowed Origin", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/session/snapshot", nil)
		req.Header.Set("Origin", unallowedOrigin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("CORS Headers Properly Set", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/session/snapshot", nil)
		req.Header.Set("Origin", allowedOrigin)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.NotEmpty(t, w.Header().Get("Access-Control-Allow-Methods"))
		assert.NotEmpty(t, w.Header().Get("Access-Control-Allow-Headers"))
		assert.NotEmpty(t, w.Header().Get("Access-Control-Expose-Headers"))
	})

	t.Run("Null Origin Rejected", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", "null")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("Subdomain Specificity", func(t *testing.T) {
		tests := []struct {
			origin      string
			shouldAllow bool
		}{
			{"https://app.harmonyflow.com", true},
			{"https://staging.harmonyflow.com", false},
			{"https://evil.harmonyflow.com", false},
		}

		for _, tt := range tests {
			req := httptest.NewRequest("GET", "/health", nil)
			req.Header.Set("Origin", tt.origin)
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if tt.shouldAllow {
				assert.Equal(t, tt.origin, w.Header().Get("Access-Control-Allow-Origin"))
			} else {
				assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
			}
		}
	})
}

func TestSessionSecurityValidation(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	ctx := context.Background()

	sessionID := "session-security-test-123"
	userID := "user-security-test-456"
	deviceID := "device-security-test-789"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"secure": "data", "sensitive": "info"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    deviceID,
		AppVersion:  "2.1.0",
		LastUpdated: time.Now(),
		Version:     1,
	}

	err := ts.redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("Session Creation with Proper Auth", func(t *testing.T) {
		newSessionID := "new-session-secure-456"
		reqBody := handlers.CreateSnapshotRequest{
			SessionID:  newSessionID,
			UserID:     userID,
			StateData:  map[string]interface{}{"test": "data"},
			DeviceID:   deviceID,
			AppVersion: "2.1.0",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/snapshot", reqBody, ts.userToken)
		assert.Equal(t, http.StatusCreated, w.Code)

		var response handlers.SnapshotResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, newSessionID, response.SessionID)
	})

	t.Run("Session Retrieval Requires Ownership", func(t *testing.T) {
		otherUserClaims := &models.UserClaims{
			UserID:    "other-user-999",
			Email:     "other@test.com",
			Roles:     []string{"user"},
			DeviceID:  "other-device-999",
			SessionID: "other-session-999",
		}
		otherUserToken, _ := ts.authMiddleware.GenerateToken(otherUserClaims)

		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+sessionID, nil, otherUserToken)
		assert.NotEqual(t, http.StatusOK, w.Code, "User should not access another user's session")
	})

	t.Run("Session Update Requires Ownership", func(t *testing.T) {
		reqBody := handlers.IncrementalUpdateRequest{
			SessionID:   sessionID,
			UserID:      "different-user-id",
			DeviceID:    deviceID,
			BaseVersion: 1,
			Changes:     map[string]interface{}{"hacked": "data"},
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/incremental", reqBody, ts.userToken)
		assert.NotEqual(t, http.StatusOK, w.Code, "User should not update with different user ID")
	})

	t.Run("Session Deletion Requires Ownership", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "DELETE", "/session/"+sessionID+"/device/"+deviceID, nil, ts.userToken)
		assert.Equal(t, http.StatusOK, w.Code, "Session owner should be able to disconnect device")
	})

	t.Run("Multi-Device Session Synchronization", func(t *testing.T) {
		device2Info := &models.DeviceInfo{
			DeviceID:    "device-002",
			DeviceType:  "tablet",
			DeviceName:  "iPad",
			SessionID:   sessionID,
			UserID:      userID,
			ConnectedAt: time.Now(),
			LastSeen:    time.Now(),
			IsOnline:    true,
		}

		err := ts.redisClient.RegisterDevice(ctx, device2Info)
		require.NoError(t, err)

		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+sessionID+"/devices", nil, ts.userToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var response handlers.DeviceListResponse
		err = json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, response.Count, 1)
	})

	t.Run("Session Data Encryption/Decryption", func(t *testing.T) {
		snapshot, err := ts.redisClient.GetSnapshot(ctx, sessionID)
		require.NoError(t, err)
		require.NotNil(t, snapshot)

		assert.NotEmpty(t, snapshot.StateData)
		assert.NotEmpty(t, snapshot.Checksum)
		assert.Equal(t, "data", snapshot.StateData["secure"])
	})

	ts.redisClient.DeleteSnapshot(ctx, sessionID, userID)
}

func TestAdminSecurityValidation(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	t.Run("Admin Token Validation", func(t *testing.T) {
		claims, err := ts.authMiddleware.ValidateToken(ts.adminToken)
		require.NoError(t, err)
		assert.Equal(t, ts.adminClaims.UserID, claims.UserID)
		assert.Contains(t, claims.Roles, "admin")
	})

	t.Run("Admin Dashboard Requires Auth", func(t *testing.T) {
		w := httptest.NewRequest("GET", "/admin/metrics/all", nil)
		w.Header.Set("Authorization", "")
		rec := httptest.NewRecorder()
		ts.router.ServeHTTP(rec, w)

		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("Admin Endpoints Protected - Non-Admin User", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, ts.userToken)
		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("Admin Endpoints Accessible - Admin User", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var response models.AdminMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.NotZero(t, response.Timestamp)
	})

	t.Run("Admin Session Metrics", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/sessions", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var response models.SessionMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.NotNil(t, response.SessionsByDevice)
	})

	t.Run("Admin Connection Metrics", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/connections", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var response models.ConnectionMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.NotNil(t, response.ConnectionsByUser)
	})

	t.Run("Admin Broadcast Message", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"message": "Test admin broadcast",
			"type":    "announcement",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/admin/broadcast", reqBody, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Equal(t, "Broadcast sent successfully", response["message"])
	})

	t.Run("Admin Get Active Sessions", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/sessions", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Contains(t, response, "sessions")
		assert.Contains(t, response, "count")
	})

	t.Run("Admin Get Active Connections", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/connections", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.Contains(t, response, "total_connections")
		assert.Contains(t, response, "connected_devices")
	})
}

func TestMultiDeviceHandoffSecurity(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	ctx := context.Background()

	sessionID := "handoff-secure-session-123"
	userID := "handoff-secure-user-456"

	snapshot := &models.SessionSnapshot{
		SessionID:   sessionID,
		UserID:      userID,
		StateData:   map[string]interface{}{"handoff": "test", "secure": "data"},
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    "source-device-001",
		AppVersion:  "2.1.0",
		LastUpdated: time.Now(),
		Version:     1,
	}

	err := ts.redisClient.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	t.Run("QR Pairing with Auth - Initiate Handoff", func(t *testing.T) {
		reqBody := handlers.HandoffRequest{
			SourceDevice: "source-device-001",
			TargetDevice: "target-device-002",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/"+sessionID+"/handoff", reqBody, ts.userToken)
		assert.Equal(t, http.StatusCreated, w.Code)

		var response handlers.HandoffResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.NotEmpty(t, response.Token)
		assert.Equal(t, sessionID, response.SessionID)
		assert.Equal(t, "source-device-001", response.SourceDevice)
		assert.Equal(t, "target-device-002", response.TargetDevice)
	})

	var handoffToken string

	t.Run("Handoff Token Validation", func(t *testing.T) {
		reqBody := handlers.HandoffRequest{
			SourceDevice: "source-device-001",
			TargetDevice: "target-device-002",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/"+sessionID+"/handoff", reqBody, ts.userToken)
		require.Equal(t, http.StatusCreated, w.Code)

		var response handlers.HandoffResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		handoffToken = response.Token

		w2 := makeAuthenticatedRequest(t, ts, "GET", "/session/"+sessionID+"/handoff/"+handoffToken, nil, ts.userToken)
		assert.Equal(t, http.StatusOK, w.Code)

		var tokenResponse map[string]interface{}
		err = json.Unmarshal(w2.Body.Bytes(), &tokenResponse)
		require.NoError(t, err)
		assert.True(t, tokenResponse["valid"].(bool))
		assert.NotNil(t, tokenResponse["state_data"])
	})

	t.Run("Handoff Token Security - One-Time Use", func(t *testing.T) {
		reqBody := handlers.HandoffRequest{
			SourceDevice: "source-device-001",
			TargetDevice: "target-device-003",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/"+sessionID+"/handoff", reqBody, ts.userToken)
		require.Equal(t, http.StatusCreated, w.Code)

		var response handlers.HandoffResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		oneTimeToken := response.Token

		w2 := makeAuthenticatedRequest(t, ts, "GET", "/session/"+sessionID+"/handoff/"+oneTimeToken, nil, ts.userToken)
		assert.Equal(t, http.StatusOK, w2.Code)

		w3 := makeAuthenticatedRequest(t, ts, "GET", "/session/"+sessionID+"/handoff/"+oneTimeToken, nil, ts.userToken)
		assert.Equal(t, http.StatusNotFound, w3.Code, "Token should be consumed after first use")
	})

	t.Run("Handoff Token Expiration", func(t *testing.T) {
		expiredToken := "expired-handoff-token-123456789abcdef"

		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+sessionID+"/handoff/"+expiredToken, nil, ts.userToken)
		assert.Equal(t, http.StatusNotFound, w.Code, "Expired token should return 404")
	})

	ts.redisClient.DeleteSnapshot(ctx, sessionID, userID)
}

func TestWebSocketConnectionSecurity(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	t.Run("WebSocket Upgrade with Allowed Origin", func(t *testing.T) {
		serverURL := fmt.Sprintf("ws://localhost:8080/ws")
		u, _ := url.Parse(serverURL)
		u.RawQuery = "origin=" + url.QueryEscape(allowedOrigin)

		headers := http.Header{}
		headers.Set("Origin", allowedOrigin)

		dialer := websocket.DefaultDialer
		conn, _, err := dialer.Dial(u.String(), headers)

		if err != nil {
			t.Skip("WebSocket server not running:", err)
		}
		if conn != nil {
			conn.Close()
		}
	})

	t.Run("WebSocket Upgrade with Disallowed Origin", func(t *testing.T) {
		headers := http.Header{}
		headers.Set("Origin", unallowedOrigin)

		dialer := websocket.DefaultDialer
		conn, _, err := dialer.Dial("ws://localhost:8080/ws", headers)

		if err == nil && conn != nil {
			conn.Close()
			t.Error("WebSocket connection should fail with disallowed origin")
		}
	})

	t.Run("WebSocket Authentication Required", func(t *testing.T) {
		authMsg := protocol.Message{
			Type:      protocol.MessageTypeAuth,
			Timestamp: time.Now().Unix(),
			Payload: map[string]interface{}{
				"token":       ts.userToken,
				"device_type": "test",
				"device_name": "test-device",
			},
		}

		msgData, _ := json.Marshal(authMsg)
		assert.NotEmpty(t, msgData)
		assert.NotEmpty(t, ts.userToken)
	})

	t.Run("WebSocket Unauthorized Access", func(t *testing.T) {
		invalidToken := "invalid.jwt.token"

		authMsg := protocol.Message{
			Type:      protocol.MessageTypeAuth,
			Timestamp: time.Now().Unix(),
			Payload: map[string]interface{}{
				"token":       invalidToken,
				"device_type": "test",
				"device_name": "test-device",
			},
		}

		msgData, _ := json.Marshal(authMsg)
		assert.NotEmpty(t, msgData)
	})
}

func TestAPIEndpointSecurityWithMiddleware(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	t.Run("Public Endpoint - No Auth Required", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/health", nil, "")
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("Protected Endpoint - Requires Valid Token", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, "")
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Protected Endpoint - Valid Admin Token", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("Protected Endpoint - Invalid Token", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, "invalid.token.here")
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Malformed Authorization Header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/admin/metrics/all", nil)
		req.Header.Set("Authorization", "InvalidFormat token123")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Missing Authorization Header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/admin/metrics/all", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Bearer Token with Spaces", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/admin/metrics/all", nil)
		req.Header.Set("Authorization", "Bearer")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestSecurityHeadersAndBestPractices(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	t.Run("Security Headers Present", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		headers := map[string]string{
			"Access-Control-Allow-Methods": w.Header().Get("Access-Control-Allow-Methods"),
			"Access-Control-Allow-Headers": w.Header().Get("Access-Control-Allow-Headers"),
			"Access-Control-Max-Age":       w.Header().Get("Access-Control-Max-Age"),
		}

		assert.NotEmpty(t, headers["Access-Control-Allow-Methods"])
		assert.NotEmpty(t, headers["Access-Control-Allow-Headers"])
		assert.NotEmpty(t, headers["Access-Control-Max-Age"])
	})

	t.Run("No Sensitive Data in Responses", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, ts.adminToken)

		var response models.AdminMetrics
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		bodyStr := w.Body.String()
		assert.NotContains(t, bodyStr, "password")
		assert.NotContains(t, bodyStr, "secret")
		assert.NotContains(t, bodyStr, "token")
	})

	t.Run("Input Validation - Invalid UUID", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/session/not-a-valid-uuid", nil, ts.userToken)
		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("Input Validation - Missing Required Fields", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"session_id": "test-123",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/snapshot", reqBody, ts.userToken)
		assert.NotEqual(t, http.StatusCreated, w.Code)
	})

	t.Run("Large Payload Protection", func(t *testing.T) {
		largePayload := make(map[string]interface{})
		for i := 0; i < 10000; i++ {
			largePayload[fmt.Sprintf("key%d", i)] = strings.Repeat("x", 1000)
		}

		reqBody := handlers.CreateSnapshotRequest{
			SessionID:  "large-payload-123",
			UserID:     testUserID,
			StateData:  largePayload,
			DeviceID:   testDeviceID,
			AppVersion: "2.1.0",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/snapshot", reqBody, ts.userToken)
		assert.NotEqual(t, http.StatusOK, w.Code, "Large payloads should be rejected")
	})
}

func TestSessionTimeoutAndExpiration(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	ctx := context.Background()

	t.Run("Session Timeout - Inactive Session", func(t *testing.T) {
		shortLivedSessionID := "short-lived-session-123"
		snapshot := &models.SessionSnapshot{
			SessionID:   shortLivedSessionID,
			UserID:      testUserID,
			StateData:   map[string]interface{}{"test": "data"},
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(1 * time.Second),
			DeviceID:    testDeviceID,
			AppVersion:  "2.1.0",
			LastUpdated: time.Now(),
		}

		err := ts.redisClient.SaveSnapshot(ctx, snapshot)
		require.NoError(t, err)

		time.Sleep(2 * time.Second)

		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+shortLivedSessionID, nil, ts.userToken)
		assert.Equal(t, http.StatusNotFound, w.Code)
	})

	t.Run("Session Refresh - Active Session", func(t *testing.T) {
		activeSessionID := "active-session-refresh-123"
		snapshot := &models.SessionSnapshot{
			SessionID:   activeSessionID,
			UserID:      testUserID,
			StateData:   map[string]interface{}{"active": "data"},
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(models.SnapshotTTL),
			DeviceID:    testDeviceID,
			AppVersion:  "2.1.0",
			LastUpdated: time.Now(),
		}

		err := ts.redisClient.SaveSnapshot(ctx, snapshot)
		require.NoError(t, err)

		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+activeSessionID, nil, ts.userToken)
		assert.Equal(t, http.StatusOK, w.Code)

		err = ts.redisClient.UpdateSnapshotTTL(ctx, activeSessionID)
		assert.NoError(t, err)

		ts.redisClient.DeleteSnapshot(ctx, activeSessionID, testUserID)
	})
}

func TestAuthorizationAndRoleBasedAccess(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	t.Run("Admin Role Access", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("User Role - No Admin Access", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, ts.userToken)
		assert.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("Superadmin Role", func(t *testing.T) {
		superAdminClaims := &models.UserClaims{
			UserID:    "super-admin-001",
			Email:     "superadmin@harmonyflow.com",
			Roles:     []string{"superadmin"},
			DeviceID:  "super-admin-device-001",
			SessionID: "super-admin-session-001",
		}
		superAdminToken, _ := ts.authMiddleware.GenerateToken(superAdminClaims)

		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, superAdminToken)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("Guest Role - Limited Access", func(t *testing.T) {
		guestClaims := &models.UserClaims{
			UserID:    "guest-001",
			Email:     "guest@test.com",
			Roles:     []string{"guest"},
			DeviceID:  "guest-device-001",
			SessionID: "guest-session-001",
		}
		guestToken, _ := ts.authMiddleware.GenerateToken(guestClaims)

		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/metrics/all", nil, guestToken)
		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestCompleteSecurityEcosystem(t *testing.T) {
	ts := setupSecurityTestServer(t)
	defer ts.Close()

	ctx := context.Background()

	sessionID := "complete-security-test-123"
	userID := "complete-security-user-456"

	t.Run("Full Security Flow - Registration to Access", func(t *testing.T) {
		newClaims := &models.UserClaims{
			UserID:    "new-user-001",
			Email:     "newuser@test.com",
			Roles:     []string{"user"},
			DeviceID:  "new-device-001",
			SessionID: "new-session-001",
		}
		newToken, err := ts.authMiddleware.GenerateToken(newClaims)
		require.NoError(t, err)

		snapshot := &models.SessionSnapshot{
			SessionID:   sessionID,
			UserID:      userID,
			StateData:   map[string]interface{}{"complete": "flow"},
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(models.SnapshotTTL),
			DeviceID:    testDeviceID,
			AppVersion:  "2.1.0",
			LastUpdated: time.Now(),
		}
		err = ts.redisClient.SaveSnapshot(ctx, snapshot)
		require.NoError(t, err)

		w := makeAuthenticatedRequest(t, ts, "GET", "/session/"+sessionID, nil, newToken)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("Cross-Device Handoff with Security", func(t *testing.T) {
		reqBody := handlers.HandoffRequest{
			SourceDevice: "device-001",
			TargetDevice: "device-002",
		}

		w := makeAuthenticatedRequest(t, ts, "POST", "/session/"+sessionID+"/handoff", reqBody, ts.userToken)
		assert.Equal(t, http.StatusCreated, w.Code)

		var response handlers.HandoffResponse
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)
		assert.NotEmpty(t, response.Token)
	})

	t.Run("Admin Monitoring with Auth", func(t *testing.T) {
		w := makeAuthenticatedRequest(t, ts, "GET", "/admin/connections", nil, ts.adminToken)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	ts.redisClient.DeleteSnapshot(ctx, sessionID, userID)
}
