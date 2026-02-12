package middleware

import (
	"crypto/subtle"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

type SecurityConfig struct {
	AdminAPIToken      string
	AllowedOrigins     []string
	EnableRateLimiting bool
	EnableCSRF         bool
}

type SecurityMiddleware struct {
	cfg            SecurityConfig
	logger         *zap.Logger
	adminTokenHash []byte
}

func NewSecurityMiddleware(cfg SecurityConfig, logger *zap.Logger) *SecurityMiddleware {
	adminTokenHash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminAPIToken), bcrypt.DefaultCost)
	if err != nil {
		logger.Warn("Failed to hash admin API token", zap.Error(err))
		adminTokenHash = []byte(cfg.AdminAPIToken)
	}

	return &SecurityMiddleware{
		cfg:            cfg,
		logger:         logger,
		adminTokenHash: adminTokenHash,
	}
}

func (sm *SecurityMiddleware) RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

func (sm *SecurityMiddleware) CSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

func (sm *SecurityMiddleware) CORS() gin.HandlerFunc {
	corsConfig := CORSConfig{
		AllowedOrigins:   sm.cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization", "X-CSRF-Token"},
		ExposedHeaders:   []string{"X-CSRF-Token"},
		AllowCredentials: true,
		MaxAge:           86400,
	}
	corsMiddleware := NewCORSMiddleware(corsConfig, sm.logger)
	return corsMiddleware.Middleware()
}

func (sm *SecurityMiddleware) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("X-Admin-Token")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Admin token required",
			})
			c.Abort()
			return
		}

		if err := bcrypt.CompareHashAndPassword(sm.adminTokenHash, []byte(token)); err != nil {
			if subtle.ConstantTimeCompare(sm.adminTokenHash, []byte(token)) != 1 {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid admin token",
				})
				c.Abort()
				return
			}
		}

		c.Next()
	}
}

func (sm *SecurityMiddleware) CleanupExpiredTokens() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
	}
}
