package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/auth"
	"go.uber.org/zap"
)

type AdminAuthConfig struct {
	AdminPathPrefix string
	SkipPaths       []string
}

type AdminAuthMiddleware struct {
	authMiddleware *auth.Middleware
	cfg            AdminAuthConfig
	logger         *zap.Logger
}

func NewAdminAuthMiddleware(authMiddleware *auth.Middleware, cfg AdminAuthConfig, logger *zap.Logger) *AdminAuthMiddleware {
	if cfg.AdminPathPrefix == "" {
		cfg.AdminPathPrefix = "/admin"
	}

	return &AdminAuthMiddleware{
		authMiddleware: authMiddleware,
		cfg:            cfg,
		logger:         logger,
	}
}

func (aa *AdminAuthMiddleware) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path

		if aa.shouldSkip(path) {
			c.Next()
			return
		}

		if !strings.HasPrefix(path, aa.cfg.AdminPathPrefix) {
			c.Next()
			return
		}

		token, err := aa.extractToken(c)
		if err != nil {
			aa.logger.Warn("Failed to extract token", zap.Error(err))
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Unauthorized",
			})
			c.Abort()
			return
		}

		claims, err := aa.authMiddleware.ValidateToken(token)
		if err != nil {
			aa.logger.Warn("Token validation failed",
				zap.Error(err),
				zap.String("path", path),
			)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid or expired token",
			})
			c.Abort()
			return
		}

		if !aa.isAdmin(claims.Roles) {
			aa.logger.Warn("Unauthorized admin access attempt",
				zap.String("user_id", claims.UserID),
				zap.Strings("roles", claims.Roles),
				zap.String("path", path),
			)
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Admin access required",
			})
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("user_email", claims.Email)
		c.Set("user_roles", claims.Roles)
		c.Set("session_id", claims.SessionID)
		c.Set("device_id", claims.DeviceID)

		c.Next()
	}
}

func (aa *AdminAuthMiddleware) extractToken(c *gin.Context) (string, error) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return "", auth.ErrUnauthorized
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return "", auth.ErrInvalidToken
	}

	return parts[1], nil
}

func (aa *AdminAuthMiddleware) isAdmin(roles []string) bool {
	for _, role := range roles {
		if role == "admin" || role == "superadmin" {
			return true
		}
	}
	return false
}

func (aa *AdminAuthMiddleware) shouldSkip(path string) bool {
	for _, skipPath := range aa.cfg.SkipPaths {
		if strings.HasPrefix(path, skipPath) {
			return true
		}
	}
	return false
}

func (aa *AdminAuthMiddleware) RequireRole(requiredRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		roles, exists := c.Get("user_roles")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "User roles not found",
			})
			c.Abort()
			return
		}

		userRoles, ok := roles.([]string)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Invalid user roles format",
			})
			c.Abort()
			return
		}

		if !aa.authMiddleware.IsAuthorized(userRoles, requiredRole) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Insufficient permissions",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
