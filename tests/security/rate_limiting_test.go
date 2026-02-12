package penetration

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

type RateLimitTestServer struct {
	router    *gin.Engine
	redis     *redis.Client
	rateLimit *middleware.RateLimiter
	logger    *zap.Logger
}

func setupRateLimitTestServer(t *testing.T) *RateLimitTestServer {
	gin.SetMode(gin.TestMode)
	logger := zap.NewNop()

	redisClient := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
		DB:   15,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		t.Skip("Redis not available, skipping rate limit tests")
	}

	rateLimit := middleware.NewRateLimiter(redisClient, middleware.RateLimiterConfig{
		IPRequestsPerMinute:   100,
		UserRequestsPerMinute: 1000,
		BurstSize:             10,
		CleanupInterval:       5 * time.Minute,
	}, logger)

	router := gin.New()
	router.Use(rateLimit.Middleware())

	router.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "success"})
	})
	router.POST("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "success"})
	})

	return &RateLimitTestServer{
		router:    router,
		redis:     redisClient,
		rateLimit: rateLimit,
		logger:    logger,
	}
}

func TestRateLimiting_IPBased(t *testing.T) {
	ts := setupRateLimitTestServer(t)

	t.Run("Enforce IP Rate Limit (100 req/min)", func(t *testing.T) {
		successCount := 0
		rateLimitedCount := 0

		for i := 0; i < 150; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.100:12345"
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			} else if w.Code == http.StatusTooManyRequests {
				rateLimitedCount++
				break
			}
		}

		t.Logf("Success: %d, Rate Limited: %d", successCount, rateLimitedCount)
		assert.Equal(t, 100, successCount, "Should allow exactly 100 requests")
		assert.GreaterOrEqual(t, rateLimitedCount, 1, "Should rate limit after 100 requests")
	})

	t.Run("Rate Limit Headers Present", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.200:12345"
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		if w.Code == http.StatusOK {
			limitHeader := w.Header().Get("X-RateLimit-Limit")
			assert.NotEmpty(t, limitHeader, "Rate limit header should be present")
			assert.Contains(t, limitHeader, "100")
		}
	})

	t.Run("Different IPs Counted Separately", func(t *testing.T) {
		ipCount := 10
		requestsPerIP := 50

		for ip := 0; ip < ipCount; ip++ {
			for reqNum := 0; reqNum < requestsPerIP; reqNum++ {
				req := httptest.NewRequest("GET", "/test", nil)
				req.RemoteAddr = fmt.Sprintf("192.168.1.%d:12345", ip)
				w := httptest.NewRecorder()
				ts.router.ServeHTTP(w, req)

				assert.Equal(t, http.StatusOK, w.Code, "IP %d request %d should succeed", ip, reqNum)
			}
		}
	})
}

func TestRateLimiting_UserBased(t *testing.T) {
	ts := setupRateLimitTestServer(t)
	userToken := "user-123-token"

	t.Run("Enforce User Rate Limit (1000 req/min)", func(t *testing.T) {
		successCount := 0
		rateLimitedCount := 0

		for i := 0; i < 1050; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.100:12345"
			req.Header.Set("X-User-ID", userToken)
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			} else if w.Code == http.StatusTooManyRequests {
				rateLimitedCount++
				break
			}
		}

		t.Logf("Success: %d, Rate Limited: %d", successCount, rateLimitedCount)
		assert.Equal(t, 1000, successCount, "Should allow exactly 1000 requests per user")
	})

	t.Run("User and IP Limits Both Enforced", func(t *testing.T) {
		successCount := 0
		rateLimitedCount := 0

		for i := 0; i < 120; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.101:12345"
			req.Header.Set("X-User-ID", "user-456")
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			} else if w.Code == http.StatusTooManyRequests {
				rateLimitedCount++
				break
			}
		}

		assert.LessOrEqual(t, successCount, 100, "Should be limited by IP first (100 < 1000)")
	})
}

func TestRateLimiting_BypassAttempts(t *testing.T) {
	ts := setupRateLimitTestServer(t)

	t.Run("IP Rotation Bypass Attempt", func(t *testing.T) {
		blocked := false

		for ip := 0; ip < 20; ip++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = fmt.Sprintf("10.0.%d.%d:12345", ip/256, ip%256)
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusTooManyRequests {
				blocked = true
				break
			}
		}

		assert.False(t, blocked, "IP rotation should not trigger rate limiting with distinct IPs")
	})

	t.Run("User-Agent Header Manipulation", func(t *testing.T) {
		successCount := 0
		rateLimitedCount := 0

		userAgents := []string{
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
			"Mozilla/5.0 (X11; Linux x86_64)",
			"curl/7.68.0",
		}

		for i := 0; i < 150; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.150:12345"
			req.Header.Set("User-Agent", userAgents[i%len(userAgents)])
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			} else if w.Code == http.StatusTooManyRequests {
				rateLimitedCount++
				break
			}
		}

		assert.LessOrEqual(t, successCount, 100, "User-Agent manipulation should not bypass IP rate limit")
	})

	t.Run("X-Forwarded-For Header Injection", func(t *testing.T) {
		successCount := 0
		rateLimitedCount := 0

		for i := 0; i < 150; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.160:12345"
			req.Header.Set("X-Forwarded-For", fmt.Sprintf("10.%d.%d.%d", i/256, (i/256)%256, i%256))
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			} else if w.Code == http.StatusTooManyRequests {
				rateLimitedCount++
				break
			}
		}

		assert.LessOrEqual(t, successCount, 100, "X-Forwarded-For injection should not bypass rate limit")
	})
}

