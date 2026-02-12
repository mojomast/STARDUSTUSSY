package middleware

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"go.uber.org/zap"
)

type CSRFConfig struct {
	TokenLength    int
	TokenTTL       time.Duration
	CookieName     string
	HeaderName     string
	SecureCookie   bool
	SameSite       string
	CookieDomain   string
	AllowedMethods []string
}

type CSRFMiddleware struct {
	redisClient *redis.Client
	cfg         CSRFConfig
	logger      *zap.Logger
}

func NewCSRFMiddleware(redisClient *redis.Client, cfg CSRFConfig, logger *zap.Logger) *CSRFMiddleware {
	if cfg.TokenLength == 0 {
		cfg.TokenLength = 32
	}
	if cfg.TokenTTL == 0 {
		cfg.TokenTTL = 24 * time.Hour
	}
	if cfg.CookieName == "" {
		cfg.CookieName = "csrf_token"
	}
	if cfg.HeaderName == "" {
		cfg.HeaderName = "X-CSRF-Token"
	}
	if len(cfg.AllowedMethods) == 0 {
		cfg.AllowedMethods = []string{"GET", "HEAD", "OPTIONS"}
	}

	return &CSRFMiddleware{
		redisClient: redisClient,
		cfg:         cfg,
		logger:      logger,
	}
}

func (cm *CSRFMiddleware) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if cm.isAllowedMethod(method) {
			cm.generateTokenIfMissing(c)
			c.Next()
			return
		}

		token := cm.extractToken(c)
		if token == "" {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "CSRF token missing",
			})
			c.Abort()
			return
		}

		valid, err := cm.validateToken(c.Request.Context(), c, token)
		if err != nil || !valid {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Invalid CSRF token",
			})
			c.Abort()
			return
		}

		cm.generateTokenIfMissing(c)
		c.Next()
	}
}

func (cm *CSRFMiddleware) GenerateToken(c *gin.Context, sessionID string) (string, error) {
	token, err := cm.generateRandomToken()
	if err != nil {
		return "", err
	}

	key := cm.getRedisKey(sessionID)
	err = cm.redisClient.Set(c.Request.Context(), key, token, cm.cfg.TokenTTL)
	if err != nil {
		return "", err
	}

	cm.setTokenCookie(c, token)
	return token, nil
}

func (cm *CSRFMiddleware) isAllowedMethod(method string) bool {
	method = strings.ToUpper(method)
	for _, allowed := range cm.cfg.AllowedMethods {
		if strings.ToUpper(allowed) == method {
			return true
		}
	}
	return false
}

func (cm *CSRFMiddleware) extractToken(c *gin.Context) string {
	token := c.GetHeader(cm.cfg.HeaderName)
	if token != "" {
		return token
	}

	if cookie, err := c.Cookie(cm.cfg.CookieName); err == nil {
		return cookie
	}

	return ""
}

func (cm *CSRFMiddleware) generateTokenIfMissing(c *gin.Context) {
	token := cm.extractToken(c)
	if token == "" {
		if cookie, err := c.Cookie(cm.cfg.CookieName); err == nil {
			token = cookie
		}
	}

	if token == "" {
		sessionID := c.GetHeader("X-Session-ID")
		if sessionID == "" {
			sessionID = c.Query("session_id")
		}
		if sessionID != "" {
			if newToken, err := cm.GenerateToken(c, sessionID); err == nil {
				token = newToken
			}
		}
	}

	if token != "" {
		cm.setTokenCookie(c, token)
	}
}

func (cm *CSRFMiddleware) validateToken(ctx context.Context, c *gin.Context, token string) (bool, error) {
	sessionID := c.GetHeader("X-Session-ID")
	if sessionID == "" {
		sessionID = c.Query("session_id")
	}
	if sessionID == "" {
		return false, nil
	}

	key := cm.getRedisKey(sessionID)
	storedToken, err := cm.redisClient.Get(ctx, key)
	if err != nil {
		return false, err
	}

	return token == storedToken, nil
}

func (cm *CSRFMiddleware) generateRandomToken() (string, error) {
	b := make([]byte, cm.cfg.TokenLength)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

func (cm *CSRFMiddleware) getRedisKey(sessionID string) string {
	return "csrf:" + sessionID
}

func (cm *CSRFMiddleware) setTokenCookie(c *gin.Context, token string) {
	maxAge := int(cm.cfg.TokenTTL.Seconds())
	c.SetSameSite(cm.parseSameSite(cm.cfg.SameSite))
	c.SetCookie(
		cm.cfg.CookieName,
		token,
		maxAge,
		"/",
		cm.cfg.CookieDomain,
		cm.cfg.SecureCookie,
		true,
	)
}

func (cm *CSRFMiddleware) parseSameSite(sameSite string) http.SameSite {
	switch strings.ToUpper(sameSite) {
	case "STRICT":
		return http.SameSiteStrictMode
	case "LAX":
		return http.SameSiteLaxMode
	case "NONE":
		return http.SameSiteNoneMode
	default:
		return http.SameSiteLaxMode
	}
}
