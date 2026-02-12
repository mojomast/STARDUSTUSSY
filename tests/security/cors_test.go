package penetration

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

type CORSTestServer struct {
	router *gin.Engine
	cors   *middleware.CORSMiddleware
	logger *zap.Logger
}

func setupCORSTestServer(t *testing.T) *CORSTestServer {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	corsConfig := middleware.CORSConfig{
		AllowedOrigins:   []string{"https://app.harmonyflow.com", "https://staging.harmonyflow.com", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "X-CSRF-Token", "X-Session-ID"},
		ExposedHeaders:   []string{"X-RateLimit-Limit", "X-CSRF-Token"},
		AllowCredentials: true,
		MaxAge:           86400,
		Debug:            false,
	}

	corsMW := middleware.NewCORSMiddleware(corsConfig, logger)

	router := gin.New()
	router.Use(corsMW.Middleware())

	router.GET("/api/data", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "data"})
	})

	router.POST("/api/data", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "created"})
	})

	router.DELETE("/api/data/:id", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"deleted": c.Param("id")})
	})

	router.GET("/public", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"public": "data"})
	})

	return &CORSTestServer{
		router: router,
		cors:   corsMW,
		logger: logger,
	}
}

func (cts *CORSTestServer) makeRequest(t *testing.T, method, path string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	cts.router.ServeHTTP(w, req)
	return w
}

func TestCORS_AllowedOrigins(t *testing.T) {
	ts := setupCORSTestServer(t)

	allowedOrigins := []string{
		"https://app.harmonyflow.com",
		"https://staging.harmonyflow.com",
		"http://localhost:3000",
	}

	for _, origin := range allowedOrigins {
		t.Run("Allowed Origin: "+origin, func(t *testing.T) {
			headers := map[string]string{"Origin": origin}
			w := ts.makeRequest(t, "GET", "/api/data", headers)

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Equal(t, origin, w.Header().Get("Access-Control-Allow-Origin"), "Origin should be reflected")
			assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"), "Credentials should be allowed")
		})
	}
}

func TestCORS_UnauthorizedOrigins(t *testing.T) {
	ts := setupCORSTestServer(t)

	unauthorizedOrigins := []string{
		"https://evil.com",
		"https://malicious-site.org",
		"https://attacker.net",
		"http://localhost:8080",
		"https://harmonyflow.com",
		"null",
	}

	for _, origin := range unauthorizedOrigins {
		t.Run("Unauthorized Origin: "+origin, func(t *testing.T) {
			headers := map[string]string{"Origin": origin}
			w := ts.makeRequest(t, "GET", "/api/data", headers)

			assert.Equal(t, http.StatusOK, w.Code, "Request should still succeed")
			assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"), "Unauthorized origin should not be reflected")
		})
	}
}

func TestCORS_WildcardOrigin(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Wildcard Not Supported", func(t *testing.T) {
		headers := map[string]string{"Origin": "https://random-site.com"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.NotEqual(t, "*", w.Header().Get("Access-Control-Allow-Origin"), "Should not use wildcard")
		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"), "Unauthorized origin should be rejected")
	})
}

func TestCORS_PreflightRequests(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Valid Preflight OPTIONS", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                         "https://app.harmonyflow.com",
			"Access-Control-Request-Method":  "POST",
			"Access-Control-Request-Headers": "Content-Type",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code, "Preflight should return 204 No Content")
		assert.Equal(t, "https://app.harmonyflow.com", w.Header().Get("Access-Control-Allow-Origin"))

		assert.Contains(t, w.Header().Get("Access-Control-Allow-Methods"), "POST")
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), "Content-Type")
		assert.Equal(t, "86400", w.Header().Get("Access-Control-Max-Age"))
	})

	t.Run("Invalid Preflight Origin", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                         "https://evil.com",
			"Access-Control-Request-Method":  "POST",
			"Access-Control-Request-Headers": "Content-Type",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"), "Invalid origin should not be allowed")
	})

	t.Run("Preflight Methods", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                        "https://staging.harmonyflow.com",
			"Access-Control-Request-Method": "DELETE",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Methods"), "DELETE")
	})
}

func TestCORS_AllowedMethods(t *testing.T) {
	ts := setupCORSTestServer(t)

	allowedMethods := []string{"GET", "POST", "PUT", "DELETE"}

	for _, method := range allowedMethods {
		t.Run("Method: "+method, func(t *testing.T) {
			headers := map[string]string{"Origin": "https://app.harmonyflow.com"}
			w := ts.makeRequest(t, method, "/api/data", headers)

			if method == "GET" || method == "POST" {
				assert.Equal(t, http.StatusOK, w.Code)
			}

			assert.Equal(t, "https://app.harmonyflow.com", w.Header().Get("Access-Control-Allow-Origin"))
		})
	}
}

