package auth

import (
	"context"
	"testing"
	"time"

	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestNewMiddleware(t *testing.T) {
	logger := zap.NewNop()
	config := Config{
		SecretKey:     "test-secret-key",
		TokenExpiry:   15 * time.Minute,
		RefreshExpiry: 7 * 24 * time.Hour,
	}

	middleware := NewMiddleware(config, logger)
	assert.NotNil(t, middleware)
	assert.Equal(t, config, middleware.cfg)
}

func TestGenerateAndValidateToken(t *testing.T) {
	logger := zap.NewNop()
	config := Config{
		SecretKey:     "test-secret-key",
		TokenExpiry:   15 * time.Minute,
		RefreshExpiry: 7 * 24 * time.Hour,
	}

	middleware := NewMiddleware(config, logger)

	claims := &models.UserClaims{
		UserID:    "user-123",
		Email:     "test@example.com",
		Roles:     []string{"user", "admin"},
		DeviceID:  "device-456",
		SessionID: "session-789",
	}

	t.Run("generate and validate valid token", func(t *testing.T) {
		token, err := middleware.GenerateToken(claims)
		require.NoError(t, err)
		assert.NotEmpty(t, token)

		validatedClaims, err := middleware.ValidateToken(token)
		require.NoError(t, err)
		assert.NotNil(t, validatedClaims)
		assert.Equal(t, claims.UserID, validatedClaims.UserID)
		assert.Equal(t, claims.Email, validatedClaims.Email)
		assert.Equal(t, claims.DeviceID, validatedClaims.DeviceID)
		assert.Equal(t, claims.SessionID, validatedClaims.SessionID)
		assert.Equal(t, claims.Roles, validatedClaims.Roles)
	})

	t.Run("validate invalid token", func(t *testing.T) {
		_, err := middleware.ValidateToken("invalid-token")
		assert.ErrorIs(t, err, ErrInvalidToken)
	})

	t.Run("validate token with wrong secret", func(t *testing.T) {
		token, err := middleware.GenerateToken(claims)
		require.NoError(t, err)

		wrongMiddleware := NewMiddleware(Config{
			SecretKey: "wrong-secret",
		}, logger)

		_, err = wrongMiddleware.ValidateToken(token)
		assert.ErrorIs(t, err, ErrInvalidToken)
	})
}

func TestExpiredToken(t *testing.T) {
	logger := zap.NewNop()
	config := Config{
		SecretKey:     "test-secret-key",
		TokenExpiry:   1 * time.Millisecond,
		RefreshExpiry: 7 * 24 * time.Hour,
	}

	middleware := NewMiddleware(config, logger)

	claims := &models.UserClaims{
		UserID:    "user-123",
		Email:     "test@example.com",
		Roles:     []string{"user"},
		DeviceID:  "device-456",
		SessionID: "session-789",
	}

	token, err := middleware.GenerateToken(claims)
	require.NoError(t, err)

	time.Sleep(2 * time.Millisecond)

	_, err = middleware.ValidateToken(token)
	assert.ErrorIs(t, err, ErrTokenExpired)
}

func TestRefreshToken(t *testing.T) {
	logger := zap.NewNop()
	config := Config{
		SecretKey:     "test-secret-key",
		TokenExpiry:   15 * time.Minute,
		RefreshExpiry: 7 * 24 * time.Hour,
	}

	middleware := NewMiddleware(config, logger)

	claims := &models.UserClaims{
		UserID:    "user-123",
		Email:     "test@example.com",
		Roles:     []string{"user"},
		DeviceID:  "device-456",
		SessionID: "session-789",
	}

	t.Run("refresh valid token", func(t *testing.T) {
		token, err := middleware.GenerateToken(claims)
		require.NoError(t, err)

		newToken, newClaims, err := middleware.RefreshToken(token)
		require.NoError(t, err)
		assert.NotEmpty(t, newToken)
		assert.NotNil(t, newClaims)
		assert.Equal(t, claims.UserID, newClaims.UserID)
	})

	t.Run("refresh expired token", func(t *testing.T) {
		expiredConfig := Config{
			SecretKey:     "test-secret-key",
			TokenExpiry:   1 * time.Millisecond,
			RefreshExpiry: 7 * 24 * time.Hour,
		}
		expiredMiddleware := NewMiddleware(expiredConfig, logger)

		token, err := expiredMiddleware.GenerateToken(claims)
		require.NoError(t, err)

		time.Sleep(2 * time.Millisecond)

		newToken, newClaims, err := expiredMiddleware.RefreshToken(token)
		require.NoError(t, err)
		assert.NotEmpty(t, newToken)
		assert.NotNil(t, newClaims)
	})

	t.Run("refresh invalid token", func(t *testing.T) {
		_, _, err := middleware.RefreshToken("invalid-token")
		assert.ErrorIs(t, err, ErrInvalidToken)
	})
}

func TestIsAuthorized(t *testing.T) {
	logger := zap.NewNop()
	middleware := NewMiddleware(Config{}, logger)

	tests := []struct {
		name         string
		roles        []string
		requiredRole string
		expected     bool
	}{
		{
			name:         "user has required role",
			roles:        []string{"user", "editor"},
			requiredRole: "user",
			expected:     true,
		},
		{
			name:         "user does not have required role",
			roles:        []string{"user"},
			requiredRole: "admin",
			expected:     false,
		},
		{
			name:         "admin has all roles",
			roles:        []string{"admin"},
			requiredRole: "user",
			expected:     true,
		},
		{
			name:         "empty roles",
			roles:        []string{},
			requiredRole: "user",
			expected:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := middleware.IsAuthorized(tt.roles, tt.requiredRole)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestExtractTokenFromContext(t *testing.T) {
	logger := zap.NewNop()
	middleware := NewMiddleware(Config{}, logger)

	t.Run("extract token from context", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), "token", "valid-token")
		token, err := middleware.ExtractTokenFromContext(ctx)
		require.NoError(t, err)
		assert.Equal(t, "valid-token", token)
	})

	t.Run("missing token in context", func(t *testing.T) {
		ctx := context.Background()
		_, err := middleware.ExtractTokenFromContext(ctx)
		assert.ErrorIs(t, err, ErrUnauthorized)
	})

	t.Run("empty token in context", func(t *testing.T) {
		ctx := context.WithValue(context.Background(), "token", "")
		_, err := middleware.ExtractTokenFromContext(ctx)
		assert.ErrorIs(t, err, ErrUnauthorized)
	})
}
