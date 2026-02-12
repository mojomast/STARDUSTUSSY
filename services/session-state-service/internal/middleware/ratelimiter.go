package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type RateLimiterConfig struct {
	IPRequestsPerMinute   int
	UserRequestsPerMinute int
	BurstSize             int
	CleanupInterval       time.Duration
}

type RateLimiter struct {
	redisClient *redis.Client
	cfg         RateLimiterConfig
	logger      *zap.Logger
	keyRotation sync.RWMutex
}

func NewRateLimiter(redisClient *redis.Client, cfg RateLimiterConfig, logger *zap.Logger) *RateLimiter {
	return &RateLimiter{
		redisClient: redisClient,
		cfg:         cfg,
		logger:      logger,
	}
}

func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()
		ctx := c.Request.Context()

		if clientIP == "" {
			rl.logger.Warn("Empty client IP, using fallback")
			clientIP = "unknown"
		}

		limited, err := rl.checkRateLimit(ctx, "ip:"+clientIP, rl.cfg.IPRequestsPerMinute)
		if err != nil {
			rl.logger.Error("Rate limiter check failed", zap.Error(err))
		}

		if limited {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":   "rate limit exceeded",
				"message": "Too many requests from this IP",
			})
			c.Abort()
			return
		}

		userID := c.GetHeader("X-User-ID")
		if userID == "" {
			if authHeader := c.GetHeader("Authorization"); authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && parts[0] == "Bearer" {
					userID = extractUserIDFromToken(parts[1])
				}
			}
		}

		if userID != "" {
			limited, err = rl.checkRateLimit(ctx, "user:"+userID, rl.cfg.UserRequestsPerMinute)
			if err != nil {
				rl.logger.Error("User rate limiter check failed", zap.Error(err))
			}

			if limited {
				c.JSON(http.StatusTooManyRequests, gin.H{
					"error":   "rate limit exceeded",
					"message": "Too many requests for this user",
				})
				c.Abort()
				return
			}
		}

		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rl.cfg.IPRequestsPerMinute))
		c.Next()
	}
}

func (rl *RateLimiter) checkRateLimit(ctx context.Context, key string, limit int) (bool, error) {
	now := time.Now()
	windowStart := now.Truncate(time.Minute)
	windowKey := fmt.Sprintf("ratelimit:%s:%d", key, windowStart.Unix())

	current, err := rl.redisClient.Incr(ctx, windowKey).Result()
	if err != nil {
		return false, fmt.Errorf("failed to increment counter: %w", err)
	}

	if current == 1 {
		rl.redisClient.Expire(ctx, windowKey, 2*time.Minute)
	}

	return current > int64(limit), nil
}

func extractUserIDFromToken(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return ""
	}
	return ""
}
