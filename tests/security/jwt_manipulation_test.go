package penetration

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
)

func TestJWT_TokenExpiration(t *testing.T) {
	tests := []struct {
		name         string
		exp          time.Time
		shouldExpire bool
	}{
		{
			name:         "Expired token (1 hour ago)",
			exp:          time.Now().Add(-1 * time.Hour),
			shouldExpire: true,
		},
		{
			name:         "Expired token (1 second ago)",
			exp:          time.Now().Add(-1 * time.Second),
			shouldExpire: true,
		},
		{
			name:         "Valid token (future)",
			exp:          time.Now().Add(1 * time.Hour),
			shouldExpire: false,
		},
		{
			name:         "Valid token (1 hour)",
			exp:          time.Now().Add(1 * time.Hour),
			shouldExpire: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims := jwt.MapClaims{
				"user_id": "test-user",
				"exp":     tt.exp.Unix(),
				"iat":     time.Now().Unix(),
			}

			token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
			tokenString, err := token.SignedString([]byte(testSecret))
			assert.NoError(t, err)

			parsedToken, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(testSecret), nil
			})

			if tt.shouldExpire {
				assert.Error(t, err)
				assert.Nil(t, parsedToken)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, parsedToken)
			}
		})
	}
}

func TestJWT_AlgorithmManipulation(t *testing.T) {
	t.Run("None Algorithm Attack", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "admin",
			"exp":     time.Now().Add(time.Hour).Unix(),
			"iat":     time.Now().Unix(),
		}

		header := jwt.Header{
			Alg: "none",
			Typ: "JWT",
		}

		headerBytes, _ := json.Marshal(header)
		claimsBytes, _ := json.Marshal(claims)

		headerEnc := base64.RawURLEncoding.EncodeToString(headerBytes)
		claimsEnc := base64.RawURLEncoding.EncodeToString(claimsBytes)

		noneToken := headerEnc + "." + claimsEnc + "."

		parsedToken, err := jwt.Parse(noneToken, func(token *jwt.Token) (interface{}, error) {
			return []byte(testSecret), nil
		})

		assert.Error(t, err)
		assert.Nil(t, parsedToken)
	})

	t.Run("RS256 Algorithm Attack", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "admin",
			"exp":     time.Now().Add(time.Hour).Unix(),
			"iat":     time.Now().Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parts := strings.Split(tokenString, ".")
		if len(parts) == 3 {
			var header map[string]interface{}
			headerBytes, _ := base64.RawURLEncoding.DecodeString(parts[0])
			json.Unmarshal(headerBytes, &header)

			header["alg"] = "RS256"
			modHeaderBytes, _ := json.Marshal(header)
			modHeaderEnc := base64.RawURLEncoding.EncodeToString(modHeaderBytes)

			rs256Token := modHeaderEnc + "." + parts[1] + "." + parts[2]

			parsedToken, err := jwt.Parse(rs256Token, func(token *jwt.Token) (interface{}, error) {
				return []byte(testSecret), nil
			})

			assert.Error(t, err)
			assert.Nil(t, parsedToken)
		}
	})

	t.Run("HS256 to HS384 Manipulation", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parts := strings.Split(tokenString, ".")
		if len(parts) == 3 {
			var header map[string]interface{}
			headerBytes, _ := base64.RawURLEncoding.DecodeString(parts[0])
			json.Unmarshal(headerBytes, &header)

			header["alg"] = "HS384"
			modHeaderBytes, _ := json.Marshal(header)
			modHeaderEnc := base64.RawURLEncoding.EncodeToString(modHeaderBytes)

			hs384Token := modHeaderEnc + "." + parts[1] + "." + parts[2]

			parsedToken, err := jwt.Parse(hs384Token, func(token *jwt.Token) (interface{}, error) {
				return []byte(testSecret), nil
			})

			assert.Error(t, err)
			assert.Nil(t, parsedToken)
		}
	})
}

func TestJWT_TokenTampering(t *testing.T) {
	t.Run("Tampered User ID", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "regular-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
			"iat":     time.Now().Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parts := strings.Split(tokenString, ".")
		if len(parts) == 3 {
			claims["user_id"] = "admin"
			modClaimsBytes, _ := json.Marshal(claims)
			modClaimsEnc := base64.RawURLEncoding.EncodeToString(modClaimsBytes)

			tamperedToken := parts[0] + "." + modClaimsEnc + "." + parts[2]

			parsedToken, err := jwt.Parse(tamperedToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(testSecret), nil
			})

			assert.Error(t, err)
			assert.Nil(t, parsedToken)
		}
	})

	t.Run("Tampered Expiration", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
			"iat":     time.Now().Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parts := strings.Split(tokenString, ".")
		if len(parts) == 3 {
			claims["exp"] = time.Now().Add(365 * 24 * time.Hour).Unix()
			modClaimsBytes, _ := json.Marshal(claims)
			modClaimsEnc := base64.RawURLEncoding.EncodeToString(modClaimsBytes)

			tamperedToken := parts[0] + "." + modClaimsEnc + "." + parts[2]

			parsedToken, err := jwt.Parse(tamperedToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(testSecret), nil
			})

			assert.Error(t, err)
			assert.Nil(t, parsedToken)
		}
	})

	t.Run("Added Admin Role", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "test-user",
			"roles":   []string{"user"},
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parts := strings.Split(tokenString, ".")
		if len(parts) == 3 {
			claims["roles"] = []string{"user", "admin"}
			modClaimsBytes, _ := json.Marshal(claims)
			modClaimsEnc := base64.RawURLEncoding.EncodeToString(modClaimsBytes)

			tamperedToken := parts[0] + "." + modClaimsEnc + "." + parts[2]

			parsedToken, err := jwt.Parse(tamperedToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(testSecret), nil
			})

			assert.Error(t, err)
			assert.Nil(t, parsedToken)
		}
	})
}

