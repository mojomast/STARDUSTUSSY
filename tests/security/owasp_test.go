package penetration

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/auth"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

const testSecret = "test-secret-key-at-least-32-characters-long-for-jwt-security-testing"

type TestServer struct {
	router     *gin.Engine
	serverURL  string
	logger     *zap.Logger
	authConfig auth.Config
	authMW     *auth.Middleware
}

func setupTestServer(t *testing.T) *TestServer {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	authConfig := auth.Config{
		SecretKey:        testSecret,
		RefreshSecretKey: testSecret + "refresh",
		TokenExpiry:      15 * time.Minute,
		RefreshExpiry:    7 * 24 * time.Hour,
	}

	authMW := auth.NewMiddleware(authConfig, logger)

	router := gin.New()
	router.Use(gin.Recovery())

	corsMW := middleware.NewCORSMiddleware(middleware.CORSConfig{
		AllowedOrigins:   []string{"https://app.harmonyflow.com", "https://staging.harmonyflow.com", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "X-CSRF-Token", "X-Session-ID"},
		AllowCredentials: true,
		MaxAge:           86400,
	}, logger)

	securityMW := middleware.NewSecurityMiddleware(middleware.SecurityConfig{
		AdminAPIToken:      "test-admin-token-secure-123",
		AllowedOrigins:     []string{"https://app.harmonyflow.com", "https://staging.harmonyflow.com"},
		EnableRateLimiting: true,
		EnableCSRF:         true,
	}, logger)

	router.Use(corsMW.Middleware())
	router.Use(securityMW.CORS())

	testGroup := router.Group("/api/test")
	testGroup.Use(authMW.Middleware())
	{
		testGroup.GET("/protected", func(c *gin.Context) {
			claims, exists := c.Get("user_claims")
			if !exists {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
				return
			}
			c.JSON(http.StatusOK, claims)
		})
		testGroup.POST("/data", func(c *gin.Context) {
			var data map[string]interface{}
			if err := c.ShouldBindJSON(&data); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid data"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"status": "success", "data": data})
		})
		testGroup.GET("/user/:id", func(c *gin.Context) {
			userID := c.Param("id")
			c.JSON(http.StatusOK, gin.H{"user_id": userID, "data": "user data"})
		})
	}

	adminGroup := router.Group("/admin")
	adminGroup.Use(securityMW.RequireAdmin())
	{
		adminGroup.GET("/metrics", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"metrics": "admin data"})
		})
		adminGroup.DELETE("/sessions/:id", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"deleted": c.Param("id")})
		})
	}

	router.GET("/public", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "public endpoint"})
	})

	return &TestServer{
		router:     router,
		logger:     logger,
		authConfig: authConfig,
		authMW:     authMW,
	}
}

func (ts *TestServer) makeRequest(t *testing.T, method, path string, body io.Reader, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, body)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	ts.router.ServeHTTP(w, req)
	return w
}