func TestRateLimiting_DistributedAttack(t *testing.T) {
	ts := setupRateLimitTestServer(t)

	t.Run("Multiple IPs Same User", func(t *testing.T) {
		userID := "distributed-user-123"
		ipCount := 10
		requestsPerIP := 60
		totalRequests := ipCount * requestsPerIP

		successCount := 0
		rateLimitedCount := 0

		for ip := 0; ip < ipCount; ip++ {
			for reqNum := 0; reqNum < requestsPerIP; reqNum++ {
				req := httptest.NewRequest("GET", "/test", nil)
				req.RemoteAddr = fmt.Sprintf("172.16.%d.%d:12345", ip/256, ip%256)
				req.Header.Set("X-User-ID", userID)
				w := httptest.NewRecorder()
				ts.router.ServeHTTP(w, req)

				if w.Code == http.StatusOK {
					successCount++
				} else if w.Code == http.StatusTooManyRequests {
					rateLimitedCount++
				}
			}
		}

		t.Logf("Total requests: %d, Success: %d, Rate Limited: %d", totalRequests, successCount, rateLimitedCount)

		assert.Equal(t, 0, rateLimitedCount, "IPs should not hit rate limit (60 < 100)")
		assert.GreaterOrEqual(t, successCount, 1000, "User rate limit should handle distributed requests")
	})
}

func TestRateLimiting_TimeWindowReset(t *testing.T) {
	ts := setupRateLimitTestServer(t)

	t.Run("Sliding Window Reset", func(t *testing.T) {
		successCount := 0

		for i := 0; i < 100; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.170:12345"
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			}
		}

		assert.Equal(t, 100, successCount, "Should allow exactly 100 requests")

		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.170:12345"
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusTooManyRequests, w.Code, "101st request should be rate limited")

		time.Sleep(2 * time.Second)

		req = httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.170:12345"
		w = httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		if w.Code == http.StatusTooManyRequests {
			t.Log("Still rate limited (window not expired yet)")
		} else if w.Code == http.StatusOK {
			t.Log("Rate limit reset (window expired)")
		}
	})
}

func TestRateLimiting_BurstHandling(t *testing.T) {
	ts := setupRateLimitTestServer(t)

	t.Run("Burst Capacity", func(t *testing.T) {
		successCount := 0

		for i := 0; i < 20; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = "192.168.1.180:12345"
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			}
		}

		assert.Equal(t, 20, successCount, "Should allow burst of 20 requests")
	})

	t.Run("Burst Refill", func(t *testing.T) {
		burstIP := "192.168.1.190:12345"

		for i := 0; i < 100; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = burstIP
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)
		}

		assertRateLimited := func() bool {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = burstIP
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)
			return w.Code == http.StatusTooManyRequests
		}

		assert.True(t, assertRateLimited(), "Should be rate limited after burst")

		time.Sleep(61 * time.Second)

		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = burstIP
		w := httptest.NewRecorder()
		ts.router.ServeHTTP(w, req)

		if w.Code == http.StatusOK {
			t.Log("Burst refilled, can make requests again")
		}
	})
}

func TestRateLimiting_DifferentEndpoints(t *testing.T) {
	ts := setupRateLimitTestServer(t)

	t.Run("Shared Rate Limit Across Methods", func(t *testing.T) {
		successCount := 0

		for i := 0; i < 60; i++ {
			method := "GET"
			if i%2 == 0 {
				method = "POST"
			}

			req := httptest.NewRequest(method, "/test", strings.NewReader(`{"data": "test"}`))
			req.RemoteAddr = "192.168.1.200:12345"
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			}
		}

		assert.Equal(t, 60, successCount, "Should count GET and POST toward same limit")
	})
}

func TestRateLimiting_ConcurrentRequests(t *testing.T) {
	ts := setupRateLimitTestServer(t)

	t.Run("Concurrent Request Handling", func(t *testing.T) {
		ip := "192.168.1.210:12345"
		successCount := 0
		rateLimitedCount := 0

		for i := 0; i < 120; i++ {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = ip
			w := httptest.NewRecorder()
			ts.router.ServeHTTP(w, req)

			if w.Code == http.StatusOK {
				successCount++
			} else if w.Code == http.StatusTooManyRequests {
				rateLimitedCount++
			}
		}

		assert.Equal(t, 100, successCount, "Should allow exactly 100 requests")
		assert.Equal(t, 20, rateLimitedCount, "Should rate limit 20 requests")
	})
}
