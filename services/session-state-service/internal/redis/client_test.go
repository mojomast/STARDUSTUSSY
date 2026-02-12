package redis

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestNewClient(t *testing.T) {
	logger := zap.NewNop()

	config := Config{
		Addr:         "localhost:6379",
		Password:     "",
		DB:           0,
		PoolSize:     10,
		MinIdleConns: 2,
		MaxRetries:   3,
	}

	client, err := NewClient(config, logger)
	if err != nil {
		t.Skip("Redis not available:", err)
	}
	defer client.Close()

	assert.NotNil(t, client)
}

func TestSaveAndGetSnapshot(t *testing.T) {
	logger := zap.NewNop()

	config := Config{
		Addr:     "localhost:6379",
		Password: "",
		DB:       1,
	}

	client, err := NewClient(config, logger)
	if err != nil {
		t.Skip("Redis not available:", err)
	}
	defer client.Close()

	ctx := context.Background()

	t.Run("save and retrieve snapshot", func(t *testing.T) {
		snapshot := &models.SessionSnapshot{
			SessionID:  "test-session-1",
			UserID:     "user-123",
			StateData:  map[string]interface{}{"key": "value", "count": 42},
			CreatedAt:  time.Now(),
			ExpiresAt:  time.Now().Add(models.SnapshotTTL),
			DeviceID:   "device-456",
			AppVersion: "1.0.0",
		}

		err := client.SaveSnapshot(ctx, snapshot)
		require.NoError(t, err)

		retrieved, err := client.GetSnapshot(ctx, snapshot.SessionID)
		require.NoError(t, err)
		require.NotNil(t, retrieved)

		assert.Equal(t, snapshot.SessionID, retrieved.SessionID)
		assert.Equal(t, snapshot.UserID, retrieved.UserID)
		assert.Equal(t, snapshot.DeviceID, retrieved.DeviceID)
		assert.Equal(t, snapshot.AppVersion, retrieved.AppVersion)
		assert.Equal(t, snapshot.StateData["key"], retrieved.StateData["key"])
		assert.Equal(t, snapshot.StateData["count"], int(retrieved.StateData["count"].(float64)))

		err = client.DeleteSnapshot(ctx, snapshot.SessionID, snapshot.UserID)
		require.NoError(t, err)
	})

	t.Run("get non-existent snapshot", func(t *testing.T) {
		snapshot, err := client.GetSnapshot(ctx, "non-existent-session")
		require.NoError(t, err)
		assert.Nil(t, snapshot)
	})
}

func TestGetUserSessions(t *testing.T) {
	logger := zap.NewNop()

	config := Config{
		Addr:     "localhost:6379",
		Password: "",
		DB:       2,
	}

	client, err := NewClient(config, logger)
	if err != nil {
		t.Skip("Redis not available:", err)
	}
	defer client.Close()

	ctx := context.Background()
	userID := "user-multiple"

	sessions := []string{"session-1", "session-2", "session-3"}
	for _, sessionID := range sessions {
		snapshot := &models.SessionSnapshot{
			SessionID: sessionID,
			UserID:    userID,
			StateData: map[string]interface{}{},
			CreatedAt: time.Now(),
			ExpiresAt: time.Now().Add(models.SnapshotTTL),
		}
		err := client.SaveSnapshot(ctx, snapshot)
		require.NoError(t, err)
	}

	userSessions, err := client.GetUserSessions(ctx, userID)
	require.NoError(t, err)
	assert.Len(t, userSessions, 3)

	for _, sessionID := range sessions {
		err := client.DeleteSnapshot(ctx, sessionID, userID)
		require.NoError(t, err)
	}
}

func TestUpdateSnapshotTTL(t *testing.T) {
	logger := zap.NewNop()

	config := Config{
		Addr:     "localhost:6379",
		Password: "",
		DB:       3,
	}

	client, err := NewClient(config, logger)
	if err != nil {
		t.Skip("Redis not available:", err)
	}
	defer client.Close()

	ctx := context.Background()

	snapshot := &models.SessionSnapshot{
		SessionID: "ttl-test-session",
		UserID:    "ttl-user",
		StateData: map[string]interface{}{"test": "data"},
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(1 * time.Second),
	}

	err = client.SaveSnapshot(ctx, snapshot)
	require.NoError(t, err)

	err = client.UpdateSnapshotTTL(ctx, snapshot.SessionID)
	require.NoError(t, err)

	err = client.DeleteSnapshot(ctx, snapshot.SessionID, snapshot.UserID)
	require.NoError(t, err)
}

func TestHealthCheck(t *testing.T) {
	logger := zap.NewNop()

	config := Config{
		Addr:     "localhost:6379",
		Password: "",
		DB:       4,
	}

	client, err := NewClient(config, logger)
	if err != nil {
		t.Skip("Redis not available:", err)
	}
	defer client.Close()

	ctx := context.Background()
	err = client.HealthCheck(ctx)
	assert.NoError(t, err)
}

func BenchmarkSaveSnapshot(b *testing.B) {
	logger := zap.NewNop()

	config := Config{
		Addr:     "localhost:6379",
		Password: "",
		DB:       9,
	}

	client, err := NewClient(config, logger)
	if err != nil {
		b.Skip("Redis not available:", err)
	}
	defer client.Close()

	ctx := context.Background()

	snapshot := &models.SessionSnapshot{
		SessionID: "bench-session",
		UserID:    "bench-user",
		StateData: map[string]interface{}{
			"data": make([]byte, 1024),
		},
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(models.SnapshotTTL),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		snapshot.SessionID = fmt.Sprintf("bench-session-%d", i)
		client.SaveSnapshot(ctx, snapshot)
	}
}

func BenchmarkGetSnapshot(b *testing.B) {
	logger := zap.NewNop()

	config := Config{
		Addr:     "localhost:6379",
		Password: "",
		DB:       9,
	}

	client, err := NewClient(config, logger)
	if err != nil {
		b.Skip("Redis not available:", err)
	}
	defer client.Close()

	ctx := context.Background()

	snapshot := &models.SessionSnapshot{
		SessionID: "bench-get-session",
		UserID:    "bench-user",
		StateData: map[string]interface{}{
			"data": make([]byte, 1024),
		},
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(models.SnapshotTTL),
	}

	client.SaveSnapshot(ctx, snapshot)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		client.GetSnapshot(ctx, snapshot.SessionID)
	}
}
