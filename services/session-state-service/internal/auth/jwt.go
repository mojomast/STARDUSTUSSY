package auth

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"go.uber.org/zap"
)

var (
	jwtSecrets       = make(map[string]string)
	secretsMutex     sync.RWMutex
	currentKeyID     string
	keyRotationTimer *time.Timer
	rotationInterval = 24 * time.Hour
)

func LoadJWTSecretsFromEnv(logger *zap.Logger) error {
	secretsMutex.Lock()
	defer secretsMutex.Unlock()

	currentSecret := os.Getenv("JWT_SECRET")
	if currentSecret == "" {
		return errors.New("JWT_SECRET environment variable is required")
	}

	refreshSecret := os.Getenv("JWT_REFRESH_SECRET")
	if refreshSecret == "" {
		return errors.New("JWT_REFRESH_SECRET environment variable is required")
	}

	previousSecret := os.Getenv("JWT_SECRET_PREVIOUS")
	nextSecret := os.Getenv("JWT_SECRET_NEXT")

	keyID := os.Getenv("JWT_KEY_ID")
	if keyID == "" {
		keyID = "current"
	}

	jwtSecrets["current"] = currentSecret
	jwtSecrets["previous"] = previousSecret
	jwtSecrets["next"] = nextSecret
	jwtSecrets["refresh"] = refreshSecret
	currentKeyID = keyID

	logger.Info("JWT secrets loaded from environment",
		zap.String("key_id", keyID),
		zap.Bool("has_previous", previousSecret != ""),
		zap.Bool("has_next", nextSecret != ""),
	)

	return nil
}

func GetSecretForKey(keyID string) (string, error) {
	secretsMutex.RLock()
	defer secretsMutex.RUnlock()

	if secret, ok := jwtSecrets[keyID]; ok && secret != "" {
		return secret, nil
	}

	if keyID == "current" {
		if secret, ok := jwtSecrets["previous"]; ok && secret != "" {
			return secret, nil
		}
	}

	return "", fmt.Errorf("secret not found for key ID: %s", keyID)
}

func GetCurrentSecret() (string, error) {
	return GetSecretForKey("current")
}

func GetRefreshSecret() (string, error) {
	return GetSecretForKey("refresh")
}

func RotateKeys(logger *zap.Logger) error {
	secretsMutex.Lock()
	defer secretsMutex.Unlock()

	currentSecret := jwtSecrets["current"]
	nextSecret := jwtSecrets["next"]

	if nextSecret == "" {
		newSecret := os.Getenv("JWT_SECRET_NEXT")
		if newSecret == "" {
			return errors.New("JWT_SECRET_NEXT environment variable not set for rotation")
		}
		nextSecret = newSecret
	}

	jwtSecrets["previous"] = currentSecret
	jwtSecrets["current"] = nextSecret
	jwtSecrets["next"] = ""
	currentKeyID = fmt.Sprintf("key_%d", time.Now().Unix())

	logger.Info("JWT keys rotated",
		zap.String("new_key_id", currentKeyID),
	)

	return nil
}

func StartKeyRotation(interval time.Duration, logger *zap.Logger) {
	rotationInterval = interval
	keyRotationTimer = time.AfterFunc(interval, func() {
		if err := RotateKeys(logger); err != nil {
			logger.Error("Failed to rotate JWT keys", zap.Error(err))
		}
		StartKeyRotation(interval, logger)
	})
}

func StopKeyRotation() {
	if keyRotationTimer != nil {
		keyRotationTimer.Stop()
	}
}

func ValidateTokenWithRotation(tokenString string, logger *zap.Logger) (*models.UserClaims, error) {
	tokenParts := strings.Split(tokenString, ".")
	if len(tokenParts) != 3 {
		return nil, ErrInvalidToken
	}

	for _, keyID := range []string{"current", "previous", "next"} {
		secret, err := GetSecretForKey(keyID)
		if err != nil {
			continue
		}

		middleware := &Middleware{
			cfg: Config{
				SecretKey:        secret,
				RefreshSecretKey: secret,
				TokenExpiry:      15 * time.Minute,
				RefreshExpiry:    7 * 24 * time.Hour,
			},
			logger: logger,
		}

		claims, err := middleware.ValidateToken(tokenString)
		if err == nil {
			if keyID == "previous" || keyID == "next" {
				logger.Info("Token validated with non-current key",
					zap.String("key_id", keyID),
					zap.String("user_id", claims.UserID),
				)
			}
			return claims, nil
		}

		if !errors.Is(err, ErrTokenExpired) && !errors.Is(err, ErrInvalidToken) {
			logger.Warn("Unexpected error validating token", zap.Error(err))
		}
	}

	return nil, ErrInvalidToken
}

func GetKeyInfo() map[string]interface{} {
	secretsMutex.RLock()
	defer secretsMutex.RUnlock()

	return map[string]interface{}{
		"current_key_id": currentKeyID,
		"has_previous":   jwtSecrets["previous"] != "",
		"has_next":       jwtSecrets["next"] != "",
	}
}
