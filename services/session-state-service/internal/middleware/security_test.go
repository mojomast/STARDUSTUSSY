package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func TestSecurityMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	securityConfig := SecurityConfig{
		AdminAPIToken:      "test-admin-token-123",
		AllowedOrigins:     []string{"localhost", "example.com"},
		EnableRateLimiting: false,
		EnableCSRF:         false,
	}
	securityMiddleware := NewSecurityMiddleware(securityConfig, logger)

	t.Run("RequireAdmin with valid token", func(t *testing.T) {
		router := gin.New()
		router.GET("/admin/test", securityMiddleware.RequireAdmin(), func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/test", nil)
		req.Header.Set("X-Admin-Token", "test-admin-token-123")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("RequireAdmin with invalid token", func(t *testing.T) {
		router := gin.New()
		router.GET("/admin/test", securityMiddleware.RequireAdmin(), func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/test", nil)
		req.Header.Set("X-Admin-Token", "invalid-token")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("RequireAdmin without token", func(t *testing.T) {
		router := gin.New()
		router.GET("/admin/test", securityMiddleware.RequireAdmin(), func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/admin/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("CORS with allowed origin", func(t *testing.T) {
		router := gin.New()
		router.Use(securityMiddleware.CORS())
		router.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		req.Header.Set("Origin", "localhost")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "localhost", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("CORS with disallowed origin", func(t *testing.T) {
		router := gin.New()
		router.Use(securityMiddleware.CORS())
		router.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		req.Header.Set("Origin", "http://evil.com")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("CSRF middleware - pass-through (disabled)", func(t *testing.T) {
		router := gin.New()
		router.Use(securityMiddleware.CSRF())
		router.POST("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("Rate limit middleware - pass-through (disabled)", func(t *testing.T) {
		router := gin.New()
		router.Use(securityMiddleware.RateLimit())
		router.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestCSRFProtectionRegression(t *testing.T) {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	securityConfig := SecurityConfig{
		AdminAPIToken:  "test-token",
		AllowedOrigins: []string{"localhost"},
		EnableCSRF:     false,
	}
	securityMiddleware := NewSecurityMiddleware(securityConfig, logger)

	t.Run("POST request should pass when CSRF is disabled", func(t *testing.T) {
		router := gin.New()
		router.POST("/api/data", securityMiddleware.CSRF(), func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "success"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/data", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})
}

func TestRateLimitingRegression(t *testing.T) {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	securityConfig := SecurityConfig{
		AdminAPIToken:      "test-token",
		AllowedOrigins:     []string{"localhost"},
		EnableRateLimiting: false,
	}
	securityMiddleware := NewSecurityMiddleware(securityConfig, logger)

	t.Run("Multiple requests should pass when rate limiting is disabled", func(t *testing.T) {
		router := gin.New()
		router.Use(securityMiddleware.RateLimit())
		router.GET("/api/data", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "success"})
		})

		for i := 0; i < 150; i++ {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", "/api/data", nil)
			router.ServeHTTP(w, req)
			assert.Equal(t, http.StatusOK, w.Code, "Request %d should pass", i)
		}
	})
}