func TestCORS_AllowedHeaders(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Allowed Header: Content-Type", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                         "https://app.harmonyflow.com",
			"Access-Control-Request-Headers": "Content-Type",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), "Content-Type")
	})

	t.Run("Allowed Header: Authorization", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                         "https://app.harmonyflow.com",
			"Access-Control-Request-Headers": "Authorization",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), "Authorization")
	})

	t.Run("Allowed Header: X-CSRF-Token", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                         "https://app.harmonyflow.com",
			"Access-Control-Request-Headers": "X-CSRF-Token",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), "X-CSRF-Token")
	})
}

func TestCORS_ExposedHeaders(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Exposed Headers Present", func(t *testing.T) {
		headers := map[string]string{"Origin": "https://app.harmonyflow.com"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		exposedHeaders := w.Header().Get("Access-Control-Expose-Headers")
		assert.NotEmpty(t, exposedHeaders)
		assert.Contains(t, exposedHeaders, "X-RateLimit-Limit")
		assert.Contains(t, exposedHeaders, "X-CSRF-Token")
	})
}

func TestCORS_Credentials(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Credentials Allowed with Valid Origin", func(t *testing.T) {
		headers := map[string]string{"Origin": "https://app.harmonyflow.com"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))
	})

	t.Run("Credentials Not Allowed with Invalid Origin", func(t *testing.T) {
		headers := map[string]string{"Origin": "https://evil.com"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Credentials"))
	})
}

func TestCORS_MaxAge(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Max Age Header", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                        "https://app.harmonyflow.com",
			"Access-Control-Request-Method": "GET",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, "86400", w.Header().Get("Access-Control-Max-Age"))
	})
}

func TestCORS_SubdomainHandling(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Exact Subdomain Match", func(t *testing.T) {
		headers := map[string]string{"Origin": "https://app.harmonyflow.com"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "https://app.harmonyflow.com", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("Different Subdomain", func(t *testing.T) {
		headers := map[string]string{"Origin": "https://sub.harmonyflow.com"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("No Subdomain", func(t *testing.T) {
		headers := map[string]string{"Origin": "https://harmonyflow.com"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestCORS_MissingOrigin(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Request Without Origin Header", func(t *testing.T) {
		w := ts.makeRequest(t, "GET", "/api/data", nil)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestCORS_EmptyOrigin(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Empty Origin Header", func(t *testing.T) {
		headers := map[string]string{"Origin": ""}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestCORS_NullOrigin(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Null Origin (Sandboxed Iframe)", func(t *testing.T) {
		headers := map[string]string{"Origin": "null"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"), "Null origin should be rejected")
	})
}

func TestCORS_OriginSpoofing(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Origin in Referer Only", func(t *testing.T) {
		headers := map[string]string{
			"Referer": "https://app.harmonyflow.com/page",
		}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"), "Origin header required")
	})

	t.Run("Mismatched Origin and Referer", func(t *testing.T) {
		headers := map[string]string{
			"Origin":  "https://app.harmonyflow.com",
			"Referer": "https://evil.com/page",
		}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "https://app.harmonyflow.com", w.Header().Get("Access-Control-Allow-Origin"), "Only Origin header checked")
	})
}

func TestCORS_CacheBypass(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Random Cache Header", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                        "https://app.harmonyflow.com",
			"Access-Control-Request-Method": "POST",
			"Cache-Control":                 "no-cache, no-store",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Equal(t, "https://app.harmonyflow.com", w.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestCORS_CrossOriginResourceSharing(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Cross-Site Request with Valid Origin", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                        "https://staging.harmonyflow.com",
			"Access-Control-Request-Method": "POST",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.NotEmpty(t, w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("Cross-Site Request with Invalid Origin", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                        "https://attacker-site.com",
			"Access-Control-Request-Method": "POST",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		assert.Equal(t, http.StatusNoContent, w.Code)
		assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
	})
}

func TestCORS_CustomHeaders(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Custom Allowed Header", func(t *testing.T) {
		headers := map[string]string{
			"Origin":                         "https://app.harmonyflow.com",
			"Access-Control-Request-Headers": "X-Custom-Header",
		}
		w := ts.makeRequest(t, "OPTIONS", "/api/data", headers)

		exposedHeaders := w.Header().Get("Access-Control-Allow-Headers")
		assert.Contains(t, exposedHeaders, "Content-Type")
		assert.Contains(t, exposedHeaders, "Authorization")
	})
}

func TestCORS_PortSpecificity(t *testing.T) {
	ts := setupCORSTestServer(t)

	t.Run("Allowed Port (3000)", func(t *testing.T) {
		headers := map[string]string{"Origin": "http://localhost:3000"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "http://localhost:3000", w.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("Different Port (8080)", func(t *testing.T) {
		headers := map[string]string{"Origin": "http://localhost:8080"}
		w := ts.makeRequest(t, "GET", "/api/data", headers)

		assert.Equal(t, "", w.Header().Get("Access-Control-Allow-Origin"))
	})
}
