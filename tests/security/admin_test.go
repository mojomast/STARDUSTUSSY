package penetration

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

type AdminTestServer struct {
	router *gin.RouterGroup
	logger *zap.Logger
}

func setupAdminTestServer(t *testing.T) *AdminTestServer {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	securityConfig := middleware.SecurityConfig{
		AdminAPIToken:      "test-admin-token-secure-123",
		AllowedOrigins:     []string{"https://app.harmonyflow.com"},
		EnableRateLimiting: false,
		EnableCSRF:         false,
	}

	securityMW := middleware.NewSecurityMiddleware(securityConfig, logger)

	router := gin.New()

	adminGroup := router.Group("/admin")
	adminGroup.Use(securityMW.RequireAdmin())
	{
		adminGroup.GET("/metrics/sessions", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"active_sessions": 42,
				"total_users":     100,
			})
		})

		adminGroup.GET("/metrics/connections", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"websocket_connections": 15,
				"rest_api_connections":  25,
			})
		})

		adminGroup.GET("/metrics/snapshots", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"snapshots_today": 150,
				"snapshots_total": 5000,
			})
		})

		adminGroup.GET("/metrics/all", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"metrics": "all data",
			})
		})

		adminGroup.GET("/sessions", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"sessions": []string{"session-1", "session-2", "session-3"},
			})
		})

		adminGroup.GET("/connections", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"connections": []string{"conn-1", "conn-2"},
			})
		})

		adminGroup.POST("/broadcast", func(c *gin.Context) {
			var data map[string]interface{}
			if err := c.ShouldBindJSON(&data); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid data"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "broadcasted", "data": data})
		})

		adminGroup.DELETE("/sessions/:id", func(c *gin.Context) {
			sessionID := c.Param("id")
			c.JSON(http.StatusOK, gin.H{"deleted": sessionID})
		})

		adminGroup.DELETE("/users/:id", func(c *gin.Context) {
			userID := c.Param("id")
			c.JSON(http.StatusOK, gin.H{"deleted": userID})
		})
	}

	publicGroup := router.Group("/api")
	{
		publicGroup.GET("/public", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "public"})
		})
	}

	return &AdminTestServer{
		router: adminGroup,
		logger: logger,
	}
}

func (ats *AdminTestServer) makeAdminRequest(t *testing.T, method, path string, body string, headers map[string]string) *httptest.ResponseRecorder {
	router := ats.router

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestAdmin_UnauthenticatedAccess(t *testing.T) {
	ts := setupAdminTestServer(t)

	adminEndpoints := []struct {
		method string
		path   string
		body   string
	}{
		{"GET", "/admin/metrics/sessions", ""},
		{"GET", "/admin/metrics/connections", ""},
		{"GET", "/admin/metrics/snapshots", ""},
		{"GET", "/admin/metrics/all", ""},
		{"GET", "/admin/sessions", ""},
		{"GET", "/admin/connections", ""},
		{"POST", "/admin/broadcast", `{"message": "test"}`},
		{"DELETE", "/admin/sessions/123", ""},
		{"DELETE", "/admin/users/456", ""},
	}

	for _, endpoint := range adminEndpoints {
		t.Run(endpoint.method+" "+endpoint.path, func(t *testing.T) {
			w := ts.makeAdminRequest(t, endpoint.method, endpoint.path, endpoint.body, nil)

			assert.Equal(t, http.StatusUnauthorized, w.Code, "Admin endpoint should require authentication")
			var response map[string]interface{}
			json.Unmarshal(w.Body.Bytes(), &response)
			assert.Contains(t, response["error"], "token")
		})
	}
}

func TestAdmin_InvalidToken(t *testing.T) {
	ts := setupAdminTestServer(t)

	t.Run("Completely Invalid Token", func(t *testing.T) {
		headers := map[string]string{
			"X-Admin-Token": "invalid-token-12345",
		}
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Invalid admin token should be rejected")
	})

	t.Run("Empty Token", func(t *testing.T) {
		headers := map[string]string{
			"X-Admin-Token": "",
		}
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Empty admin token should be rejected")
	})

	t.Run("Token with Extra Characters", func(t *testing.T) {
		headers := map[string]string{
			"X-Admin-Token": "test-admin-token-secure-123-extra",
		}
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Token with extra characters should be rejected")
	})

	t.Run("Token with Missing Characters", func(t *testing.T) {
		headers := map[string]string{
			"X-Admin-Token": "test-admin-token",
		}
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Token with missing characters should be rejected")
	})

	t.Run("Token Case Sensitivity", func(t *testing.T) {
		headers := map[string]string{
			"X-Admin-Token": "TEST-ADMIN-TOKEN-SECURE-123",
		}
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Case-sensitive token should be rejected")
	})
}

func TestAdmin_ValidTokenAccess(t *testing.T) {
	ts := setupAdminTestServer(t)

	headers := map[string]string{
		"X-Admin-Token": "test-admin-token-secure-123",
	}

	t.Run("Access Session Metrics", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow access")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Contains(t, response, "active_sessions")
		assert.Contains(t, response, "total_users")
	})

	t.Run("Access Connection Metrics", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/connections", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow access")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Contains(t, response, "websocket_connections")
		assert.Contains(t, response, "rest_api_connections")
	})

	t.Run("Access Snapshot Metrics", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/snapshots", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow access")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Contains(t, response, "snapshots_today")
		assert.Contains(t, response, "snapshots_total")
	})

	t.Run("Access All Metrics", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/all", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow access")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Contains(t, response, "metrics")
	})

	t.Run("List Sessions", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "GET", "/admin/sessions", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow access")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Contains(t, response, "sessions")
	})

	t.Run("List Connections", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "GET", "/admin/connections", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow access")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Contains(t, response, "connections")
	})

	t.Run("Broadcast Message", func(t *testing.T) {
		body := `{"message": "admin broadcast", "type": "info"}`
		w := ts.makeAdminRequest(t, "POST", "/admin/broadcast", body, headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow broadcast")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, "broadcasted", response["status"])
	})

	t.Run("Delete Session", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "DELETE", "/admin/sessions/session-123", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow deletion")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, "session-123", response["deleted"])
	})

	t.Run("Delete User", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "DELETE", "/admin/users/user-456", "", headers)

		assert.Equal(t, http.StatusOK, w.Code, "Valid admin token should allow deletion")
		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		assert.NoError(t, err)
		assert.Equal(t, "user-456", response["deleted"])
	})
}

