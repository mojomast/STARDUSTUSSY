package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"go.uber.org/zap"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrTokenExpired = errors.New("token expired")
	ErrUnauthorized = errors.New("unauthorized")
)

type Config struct {
	SecretKey        string
	RefreshSecretKey string
	TokenExpiry      time.Duration
	RefreshExpiry    time.Duration
}

type Middleware struct {
	cfg    Config
	logger *zap.Logger
}

func NewMiddleware(cfg Config, logger *zap.Logger) *Middleware {
	return &Middleware{
		cfg:    cfg,
		logger: logger,
	}
}

type Claims struct {
	UserID    string   `json:"user_id"`
	Email     string   `json:"email"`
	Roles     []string `json:"roles"`
	DeviceID  string   `json:"device_id"`
	SessionID string   `json:"session_id"`
	jwt.RegisteredClaims
}

func (m *Middleware) ValidateToken(tokenString string) (*models.UserClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(m.cfg.SecretKey), nil
	}, jwt.WithValidMethods([]string{"HS256"}))

	if err != nil {
		// Try to extract claims even if token is expired
		if token != nil {
			if claims, ok := token.Claims.(*Claims); ok {
				userClaims := &models.UserClaims{
					UserID:    claims.UserID,
					Email:     claims.Email,
					Roles:     claims.Roles,
					DeviceID:  claims.DeviceID,
					SessionID: claims.SessionID,
					Exp:       0,
				}
				if claims.ExpiresAt != nil {
					userClaims.Exp = claims.ExpiresAt.Unix()
				}
				if errors.Is(err, jwt.ErrTokenExpired) {
					return userClaims, ErrTokenExpired
				}
				return userClaims, ErrInvalidToken
			}
		}
		return nil, ErrInvalidToken
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return &models.UserClaims{
			UserID:    claims.UserID,
			Email:     claims.Email,
			Roles:     claims.Roles,
			DeviceID:  claims.DeviceID,
			SessionID: claims.SessionID,
			Exp:       claims.ExpiresAt.Unix(),
		}, nil
	}

	return nil, ErrInvalidToken
}

func (m *Middleware) GenerateToken(claims *models.UserClaims) (string, error) {
	jwtClaims := Claims{
		UserID:    claims.UserID,
		Email:     claims.Email,
		Roles:     claims.Roles,
		DeviceID:  claims.DeviceID,
		SessionID: claims.SessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(m.cfg.TokenExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwtClaims)
	return token.SignedString([]byte(m.cfg.SecretKey))
}

func (m *Middleware) RefreshToken(tokenString string) (string, *models.UserClaims, error) {
	claims, err := m.ValidateToken(tokenString)
	if err != nil && !errors.Is(err, ErrTokenExpired) {
		return "", nil, err
	}

	if claims == nil {
		return "", nil, ErrInvalidToken
	}

	newToken, err := m.GenerateToken(claims)
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate new token: %w", err)
	}

	return newToken, claims, nil
}

func (m *Middleware) ExtractTokenFromContext(ctx context.Context) (string, error) {
	token, ok := ctx.Value("token").(string)
	if !ok || token == "" {
		return "", ErrUnauthorized
	}
	return token, nil
}

func (m *Middleware) IsAuthorized(roles []string, requiredRole string) bool {
	for _, role := range roles {
		if role == requiredRole || role == "admin" {
			return true
		}
	}
	return false
}