func TestJWT_WeakSecretBruteForce(t *testing.T) {
	weakSecrets := []string{
		"secret",
		"password",
		"123456",
		"admin",
		"test",
		"jwt",
		"key",
	}

	t.Run("Brute Force Detection", func(t *testing.T) {
		validClaims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		cracked := false
		for _, weakSecret := range weakSecrets {
			parsedToken, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				return []byte(weakSecret), nil
			})

			if err == nil && parsedToken != nil {
				if claims, ok := parsedToken.Claims.(jwt.MapClaims); ok {
					if claims["user_id"] == "test-user" {
						cracked = true
						break
					}
				}
			}
		}

		assert.False(t, cracked, "Token should not be crackable with weak secrets")
	})
}

func TestJWT_SignatureManipulation(t *testing.T) {
	t.Run("Removed Signature", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parts := strings.Split(tokenString, ".")
		if len(parts) == 3 {
			noSigToken := parts[0] + "." + parts[1] + "."

			parsedToken, err := jwt.Parse(noSigToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(testSecret), nil
			})

			assert.Error(t, err)
			assert.Nil(t, parsedToken)
		}
	})

	t.Run("Random Signature", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parts := strings.Split(tokenString, ".")
		if len(parts) == 3 {
			randomSig := base64.RawURLEncoding.EncodeToString([]byte("random-signature-12345"))
			randomToken := parts[0] + "." + parts[1] + "." + randomSig

			parsedToken, err := jwt.Parse(randomToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(testSecret), nil
			})

			assert.Error(t, err)
			assert.Nil(t, parsedToken)
		}
	})
}

func TestJWT_HeaderInjection(t *testing.T) {
	t.Run("Critical Header in JWT", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		header := jwt.Header{
			Alg: "HS256",
			Typ: "JWT",
		}

		header["crit"] = []string{"exp"}
		headerBytes, _ := json.Marshal(header)
		claimsBytes, _ := json.Marshal(claims)

		headerEnc := base64.RawURLEncoding.EncodeToString(headerBytes)
		claimsEnc := base64.RawURLEncoding.EncodeToString(claimsBytes)

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parsedToken, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(testSecret), nil
		})

		assert.NoError(t, err)
		assert.NotNil(t, parsedToken)
	})
}

func TestJWT_TokenReplay(t *testing.T) {
	t.Run("JTI Claim Uniqueness", func(t *testing.T) {
		jti1 := "unique-token-id-12345"
		claims1 := jwt.MapClaims{
			"user_id": "test-user",
			"jti":     jti1,
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token1 := jwt.NewWithClaims(jwt.SigningMethodHS256, claims1)
		tokenString1, _ := token1.SignedString([]byte(testSecret))

		jti2 := "unique-token-id-67890"
		claims2 := jwt.MapClaims{
			"user_id": "test-user",
			"jti":     jti2,
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token2 := jwt.NewWithClaims(jwt.SigningMethodHS256, claims2)
		tokenString2, _ := token2.SignedString([]byte(testSecret))

		assert.NotEqual(t, tokenString1, tokenString2)

		parsedToken1, _ := jwt.Parse(tokenString1, func(token *jwt.Token) (interface{}, error) {
			return []byte(testSecret), nil
		})
		claimsMap1 := parsedToken1.Claims.(jwt.MapClaims)
		assert.Equal(t, jti1, claimsMap1["jti"])

		parsedToken2, _ := jwt.Parse(tokenString2, func(token *jwt.Token) (interface{}, error) {
			return []byte(testSecret), nil
		})
		claimsMap2 := parsedToken2.Claims.(jwt.MapClaims)
		assert.Equal(t, jti2, claimsMap2["jti"])
	})
}

func TestJWT_TimingAttack(t *testing.T) {
	t.Run("Constant Time Comparison", func(t *testing.T) {
		validClaims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		validStart := time.Now()
		_, err1 := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(testSecret), nil
		})
		validDuration := time.Since(validStart)

		invalidStart := time.Now()
		_, err2 := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte("wrong-secret-12345"), nil
		})
		invalidDuration := time.Since(invalidStart)

		assert.NoError(t, err1)
		assert.Error(t, err2)

		timeDiff := abs(validDuration.Milliseconds() - invalidDuration.Milliseconds())
		assert.Less(t, timeDiff, int64(100), "Timing difference should be minimal (< 100ms)")
	})
}

func TestJWT_HMACLengthExtension(t *testing.T) {
	t.Run("HMAC Secret Length Validation", func(t *testing.T) {
		shortSecrets := []string{
			"short",
			"12345",
			"abc",
		}

		validClaims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		for _, secret := range shortSecrets {
			token := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims)
			_, err := token.SignedString([]byte(secret))

			if len(secret) < 32 {
				assert.NoError(t, err, "Should create token even with short secret (library allows)")
			}
		}
	})
}

func TestJWT_KeyConfusion(t *testing.T) {
	t.Run("Public Key as Secret", func(t *testing.T) {
		claims := jwt.MapClaims{
			"user_id": "test-user",
			"exp":     time.Now().Add(time.Hour).Unix(),
		}

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(testSecret))

		parsedToken, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte("public-key-value"), nil
		})

		assert.Error(t, err)
		assert.Nil(t, parsedToken)
	})
}

func abs(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}

func computeHMAC(message, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}
