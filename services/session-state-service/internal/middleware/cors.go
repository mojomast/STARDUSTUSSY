package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type CORSConfig struct {
	AllowedOrigins   []string
	AllowedMethods   []string
	AllowedHeaders   []string
	ExposedHeaders   []string
	AllowCredentials bool
	MaxAge           int
	Debug            bool
}

type CORSMiddleware struct {
	cfg    CORSConfig
	logger *zap.Logger
}

func NewCORSMiddleware(cfg CORSConfig, logger *zap.Logger) *CORSMiddleware {
	if len(cfg.AllowedMethods) == 0 {
		cfg.AllowedMethods = []string{
			"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS",
		}
	}

	if len(cfg.AllowedHeaders) == 0 {
		cfg.AllowedHeaders = []string{
			"Origin", "Content-Type", "Accept", "Authorization",
			"X-CSRF-Token", "X-Session-ID", "X-User-ID", "X-Request-ID",
		}
	}

	if len(cfg.ExposedHeaders) == 0 {
		cfg.ExposedHeaders = []string{
			"Content-Length", "X-RateLimit-Limit", "X-RateLimit-Remaining",
		}
	}

	if cfg.MaxAge == 0 {
		cfg.MaxAge = 86400
	}

	return &CORSMiddleware{
		cfg:    cfg,
		logger: logger,
	}
}

func (cm *CORSMiddleware) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		allowedOrigin := cm.getAllowedOrigin(origin)
		if allowedOrigin != "" {
			c.Header("Access-Control-Allow-Origin", allowedOrigin)
		} else {
			cm.logger.Debug("Origin not allowed", zap.String("origin", origin))
		}

		c.Header("Access-Control-Allow-Methods", strings.Join(cm.cfg.AllowedMethods, ", "))
		c.Header("Access-Control-Allow-Headers", strings.Join(cm.cfg.AllowedHeaders, ", "))
		c.Header("Access-Control-Expose-Headers", strings.Join(cm.cfg.ExposedHeaders, ", "))

		if cm.cfg.AllowCredentials && allowedOrigin != "*" {
			c.Header("Access-Control-Allow-Credentials", "true")
		}

		c.Header("Access-Control-Max-Age", fmt.Sprintf("%d", cm.cfg.MaxAge))

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func (cm *CORSMiddleware) isOriginAllowed(origin string) bool {
	if origin == "" {
		return true
	}

	for _, allowedOrigin := range cm.cfg.AllowedOrigins {
		if allowedOrigin == "*" {
			return true
		}

		if cm.originMatch(origin, allowedOrigin) {
			return true
		}
	}

	return false
}

func (cm *CORSMiddleware) originMatch(origin, pattern string) bool {
	if pattern == origin {
		return true
	}

	if pattern == "*" {
		return true
	}

	if strings.HasSuffix(pattern, "/*") {
		prefix := strings.TrimSuffix(pattern, "/*")
		return strings.HasPrefix(origin, prefix)
	}

	if strings.HasPrefix(pattern, "http://") || strings.HasPrefix(pattern, "https://") {
		if strings.HasPrefix(origin, pattern) {
			afterPattern := strings.TrimPrefix(origin, pattern)
			return afterPattern == "" || strings.HasPrefix(afterPattern, "/") || strings.HasPrefix(afterPattern, ":")
		}
	}

	return false
}

func (cm *CORSMiddleware) AddOrigin(origin string) {
	for _, existing := range cm.cfg.AllowedOrigins {
		if existing == origin {
			return
		}
	}
	cm.cfg.AllowedOrigins = append(cm.cfg.AllowedOrigins, origin)
}

func (cm *CORSMiddleware) RemoveOrigin(origin string) {
	for i, existing := range cm.cfg.AllowedOrigins {
		if existing == origin {
			cm.cfg.AllowedOrigins = append(cm.cfg.AllowedOrigins[:i], cm.cfg.AllowedOrigins[i+1:]...)
			return
		}
	}
}

func (cm *CORSMiddleware) getAllowedOrigin(requestOrigin string) string {
	if requestOrigin == "" {
		return ""
	}

	for _, allowedOrigin := range cm.cfg.AllowedOrigins {
		if allowedOrigin == "*" {
			return "*"
		}

		if cm.originMatch(requestOrigin, allowedOrigin) {
			return requestOrigin
		}
	}

	return ""
}
