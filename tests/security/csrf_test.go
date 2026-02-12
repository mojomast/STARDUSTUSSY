package penetration

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

type CSRFTestServer struct {
	router *gin.Engine
	csrf   *middleware.CSRFMiddleware
	logger *zap.Logger
	redis  *redis.Client
}

func setupCSRFTestServer(t *testing.T) *CSRFTestServer {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	redisConfig := redis.Config{
		Addr:     "localhost:6379",
		Password: "",
		DB:       15,
	}

	redisClient, err := redis.NewClient(redisConfig, logger)
	if err != nil {
		t.Skip("Redis not available, skipping CSRF tests")
	}

	csrfConfig := middleware.CSRFConfig{
		TokenLength:    32,
		TokenTTL:       24 * time.Hour,
		CookieName:     "csrf_token",
		HeaderName:     "X-CSRF-Token",
		SecureCookie:   false,
		SameSite:       "Lax",
		CookieDomain:   "",
		AllowedMethods: []string{"GET", "HEAD", "OPTIONS"},
	}

	csrfMW := middleware.NewCSRFMiddleware(redisClient, csrfConfig, logger)

	router := gin.New()
	router.Use(csrfMW.Middleware())

	router.GET("/public", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "public"})
	})

	router.POST("/data", func(c *gin.Context) {
		var data map[string]interface{}
		if err := c.ShouldBindJSON(&data); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "success", "data": data})
	})

	router.DELETE("/data/:id", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"deleted": c.Param("id")})
	})

	router.GET("/csrf-token", func(c *gin.Context) {
		sessionID := c.GetHeader("X-Session-ID")
		if sessionID == "" {
			sessionID = "test-session-123"
		}
		token, err := csrfMW.GenerateToken(c, sessionID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"csrf_token": token})
	})

	return &CSRFTestServer{
		router: router,
		csrf:   csrfMW,
		logger: logger,
		redis:  redisClient,
	}
}

func generateRandomString(length int) string {
	b := make([]byte, length)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)[:length]
}

func TestCSRF_TokenPresence(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("CSRF Token in GET Request", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/public", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		csrfCookie := w.Result().Cookies()
		hasCSRFCookie := false
		for _, cookie := range csrfCookie {
			if cookie.Name == "csrf_token" {
				hasCSRFCookie = true
				assert.NotEmpty(t, cookie.Value, "CSRF token should not be empty")
				break
			}
		}
		assert.True(t, hasCSRFCookie, "CSRF token cookie should be set")
	})

	t.Run("CSRF Token Endpoint", func(t *testing.T) {
		sessionID := "test-session-456"
		req := httptest.NewRequest("GET", "/csrf-token", nil)
		req.Header.Set("X-Session-ID", sessionID)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := w.Body.UnmarshalJSON()
		if err != nil {
			err = w.Body.UnmarshalJSON()
		}

		if err == nil {
			token, ok := response["csrf_token"].(string)
			assert.True(t, ok, "CSRF token should be in response")
			assert.NotEmpty(t, token, "CSRF token should not be empty")
		}
	})
}

func TestCSRF_TokenValidation(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("Valid CSRF Token", func(t *testing.T) {
		sessionID := "test-session-valid"
		csrfToken := generateRandomString(32)

		err := ts.redis.Set(nil, "csrf:"+sessionID, csrfToken, 24*time.Hour)
		if err != nil {
			t.Skip("Redis not available")
		}

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.Header.Set("X-Session-ID", sessionID)
		req.Header.Set("X-CSRF-Token", csrfToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Request with valid CSRF token should succeed")
	})

	t.Run("Missing CSRF Token", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.Header.Set("X-Session-ID", "test-session-missing")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Request without CSRF token should be rejected")
		var response map[string]interface{}
		err := w.Body.UnmarshalJSON()
		if err == nil {
			assert.Contains(t, response["error"], "CSRF token")
		}
	})

	t.Run("Invalid CSRF Token", func(t *testing.T) {
		sessionID := "test-session-invalid"
		validToken := generateRandomString(32)
		ts.redis.Set(nil, "csrf:"+sessionID, validToken, 24*time.Hour)

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.Header.Set("X-Session-ID", sessionID)
		req.Header.Set("X-CSRF-Token", "wrong-token-12345")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Request with invalid CSRF token should be rejected")
	})

	t.Run("Empty CSRF Token", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.Header.Set("X-Session-ID", "test-session-empty")
		req.Header.Set("X-CSRF-Token", "")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Request with empty CSRF token should be rejected")
	})
}