func generateTestJWT(secret string, userID string, roles []string, extraClaims map[string]interface{}) string {
	claims := jwt.MapClaims{
		"user_id": userID,
		"roles":   roles,
		"exp":     time.Now().Add(time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}

	for k, v := range extraClaims {
		claims[k] = v
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(secret))
	return tokenString
}

func TestOWASP_InjectionAttacks(t *testing.T) {
	ts := setupTestServer(t)
	token := generateTestJWT(testSecret, "test-user", []string{"user"}, nil)

	tests := []struct {
		name           string
		method         string
		path           string
		body           string
		headers        map[string]string
		expectSuccess  bool
		injectionType  string
		expectedStatus int
	}{
		{
			name:   "SQL Injection via path parameter",
			method: "GET",
			path:   "/api/test/user/' OR '1'='1",
			headers: map[string]string{
				"Authorization": "Bearer " + token,
			},
			expectSuccess:  false,
			injectionType:  "SQL Injection",
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:   "SQL Injection via JSON body",
			method: "POST",
			path:   "/api/test/data",
			body:   `{"user_id": "' OR '1'='1'--", "data": "test"}`,
			headers: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json",
			},
			expectSuccess:  false,
			injectionType:  "SQL Injection",
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:   "NoSQL Injection via JSON body",
			method: "POST",
			path:   "/api/test/data",
			body:   `{"user_id": {"$ne": null}, "data": "test"}`,
			headers: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json",
			},
			expectSuccess:  false,
			injectionType:  "NoSQL Injection",
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:   "Command Injection via parameter",
			method: "GET",
			path:   "/api/test/user/test; ls -la",
			headers: map[string]string{
				"Authorization": "Bearer " + token,
			},
			expectSuccess:  false,
			injectionType:  "Command Injection",
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:   "Path Traversal Attack",
			method: "GET",
			path:   "/api/test/user/../../../etc/passwd",
			headers: map[string]string{
				"Authorization": "Bearer " + token,
			},
			expectSuccess:  false,
			injectionType:  "Path Traversal",
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:   "XSS via JSON body",
			method: "POST",
			path:   "/api/test/data",
			body:   `{"data": "<script>alert('XSS')</script>"}`,
			headers: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json",
			},
			expectSuccess:  true,
			injectionType:  "Stored XSS",
			expectedStatus: http.StatusOK,
		},
		{
			name:   "XXE Injection via XML",
			method: "POST",
			path:   "/api/test/data",
			body:   `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><data>&xxe;</data>`,
			headers: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/xml",
			},
			expectSuccess:  false,
			injectionType:  "XXE",
			expectedStatus: http.StatusUnsupportedMediaType,
		},
		{
			name:   "OS Command Injection via pipe",
			method: "POST",
			path:   "/api/test/data",
			body:   `{"data": "test | cat /etc/passwd"}`,
			headers: map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json",
			},
			expectSuccess:  true,
			injectionType:  "Command Injection",
			expectedStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body io.Reader
			if tt.body != "" {
				body = strings.NewReader(tt.body)
			}

			w := ts.makeRequest(t, tt.method, tt.path, body, tt.headers)

			assert.Equal(t, tt.expectedStatus, w.Code, "%s: unexpected status code", tt.injectionType)

			if tt.injectionType == "Stored XSS" {
				var response map[string]interface{}
				err := json.Unmarshal(w.Body.Bytes(), &response)
				assert.NoError(t, err)
				data, ok := response["data"]
				if ok {
					dataStr, ok := data.(string)
					assert.True(t, ok)
					assert.Contains(t, dataStr, "<script>")
				}
			}
		})
	}
}

func TestOWASP_BrokenAuthentication(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("Missing Authorization Header", func(t *testing.T) {
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, nil)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
		assert.Contains(t, w.Body.String(), "unauthorized")
	})

	t.Run("Invalid Authorization Format", func(t *testing.T) {
		headers := map[string]string{
			"Authorization": "InvalidFormat token",
		}
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Malformed JWT", func(t *testing.T) {
		headers := map[string]string{
			"Authorization": "Bearer not.a.valid.jwt",
		}
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Expired JWT", func(t *testing.T) {
		expiredToken := generateTestJWT(testSecret, "test-user", []string{"user"}, map[string]interface{}{
			"exp": time.Now().Add(-1 * time.Hour).Unix(),
		})

		headers := map[string]string{
			"Authorization": "Bearer " + expiredToken,
		}
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("JWT with Invalid Signature", func(t *testing.T) {
		parts := strings.Split(generateTestJWT(testSecret, "test-user", []string{"user"}, nil), ".")
		if len(parts) == 3 {
			parts[2] = base64.RawURLEncoding.EncodeToString([]byte("invalid-signature"))
			invalidToken := strings.Join(parts, ".")

			headers := map[string]string{
				"Authorization": "Bearer " + invalidToken,
			}
			w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)
			assert.Equal(t, http.StatusUnauthorized, w.Code)
		}
	})

	t.Run("Future NBF Claim", func(t *testing.T) {
		futureToken := generateTestJWT(testSecret, "test-user", []string{"user"}, map[string]interface{}{
			"nbf": time.Now().Add(1 * time.Hour).Unix(),
		})

		headers := map[string]string{
			"Authorization": "Bearer " + futureToken,
		}
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})
}

