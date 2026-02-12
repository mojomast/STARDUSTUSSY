package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func TestCORSMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name         string
		origin       string
		allowed      bool
		expectedCode int
	}{
		{
			name:         "AllowedOrigin",
			origin:       "https://staging.harmonyflow.io",
			allowed:      true,
			expectedCode: http.StatusOK,
		},
		{
			name:         "AllowedOriginProduction",
			origin:       "https://production.harmonyflow.io",
			allowed:      true,
			expectedCode: http.StatusOK,
		},
		{
			name:         "AllowedOriginLocalhost",
			origin:       "http://localhost:3000",
			allowed:      true,
			expectedCode: http.StatusOK,
		},
		{
			name:         "DisallowedOrigin",
			origin:       "https://evil.com",
			allowed:      false,
			expectedCode: http.StatusOK,
		},
		{
			name:         "NoOrigin",
			origin:       "",
			allowed:      true,
			expectedCode: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger := zap.NewNop()
			corsMiddleware := NewCORSMiddleware(CORSConfig{
				AllowedOrigins: []string{
					"https://staging.harmonyflow.io",
					"https://production.harmonyflow.io",
					"http://localhost:3000",
				},
				AllowCredentials: true,
				Debug:            false,
			}, logger)

			router := gin.New()
			router.Use(corsMiddleware.Middleware())
			router.GET("/test", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{"message": "ok"})
			})

			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", "/test", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			router.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedCode, w.Code)

			if tt.allowed && tt.origin != "" {
				assert.Equal(t, tt.origin, w.Header().Get("Access-Control-Allow-Origin"))
				assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))
			}
		})
	}
}

func TestCORSPreflight(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	corsMiddleware := NewCORSMiddleware(CORSConfig{
		AllowedOrigins:   []string{"https://staging.harmonyflow.io"},
		AllowCredentials: true,
	}, logger)

	router := gin.New()
	router.Use(corsMiddleware.Middleware())
	router.POST("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("OPTIONS", "/test", nil)
	req.Header.Set("Origin", "https://staging.harmonyflow.io")
	req.Header.Set("Access-Control-Request-Method", "POST")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Equal(t, "https://staging.harmonyflow.io", w.Header().Get("Access-Control-Allow-Origin"))
	assert.Contains(t, w.Header().Get("Access-Control-Allow-Methods"), "POST")
}

func TestCORSWildcard(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	corsMiddleware := NewCORSMiddleware(CORSConfig{
		AllowedOrigins:   []string{"*"},
		AllowCredentials: false,
	}, logger)

	router := gin.New()
	router.Use(corsMiddleware.Middleware())
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://any-origin.com")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "*", w.Header().Get("Access-Control-Allow-Origin"))
}

func TestCORSAddOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	corsMiddleware := NewCORSMiddleware(CORSConfig{
		AllowedOrigins: []string{"https://example.com"},
	}, logger)

	corsMiddleware.AddOrigin("https://neworigin.com")

	router := gin.New()
	router.Use(corsMiddleware.Middleware())
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://neworigin.com")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "https://neworigin.com", w.Header().Get("Access-Control-Allow-Origin"))
}

func TestCORSRemoveOrigin(t *testing.T) {
	gin.SetMode(gin.TestMode)

	logger := zap.NewNop()
	corsMiddleware := NewCORSMiddleware(CORSConfig{
		AllowedOrigins: []string{"https://example.com", "https://toberemoved.com"},
	}, logger)

	corsMiddleware.RemoveOrigin("https://toberemoved.com")

	router := gin.New()
	router.Use(corsMiddleware.Middleware())
	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "ok"})
	})

	t.Run("AllowedOrigin", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		req.Header.Set("Origin", "https://example.com")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "https://example.com", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("RemovedOrigin", func(t *testing.T) {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		req.Header.Set("Origin", "https://toberemoved.com")
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestCSRFMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	redisConfig := redis.Config{
		Addr:         "localhost:6379",
		Password:     "",
		DB:           0,
		PoolSize:     10,
		MinIdleConns: 1,
		MaxRetries:   3,
	}

	redisClient, err := redis.NewClient(redisConfig, zap.NewNop())
	if err != nil {
		t.Skip("Redis not available, skipping CSRF test")
	}
	defer redisClient.Close()

	csrfMiddleware := NewCSRFMiddleware(redisClient, CSRFConfig{
		TokenLength:    32,
		TokenTTL:       1 * time.Hour,
		CookieName:     "csrf_token",
		HeaderName:     "X-CSRF-Token",
		SecureCookie:   false,
		SameSite:       "Lax",
		AllowedMethods: []string{"GET", "HEAD", "OPTIONS"},
	}, zap.NewNop())

	t.Run("GETRequestNoCSRFRequired", func(t *testing.T) {
		router := gin.New()
		router.Use(csrfMiddleware.Middleware())
		router.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("POSTRequestWithoutCSRFToken", func(t *testing.T) {
		router := gin.New()
		router.Use(csrfMiddleware.Middleware())
		router.POST("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "ok"})
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestCSRFTokenGeneration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	redisConfig := redis.Config{
		Addr:         "localhost:6379",
		Password:     "",
		DB:           0,
		PoolSize:     10,
		MinIdleConns: 1,
		MaxRetries:   3,
	}

	redisClient, err := redis.NewClient(redisConfig, zap.NewNop())
	if err != nil {
		t.Skip("Redis not available, skipping CSRF token generation test")
	}
	defer redisClient.Close()

	csrfMiddleware := NewCSRFMiddleware(redisClient, CSRFConfig{
		TokenLength: 32,
		TokenTTL:    1 * time.Hour,
	}, zap.NewNop())

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/", nil)

	token, err := csrfMiddleware.GenerateToken(c, "session123")
	assert.NoError(t, err)
	assert.NotEmpty(t, token)
}
