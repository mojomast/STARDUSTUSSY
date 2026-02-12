package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/auth"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func TestAdminAuthMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	authConfig := auth.Config{
		SecretKey:        "test-secret-key-for-admin-auth-middleware-testing",
		RefreshSecretKey: "test-refresh-secret-key",
		TokenExpiry:      1 * time.Hour,
		RefreshExpiry:    24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := NewAdminAuthMiddleware(authMiddleware, AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	router := gin.New()
	router.Use(adminAuthMiddleware.Middleware())
	router.GET("/admin/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "admin access granted"})
	})
	router.GET("/public/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "public access"})
	})

	t.Run("NoTokenProvided", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("PublicEndpointAccessible", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/public/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestAdminAuthWithValidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	authConfig := auth.Config{
		SecretKey:        "test-secret-key-for-admin-auth-middleware-with-valid-token",
		RefreshSecretKey: "test-refresh-secret-key",
		TokenExpiry:      1 * time.Hour,
		RefreshExpiry:    24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := NewAdminAuthMiddleware(authMiddleware, AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	claims := &auth.Claims{
		UserID:    "admin-user-123",
		Email:     "admin@example.com",
		Roles:     []string{"admin"},
		DeviceID:  "device-123",
		SessionID: "session-123",
	}
	claims.RegisteredClaims.ExpiresAt = nil

	token := generateTestToken(authMiddleware, claims)

	router := gin.New()
	router.Use(adminAuthMiddleware.Middleware())
	router.GET("/admin/test", func(c *gin.Context) {
		userID := c.GetString("user_id")
		c.JSON(http.StatusOK, gin.H{"user_id": userID, "message": "admin access granted"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAdminAuthWithNonAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	authConfig := auth.Config{
		SecretKey:        "test-secret-key-for-non-admin-role",
		RefreshSecretKey: "test-refresh-secret-key",
		TokenExpiry:      1 * time.Hour,
		RefreshExpiry:    24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := NewAdminAuthMiddleware(authMiddleware, AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	claims := &auth.Claims{
		UserID:    "user-123",
		Email:     "user@example.com",
		Roles:     []string{"user"},
		DeviceID:  "device-123",
		SessionID: "session-123",
	}
	claims.RegisteredClaims.ExpiresAt = nil

	token := generateTestToken(authMiddleware, claims)

	router := gin.New()
	router.Use(adminAuthMiddleware.Middleware())
	router.GET("/admin/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "admin access granted"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdminAuthWithSuperAdminRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	authConfig := auth.Config{
		SecretKey:        "test-secret-key-for-super-admin-role",
		RefreshSecretKey: "test-refresh-secret-key",
		TokenExpiry:      1 * time.Hour,
		RefreshExpiry:    24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := NewAdminAuthMiddleware(authMiddleware, AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	claims := &auth.Claims{
		UserID:    "superadmin-user",
		Email:     "superadmin@example.com",
		Roles:     []string{"superadmin"},
		DeviceID:  "device-123",
		SessionID: "session-123",
	}
	claims.RegisteredClaims.ExpiresAt = nil

	token := generateTestToken(authMiddleware, claims)

	router := gin.New()
	router.Use(adminAuthMiddleware.Middleware())
	router.GET("/admin/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "admin access granted"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAdminAuthInvalidTokenFormat(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	authConfig := auth.Config{
		SecretKey:        "test-secret-key-for-invalid-token-format",
		RefreshSecretKey: "test-refresh-secret-key",
		TokenExpiry:      1 * time.Hour,
		RefreshExpiry:    24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := NewAdminAuthMiddleware(authMiddleware, AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	router := gin.New()
	router.Use(adminAuthMiddleware.Middleware())
	router.GET("/admin/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "admin access granted"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin/test", nil)
	req.Header.Set("Authorization", "InvalidFormat token")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAdminAuthRequireRole(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	authConfig := auth.Config{
		SecretKey:        "test-secret-key-for-require-role",
		RefreshSecretKey: "test-refresh-secret-key",
		TokenExpiry:      1 * time.Hour,
		RefreshExpiry:    24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := NewAdminAuthMiddleware(authMiddleware, AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	claims := &auth.Claims{
		UserID:    "admin-user-456",
		Email:     "admin2@example.com",
		Roles:     []string{"admin", "editor"},
		DeviceID:  "device-456",
		SessionID: "session-456",
	}
	claims.RegisteredClaims.ExpiresAt = nil

	token := generateTestToken(authMiddleware, claims)

	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Set("user_roles", claims.Roles)
		c.Set("session_id", claims.SessionID)
		c.Set("device_id", claims.DeviceID)
		c.Next()
	})
	router.GET("/admin/test", adminAuthMiddleware.RequireRole("editor"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "editor access granted"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAdminAuthRequireRoleInsufficient(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	authConfig := auth.Config{
		SecretKey:        "test-secret-key-for-insufficient-role",
		RefreshSecretKey: "test-refresh-secret-key",
		TokenExpiry:      1 * time.Hour,
		RefreshExpiry:    24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	adminAuthMiddleware := NewAdminAuthMiddleware(authMiddleware, AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", "user-123")
		c.Set("user_email", "user@example.com")
		c.Set("user_roles", []string{"viewer"})
		c.Set("session_id", "session-123")
		c.Set("device_id", "device-123")
		c.Next()
	})
	router.GET("/admin/test", adminAuthMiddleware.RequireRole("editor"), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "editor access granted"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/admin/test", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func generateTestToken(authMiddleware *auth.Middleware, claims *auth.Claims) string {
	token, _ := authMiddleware.GenerateToken(&models.UserClaims{
		UserID:    claims.UserID,
		Email:     claims.Email,
		Roles:     claims.Roles,
		DeviceID:  claims.DeviceID,
		SessionID: claims.SessionID,
		Exp:       0,
	})
	return token
}