func TestCSRF_TokenExpiry(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("Expired CSRF Token", func(t *testing.T) {
		sessionID := "test-session-expired"
		csrfToken := generateRandomString(32)

		ts.redis.Set(nil, "csrf:"+sessionID, csrfToken, time.Nanosecond)
		time.Sleep(10 * time.Millisecond)

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.Header.Set("X-Session-ID", sessionID)
		req.Header.Set("X-CSRF-Token", csrfToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Request with expired CSRF token should be rejected")
	})
}

func TestCSRF_CookieTokenMatch(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("Cookie CSRF Token", func(t *testing.T) {
		sessionID := "test-session-cookie"
		csrfToken := generateRandomString(32)

		ts.redis.Set(nil, "csrf:"+sessionID, csrfToken, 24*time.Hour)

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.AddCookie(&http.Cookie{
			Name:  "csrf_token",
			Value: csrfToken,
		})
		req.Header.Set("X-Session-ID", sessionID)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Request with matching cookie CSRF token should succeed")
	})

	t.Run("Cookie and Header Token Mismatch", func(t *testing.T) {
		sessionID := "test-session-mismatch"
		cookieToken := generateRandomString(32)
		headerToken := generateRandomString(32)

		ts.redis.Set(nil, "csrf:"+sessionID, cookieToken, 24*time.Hour)

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.AddCookie(&http.Cookie{
			Name:  "csrf_token",
			Value: cookieToken,
		})
		req.Header.Set("X-Session-ID", sessionID)
		req.Header.Set("X-CSRF-Token", headerToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Request with mismatched tokens should be rejected")
	})
}

func TestCSRF_MethodBypass(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("GET Method No Token Required", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/public", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "GET request should succeed without CSRF token")
	})

	t.Run("HEAD Method No Token Required", func(t *testing.T) {
		req := httptest.NewRequest("HEAD", "/public", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "HEAD request should succeed without CSRF token")
	})

	t.Run("OPTIONS Method No Token Required", func(t *testing.T) {
		req := httptest.NewRequest("OPTIONS", "/public", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "OPTIONS request should succeed without CSRF token")
	})

	t.Run("POST Method Token Required", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "POST request without CSRF token should be rejected")
	})

	t.Run("DELETE Method Token Required", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/data/123", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "DELETE request without CSRF token should be rejected")
	})
}

func TestCSRF_SessionTokenBinding(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("Token Bound to Session ID", func(t *testing.T) {
		session1Token := generateRandomString(32)
		session2Token := generateRandomString(32)

		ts.redis.Set(nil, "csrf:session-1", session1Token, 24*time.Hour)
		ts.redis.Set(nil, "csrf:session-2", session2Token, 24*time.Hour)

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.Header.Set("X-Session-ID", "session-2")
		req.Header.Set("X-CSRF-Token", session1Token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Token from different session should be rejected")
	})
}

func TestCSRF_CSRFAttackSimulation(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("Cross-Site POST Without Token", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"attack": "csrf"}`))
		req.Header.Set("Origin", "https://evil.com")
		req.Header.Set("Referer", "https://evil.com/attack")
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Cross-site POST without CSRF token should be rejected")
	})

	t.Run("Forged Token Attack", func(t *testing.T) {
		forgedToken := generateRandomString(32)
		sessionID := "test-session-forged"

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"attack": "forged"}`))
		req.Header.Set("X-Session-ID", sessionID)
		req.Header.Set("X-CSRF-Token", forgedToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusForbidden, w.Code, "Forged CSRF token should be rejected")
	})
}

func TestCSRF_TokenReuse(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("Multiple Requests with Same Token", func(t *testing.T) {
		sessionID := "test-session-reuse"
		csrfToken := generateRandomString(32)

		ts.redis.Set(nil, "csrf:"+sessionID, csrfToken, 24*time.Hour)

		for i := 0; i < 5; i++ {
			req := httptest.NewRequest("POST", "/data", strings.NewReader(fmt.Sprintf(`{"request": %d}`, i)))
			req.Header.Set("X-Session-ID", sessionID)
			req.Header.Set("X-CSRF-Token", csrfToken)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code, fmt.Sprintf("Request %d with same token should succeed", i))
		}
	})
}

func TestCSRF_DoubleSubmitCookie(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("Double Submit Cookie Pattern", func(t *testing.T) {
		sessionID := "test-session-doublesubmit"
		csrfToken := generateRandomString(32)

		ts.redis.Set(nil, "csrf:"+sessionID, csrfToken, 24*time.Hour)

		req := httptest.NewRequest("POST", "/data", strings.NewReader(`{"key": "value"}`))
		req.AddCookie(&http.Cookie{
			Name:  "csrf_token",
			Value: csrfToken,
		})
		req.Header.Set("X-Session-ID", sessionID)
		req.Header.Set("X-CSRF-Token", csrfToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Double submit cookie pattern should work")
	})
}

func TestCSRF_SameSiteCookie(t *testing.T) {
	ts := setupCSRFTestServer(t)

	t.Run("SameSite Cookie Attribute", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/public", nil)
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		cookies := w.Result().Cookies()
		csrfCookieFound := false
		for _, cookie := range cookies {
			if cookie.Name == "csrf_token" {
				csrfCookieFound = true
				assert.NotEmpty(t, cookie.SameSite, "SameSite attribute should be set")
				assert.Equal(t, http.SameSiteLaxMode, cookie.SameSite, "Default SameSite should be Lax")
				break
			}
		}
		assert.True(t, csrfCookieFound, "CSRF cookie should be set")
	})
}