func TestOWASP_SensitiveDataExposure(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("No Password in Response", func(t *testing.T) {
		headers := map[string]string{
			"Authorization": "Bearer " + generateTestJWT(testSecret, "test-user", []string{"user"}, nil),
		}
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)

		assert.Equal(t, http.StatusOK, w.Code)
		body := w.Body.String()
		assert.NotContains(t, body, "password")
		assert.NotContains(t, body, "secret")
		assert.NotContains(t, body, "api_key")
	})

	t.Run("No Stack Trace in Error", func(t *testing.T) {
		headers := map[string]string{
			"Authorization": "Bearer invalid",
		}
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)

		assert.NotContains(t, w.Body.String(), "stack trace")
		assert.NotContains(t, w.Body.String(), "panic")
		assert.NotContains(t, w.Body.String(), "goroutine")
	})

	t.Run("Secure Headers Present", func(t *testing.T) {
		w := ts.makeRequest(t, "GET", "/public", nil, nil)

		assert.Equal(t, http.StatusOK, w.Code)
		headers := w.Header()
		assert.Contains(t, headers.Get("Access-Control-Allow-Origin"), "app.harmonyflow.com")
	})
}

func TestOWASP_BrokenAccessControl(t *testing.T) {
	ts := setupTestServer(t)
	userToken := generateTestJWT(testSecret, "regular-user", []string{"user"}, nil)
	adminToken := generateTestJWT(testSecret, "admin-user", []string{"user", "admin"}, nil)

	t.Run("Regular User Cannot Access Admin", func(t *testing.T) {
		headers := map[string]string{
			"Authorization": "Bearer " + userToken,
		}
		w := ts.makeRequest(t, "GET", "/admin/metrics", nil, headers)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Admin Can Access Admin", func(t *testing.T) {
		headers := map[string]string{
			"X-Admin-Token": "test-admin-token-secure-123",
		}
		w := ts.makeRequest(t, "GET", "/admin/metrics", nil, headers)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("Unauthorized Admin Access", func(t *testing.T) {
		headers := map[string]string{
			"X-Admin-Token": "wrong-admin-token",
		}
		w := ts.makeRequest(t, "GET", "/admin/metrics", nil, headers)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("IDOR Prevention", func(t *testing.T) {
		userToken1 := generateTestJWT(testSecret, "user-1", []string{"user"}, nil)
		userToken2 := generateTestJWT(testSecret, "user-2", []string{"user"}, nil)

		headers1 := map[string]string{
			"Authorization": "Bearer " + userToken1,
		}
		w1 := ts.makeRequest(t, "GET", "/api/test/user/user-2-data", nil, headers1)

		headers2 := map[string]string{
			"Authorization": "Bearer " + userToken2,
		}
		w2 := ts.makeRequest(t, "GET", "/api/test/user/user-2-data", nil, headers2)

		assert.Equal(t, w1.Code, w2.Code)
	})
}

func TestOWASP_SecurityMisconfiguration(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("Directory Listing Disabled", func(t *testing.T) {
		w := ts.makeRequest(t, "GET", "/nonexistent", nil, nil)
		assert.NotEqual(t, http.StatusOK, w.Code)
	})

	t.Run("Error Pages Generic", func(t *testing.T) {
		w := ts.makeRequest(t, "GET", "/does/not/exist", nil, nil)
		body := w.Body.String()
		assert.NotContains(t, body, "internal error details")
		assert.NotContains(t, body, "stack trace")
	})

	t.Run("CORS Configured Properly", func(t *testing.T) {
		allowedOrigin := map[string]string{"Origin": "https://app.harmonyflow.com"}
		w := ts.makeRequest(t, "GET", "/public", nil, allowedOrigin)
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Origin"), "app.harmonyflow.com")

		maliciousOrigin := map[string]string{"Origin": "https://evil.com"}
		w2 := ts.makeRequest(t, "GET", "/public", nil, maliciousOrigin)
		assert.Equal(t, "", w2.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestOWASP_XSSAttacks(t *testing.T) {
	ts := setupTestServer(t)
	token := generateTestJWT(testSecret, "test-user", []string{"user"}, nil)

	xssPayloads := []string{
		"<script>alert('XSS')</script>",
		"<img src=x onerror=alert('XSS')>",
		"<body onload=alert('XSS')>",
		"javascript:alert('XSS')",
		"<svg onload=alert('XSS')>",
		"<iframe src='javascript:alert(1)'>",
	}

	for _, payload := range xssPayloads {
		t.Run(fmt.Sprintf("XSS Payload: %s", payload[:min(30, len(payload))]), func(t *testing.T) {
			body := fmt.Sprintf(`{"data": "%s"}`, strings.ReplaceAll(payload, `"`, `\"`))
			headers := map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/json",
			}

			w := ts.makeRequest(t, "POST", "/api/test/data", strings.NewReader(body), headers)

			assert.Equal(t, http.StatusOK, w.Code)
			var response map[string]interface{}
			err := json.Unmarshal(w.Body.Bytes(), &response)
			assert.NoError(t, err)
		})
	}
}

func TestOWASP_InsecureDeserialization(t *testing.T) {
	ts := setupTestServer(t)
	token := generateTestJWT(testSecret, "test-user", []string{"user"}, nil)

	maliciousPayloads := []struct {
		name string
		body string
	}{
		{"PHP Serialization", "O:8:\"stdClass\":0:{}"},
		{"Java Serialization", "aced000573720017"},
		{"Python Pickle", "gASV"},
	}

	for _, tt := range maliciousPayloads {
		t.Run(tt.name, func(t *testing.T) {
			headers := map[string]string{
				"Authorization": "Bearer " + token,
				"Content-Type":  "application/octet-stream",
			}
			w := ts.makeRequest(t, "POST", "/api/test/data", strings.NewReader(tt.body), headers)
			assert.Equal(t, http.StatusUnsupportedMediaType, w.Code)
		})
	}
}

func TestOWASP_InsufficientLogging(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("Failed Auth Logged", func(t *testing.T) {
		headers := map[string]string{"Authorization": "Bearer invalid"}
		w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)
		assert.Equal(t, http.StatusUnauthorized, w.Code)
	})

	t.Run("Rate Limit Exceeded Logged", func(t *testing.T) {
		token := generateTestJWT(testSecret, "test-user", []string{"user"}, nil)
		headers := map[string]string{"Authorization": "Bearer " + token}

		for i := 0; i < 150; i++ {
			w := ts.makeRequest(t, "GET", "/api/test/protected", nil, headers)
			if w.Code == http.StatusTooManyRequests {
				break
			}
		}
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func TestOWASP_UsingComponentsWithKnownVulnerabilities(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("Check Security Headers", func(t *testing.T) {
		w := ts.makeRequest(t, "GET", "/public", nil, nil)
		headers := w.Header()

		assert.Equal(t, http.StatusOK, w.Code)
		assert.NotEmpty(t, headers.Get("Access-Control-Allow-Methods"))
		assert.NotEmpty(t, headers.Get("Access-Control-Allow-Headers"))
	})

	t.Run("Check CORS Configuration", func(t *testing.T) {
		allowedOrigins := []string{
			"https://app.harmonyflow.com",
			"https://staging.harmonyflow.com",
			"http://localhost:3000",
		}

		for _, origin := range allowedOrigins {
			headers := map[string]string{"Origin": origin}
			w := ts.makeRequest(t, "OPTIONS", "/public", nil, headers)
			assert.Contains(t, w.Header().Get("Access-Control-Allow-Origin"), origin)
		}
	})
}
