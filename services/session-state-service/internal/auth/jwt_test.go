package auth

import (
	"os"
	"testing"
	"time"

	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func TestLoadJWTSecretsFromEnv(t *testing.T) {
	logger := zap.NewNop()

	t.Run("LoadSecretsSuccess", func(t *testing.T) {
		os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
		os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-key-at-least-32-chars")
		defer os.Unsetenv("JWT_SECRET")
		defer os.Unsetenv("JWT_REFRESH_SECRET")

		err := LoadJWTSecretsFromEnv(logger)
		assert.NoError(t, err)
	})

	t.Run("MissingJWTSecret", func(t *testing.T) {
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("JWT_REFRESH_SECRET")

		err := LoadJWTSecretsFromEnv(logger)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "JWT_SECRET")
	})

	t.Run("MissingRefreshSecret", func(t *testing.T) {
		os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
		os.Unsetenv("JWT_REFRESH_SECRET")
		defer os.Unsetenv("JWT_SECRET")

		err := LoadJWTSecretsFromEnv(logger)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "JWT_REFRESH_SECRET")
	})
}

func TestGetSecretForKey(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
	os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-key-at-least-32-chars")
	os.Setenv("JWT_SECRET_PREVIOUS", "previous-secret-key-at-least-32-chars-long")
	os.Setenv("JWT_SECRET_NEXT", "next-secret-key-at-least-32-chars-long")

	LoadJWTSecretsFromEnv(zap.NewNop())
	defer func() {
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("JWT_REFRESH_SECRET")
		os.Unsetenv("JWT_SECRET_PREVIOUS")
		os.Unsetenv("JWT_SECRET_NEXT")
	}()

	t.Run("GetCurrentSecret", func(t *testing.T) {
		secret, err := GetSecretForKey("current")
		assert.NoError(t, err)
		assert.Equal(t, "test-secret-key-at-least-32-characters-long", secret)
	})

	t.Run("GetRefreshSecret", func(t *testing.T) {
		secret, err := GetSecretForKey("refresh")
		assert.NoError(t, err)
		assert.Equal(t, "test-refresh-secret-key-at-least-32-chars", secret)
	})

	t.Run("GetPreviousSecret", func(t *testing.T) {
		secret, err := GetSecretForKey("previous")
		assert.NoError(t, err)
		assert.Equal(t, "previous-secret-key-at-least-32-chars-long", secret)
	})

	t.Run("GetNextSecret", func(t *testing.T) {
		secret, err := GetSecretForKey("next")
		assert.NoError(t, err)
		assert.Equal(t, "next-secret-key-at-least-32-chars-long", secret)
	})

	t.Run("GetNonExistentKey", func(t *testing.T) {
		secret, err := GetSecretForKey("nonexistent")
		assert.Error(t, err)
		assert.Empty(t, secret)
	})
}

func TestRotateKeys(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
	os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-key-at-least-32-chars")
	os.Setenv("JWT_SECRET_NEXT", "next-secret-key-at-least-32-chars-long")

	LoadJWTSecretsFromEnv(zap.NewNop())

	err := RotateKeys(zap.NewNop())
	assert.NoError(t, err)

	previousSecret, err := GetSecretForKey("previous")
	assert.NoError(t, err)
	assert.Equal(t, "test-secret-key-at-least-32-characters-long", previousSecret)

	currentSecret, err := GetSecretForKey("current")
	assert.NoError(t, err)
	assert.Equal(t, "next-secret-key-at-least-32-chars-long", currentSecret)

	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("JWT_REFRESH_SECRET")
	os.Unsetenv("JWT_SECRET_NEXT")
}

func TestStartStopKeyRotation(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
	os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-key-at-least-32-chars")
	os.Setenv("JWT_SECRET_NEXT", "next-secret-key-at-least-32-chars-long")

	LoadJWTSecretsFromEnv(zap.NewNop())

	StartKeyRotation(1*time.Minute, zap.NewNop())
	defer StopKeyRotation()

	StopKeyRotation()
	StopKeyRotation()
}

func TestGetKeyInfo(t *testing.T) {
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("JWT_REFRESH_SECRET")
	os.Unsetenv("JWT_SECRET_PREVIOUS")
	os.Unsetenv("JWT_SECRET_NEXT")

	os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
	os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-key-at-least-32-chars")
	os.Setenv("JWT_SECRET_PREVIOUS", "previous-secret-key-at-least-32-chars-long")

	LoadJWTSecretsFromEnv(zap.NewNop())
	defer func() {
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("JWT_REFRESH_SECRET")
		os.Unsetenv("JWT_SECRET_PREVIOUS")
		os.Unsetenv("JWT_SECRET_NEXT")
	}()

	info := GetKeyInfo()
	assert.Contains(t, info, "current_key_id")
	assert.Contains(t, info, "has_previous")
	assert.Contains(t, info, "has_next")
	assert.True(t, info["has_previous"].(bool))
	assert.False(t, info["has_next"].(bool))
}

func TestValidateTokenWithRotation(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
	os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-key-at-least-32-chars")

	LoadJWTSecretsFromEnv(zap.NewNop())
	defer func() {
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("JWT_REFRESH_SECRET")
	}()

	logger := zap.NewNop()
	authMiddleware := &Middleware{
		cfg: Config{
			SecretKey:        "test-secret-key-at-least-32-characters-long",
			RefreshSecretKey: "test-refresh-secret-key-at-least-32-chars",
			TokenExpiry:      1 * time.Hour,
			RefreshExpiry:    24 * time.Hour,
		},
		logger: logger,
	}

	claims := &models.UserClaims{
		UserID:    "test-user-123",
		Email:     "test@example.com",
		Roles:     []string{"user"},
		DeviceID:  "device-123",
		SessionID: "session-123",
		Exp:       time.Now().Add(1 * time.Hour).Unix(),
	}

	token, err := authMiddleware.GenerateToken(claims)
	assert.NoError(t, err)

	validatedClaims, err := ValidateTokenWithRotation(token, logger)
	assert.NoError(t, err)
	assert.Equal(t, claims.UserID, validatedClaims.UserID)
	assert.Equal(t, claims.Email, validatedClaims.Email)
}

func TestValidateTokenWithPreviousKey(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-key-at-least-32-characters-long")
	os.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret-key-at-least-32-chars")
	os.Setenv("JWT_SECRET_PREVIOUS", "previous-secret-key-at-least-32-chars-long")

	LoadJWTSecretsFromEnv(zap.NewNop())
	defer func() {
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("JWT_REFRESH_SECRET")
		os.Unsetenv("JWT_SECRET_PREVIOUS")
	}()

	logger := zap.NewNop()
	oldAuthMiddleware := &Middleware{
		cfg: Config{
			SecretKey:        "previous-secret-key-at-least-32-chars-long",
			RefreshSecretKey: "test-refresh-secret-key-at-least-32-chars",
			TokenExpiry:      1 * time.Hour,
			RefreshExpiry:    24 * time.Hour,
		},
		logger: logger,
	}

	claims := &models.UserClaims{
		UserID:    "test-user-456",
		Email:     "test2@example.com",
		Roles:     []string{"user"},
		DeviceID:  "device-456",
		SessionID: "session-456",
		Exp:       time.Now().Add(1 * time.Hour).Unix(),
	}

	token, err := oldAuthMiddleware.GenerateToken(claims)
	assert.NoError(t, err)

	validatedClaims, err := ValidateTokenWithRotation(token, logger)
	assert.NoError(t, err)
	assert.Equal(t, claims.UserID, validatedClaims.UserID)
}