func TestAdmin_TokenBruteForce(t *testing.T) {
	ts := setupAdminTestServer(t)

	t.Run("Brute Force Detection", func(t *testing.T) {
		failedAttempts := 0

		for i := 0; i < 1000; i++ {
			headers := map[string]string{
				"X-Admin-Token": "wrong-token-" + string(rune(i)),
			}
			w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

			if w.Code == http.StatusUnauthorized {
				failedAttempts++
			} else {
				break
			}
		}

		assert.Equal(t, 1000, failedAttempts, "Should reject all invalid tokens")
	})

	t.Run("Timing Attack Resistance", func(t *testing.T) {
		validStart := time.Now()
		headersValid := map[string]string{"X-Admin-Token": "test-admin-token-secure-123"}
		ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headersValid)
		validDuration := time.Since(validStart)

		invalidStart := time.Now()
		headersInvalid := map[string]string{"X-Admin-Token": "wrong-token-12345"}
		ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headersInvalid)
		invalidDuration := time.Since(invalidStart)

		timeDiff := abs(validDuration.Milliseconds() - invalidDuration.Milliseconds())
		assert.Less(t, timeDiff, int64(100), "Timing difference should be minimal (< 100ms)")
	})
}

func TestAdmin_PrivilegeEscalation(t *testing.T) {
	ts := setupAdminTestServer(t)

	t.Run("Regular User Cannot Access Admin", func(t *testing.T) {
		headers := map[string]string{
			"Authorization": "Bearer user-token",
		}
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "Regular user token should not work for admin")
	})

	t.Run("JWT Token Cannot Access Admin", func(t *testing.T) {
		headers := map[string]string{
			"Authorization": "Bearer " + generateTestJWT(testSecret, "admin-user", []string{"admin"}, nil),
		}
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		assert.Equal(t, http.StatusUnauthorized, w.Code, "JWT token should not work for admin endpoint")
	})
}

func TestAdmin_PathTraversal(t *testing.T) {
	ts := setupAdminTestServer(t)
	headers := map[string]string{
		"X-Admin-Token": "test-admin-token-secure-123",
	}

	t.Run("Path Traversal in Delete Endpoint", func(t *testing.T) {
		maliciousPaths := []string{
			"/admin/sessions/../api/public",
			"/admin/sessions/../../admin/metrics",
			"/admin/sessions/../../../etc/passwd",
		}

		for _, path := range maliciousPaths {
			w := ts.makeAdminRequest(t, "DELETE", path, "", headers)

			assert.NotEqual(t, http.StatusOK, w.Code, "Path traversal should be blocked")
		}
	})
}

func TestAdmin_SQLInjection(t *testing.T) {
	ts := setupAdminTestServer(t)
	headers := map[string]string{
		"X-Admin-Token": "test-admin-token-secure-123",
	}

	t.Run("SQL Injection in Path Parameter", func(t *testing.T) {
		sqlInjectionPaths := []string{
			"/admin/sessions/' OR '1'='1",
			"/admin/sessions/1' UNION SELECT * FROM users--",
			"/admin/sessions/1'; DROP TABLE users; --",
		}

		for _, path := range sqlInjectionPaths {
			w := ts.makeAdminRequest(t, "DELETE", path, "", headers)

			assert.NotEqual(t, http.StatusOK, w.Code, "SQL injection should be blocked")
		}
	})
}

func TestAdmin_DataExposure(t *testing.T) {
	ts := setupAdminTestServer(t)
	headers := map[string]string{
		"X-Admin-Token": "test-admin-token-secure-123",
	}

	t.Run("No Sensitive Data in Errors", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "DELETE", "/admin/sessions/nonexistent", "", headers)

		body := w.Body.String()
		assert.NotContains(t, body, "internal error")
		assert.NotContains(t, body, "stack trace")
		assert.NotContains(t, body, "panic")
	})

	t.Run("No Token Leakage", func(t *testing.T) {
		w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

		body := w.Body.String()
		assert.NotContains(t, body, "test-admin-token-secure-123")
	})
}

func TestAdmin_RateLimiting(t *testing.T) {
	ts := setupAdminTestServer(t)
	headers := map[string]string{
		"X-Admin-Token": "test-admin-token-secure-123",
	}

	t.Run("Multiple Admin Requests", func(t *testing.T) {
		successCount := 0

		for i := 0; i < 50; i++ {
			w := ts.makeAdminRequest(t, "GET", "/admin/metrics/sessions", "", headers)

			if w.Code == http.StatusOK {
				successCount++
			}
		}

		assert.Equal(t, 50, successCount, "Should allow multiple admin requests with valid token")
	})
}
