package redis

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"time"

	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type Client struct {
	client *redis.Client
	logger *zap.Logger
}

type Config struct {
	Addr         string
	Password     string `json:"-"` // #nosec G101 - This is a config field, not a hardcoded secret
	DB           int
	PoolSize     int
	MinIdleConns int
	MaxRetries   int
}

func NewClient(cfg Config, logger *zap.Logger) (*Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:         cfg.Addr,
		Password:     cfg.Password,
		DB:           cfg.DB,
		PoolSize:     cfg.PoolSize,
		MinIdleConns: cfg.MinIdleConns,
		MaxRetries:   cfg.MaxRetries,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis connection failed: %w", err)
	}

	logger.Info("Redis client initialized",
		zap.String("addr", cfg.Addr),
		zap.Int("pool_size", cfg.PoolSize),
	)

	return &Client{
		client: rdb,
		logger: logger,
	}, nil
}

func (c *Client) Close() error {
	return c.client.Close()
}

func (c *Client) SaveSnapshot(ctx context.Context, snapshot *models.SessionSnapshot) error {
	key := fmt.Sprintf("session:%s", snapshot.SessionID)

	if snapshot.Version == 0 {
		snapshot.Version = time.Now().UnixNano()
	}

	data, err := json.Marshal(snapshot)
	if err != nil {
		return fmt.Errorf("failed to marshal snapshot: %w", err)
	}

	snapshot.Checksum = calculateChecksum(data)

	pipe := c.client.Pipeline()
	pipe.Set(ctx, key, data, models.SnapshotTTL)
	pipe.SAdd(ctx, fmt.Sprintf("user:%s:sessions", snapshot.UserID), snapshot.SessionID)
	pipe.Expire(ctx, fmt.Sprintf("user:%s:sessions", snapshot.UserID), models.SnapshotTTL)
	pipe.HIncrBy(ctx, "metrics:snapshots", "total_count", 1)
	pipe.HSet(ctx, fmt.Sprintf("session:%s:metadata", snapshot.SessionID), "version", snapshot.Version)
	pipe.HSet(ctx, fmt.Sprintf("session:%s:metadata", snapshot.SessionID), "last_updated", time.Now().Unix())

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to save snapshot: %w", err)
	}

	c.logger.Debug("Snapshot saved",
		zap.String("session_id", snapshot.SessionID),
		zap.String("user_id", snapshot.UserID),
		zap.Int64("version", snapshot.Version),
		zap.Duration("ttl", models.SnapshotTTL),
	)

	return nil
}

func (c *Client) GetSnapshot(ctx context.Context, sessionID string) (*models.SessionSnapshot, error) {
	key := fmt.Sprintf("session:%s", sessionID)

	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get snapshot: %w", err)
	}

	var snapshot models.SessionSnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return nil, fmt.Errorf("failed to unmarshal snapshot: %w", err)
	}

	return &snapshot, nil
}

func (c *Client) GetSnapshotWithVersion(ctx context.Context, sessionID string, version int64) (*models.SessionSnapshot, error) {
	snapshot, err := c.GetSnapshot(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if snapshot == nil {
		return nil, nil
	}

	if version > 0 && snapshot.Version != version {
		c.logger.Warn("Version mismatch",
			zap.String("session_id", sessionID),
			zap.Int64("requested_version", version),
			zap.Int64("current_version", snapshot.Version),
		)
	}

	return snapshot, nil
}

func (c *Client) ApplyIncrementalUpdate(ctx context.Context, update *models.IncrementalUpdate) error {
	snapshot, err := c.GetSnapshot(ctx, update.SessionID)
	if err != nil {
		return fmt.Errorf("failed to get snapshot for update: %w", err)
	}

	if snapshot == nil {
		snapshot = &models.SessionSnapshot{
			SessionID:   update.SessionID,
			UserID:      update.UserID,
			StateData:   make(map[string]interface{}),
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(models.SnapshotTTL),
			LastUpdated: time.Now(),
			DeviceID:    update.DeviceID,
		}
	}

	for key, value := range update.Changes {
		snapshot.StateData[key] = value
	}

	for _, key := range update.DeletedKeys {
		delete(snapshot.StateData, key)
	}

	snapshot.Version = time.Now().UnixNano()
	snapshot.LastUpdated = time.Now()

	return c.SaveSnapshot(ctx, snapshot)
}

func (c *Client) GetUserSessions(ctx context.Context, userID string) ([]string, error) {
	key := fmt.Sprintf("user:%s:sessions", userID)

	sessions, err := c.client.SMembers(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get user sessions: %w", err)
	}

	return sessions, nil
}

func (c *Client) DeleteSnapshot(ctx context.Context, sessionID string, userID string) error {
	key := fmt.Sprintf("session:%s", sessionID)

	pipe := c.client.Pipeline()
	pipe.Del(ctx, key)
	pipe.SRem(ctx, fmt.Sprintf("user:%s:sessions", userID), sessionID)
	pipe.Del(ctx, fmt.Sprintf("session:%s:metadata", sessionID))

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete snapshot: %w", err)
	}

	c.logger.Debug("Snapshot deleted",
		zap.String("session_id", sessionID),
		zap.String("user_id", userID),
	)

	return nil
}

func (c *Client) UpdateSnapshotTTL(ctx context.Context, sessionID string) error {
	key := fmt.Sprintf("session:%s", sessionID)

	if err := c.client.Expire(ctx, key, models.SnapshotTTL).Err(); err != nil {
		return fmt.Errorf("failed to update snapshot TTL: %w", err)
	}

	return nil
}

func (c *Client) HealthCheck(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}

func (c *Client) GetMetrics(ctx context.Context) (map[string]interface{}, error) {
	info, err := c.client.Info(ctx).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"redis_info": info,
	}, nil
}

func (c *Client) RegisterDevice(ctx context.Context, device *models.DeviceInfo) error {
	key := fmt.Sprintf("device:%s", device.DeviceID)
	userDevicesKey := fmt.Sprintf("user:%s:devices", device.UserID)
	sessionDevicesKey := fmt.Sprintf("session:%s:devices", device.SessionID)

	data, err := json.Marshal(device)
	if err != nil {
		return fmt.Errorf("failed to marshal device info: %w", err)
	}

	pipe := c.client.Pipeline()
	pipe.Set(ctx, key, data, models.DevicePresenceTTL)
	pipe.SAdd(ctx, userDevicesKey, device.DeviceID)
	pipe.Expire(ctx, userDevicesKey, models.SnapshotTTL)
	pipe.SAdd(ctx, sessionDevicesKey, device.DeviceID)
	pipe.Expire(ctx, sessionDevicesKey, models.SnapshotTTL)

	_, err = pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to register device: %w", err)
	}

	c.logger.Debug("Device registered",
		zap.String("device_id", device.DeviceID),
		zap.String("user_id", device.UserID),
	)

	return nil
}

func (c *Client) UpdateDevicePresence(ctx context.Context, deviceID string) error {
	key := fmt.Sprintf("device:%s", deviceID)

	if err := c.client.Expire(ctx, key, models.DevicePresenceTTL).Err(); err != nil {
		return fmt.Errorf("failed to update device presence: %w", err)
	}

	return nil
}

func (c *Client) GetDeviceInfo(ctx context.Context, deviceID string) (*models.DeviceInfo, error) {
	key := fmt.Sprintf("device:%s", deviceID)

	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get device info: %w", err)
	}

	var device models.DeviceInfo
	if err := json.Unmarshal(data, &device); err != nil {
		return nil, fmt.Errorf("failed to unmarshal device info: %w", err)
	}

	return &device, nil
}

func (c *Client) GetUserDevices(ctx context.Context, userID string) ([]*models.DeviceInfo, error) {
	key := fmt.Sprintf("user:%s:devices", userID)

	deviceIDs, err := c.client.SMembers(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get user devices: %w", err)
	}

	devices := make([]*models.DeviceInfo, 0, len(deviceIDs))
	for _, deviceID := range deviceIDs {
		device, err := c.GetDeviceInfo(ctx, deviceID)
		if err != nil {
			c.logger.Warn("Failed to get device info", zap.String("device_id", deviceID), zap.Error(err))
			continue
		}
		if device != nil {
			devices = append(devices, device)
		}
	}

	return devices, nil
}

func (c *Client) GetSessionDevices(ctx context.Context, sessionID string) ([]*models.DeviceInfo, error) {
	key := fmt.Sprintf("session:%s:devices", sessionID)

	deviceIDs, err := c.client.SMembers(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get session devices: %w", err)
	}

	devices := make([]*models.DeviceInfo, 0, len(deviceIDs))
	for _, deviceID := range deviceIDs {
		device, err := c.GetDeviceInfo(ctx, deviceID)
		if err != nil {
			c.logger.Warn("Failed to get device info", zap.String("device_id", deviceID), zap.Error(err))
			continue
		}
		if device != nil {
			devices = append(devices, device)
		}
	}

	return devices, nil
}

func (c *Client) RemoveDevice(ctx context.Context, deviceID string, userID string, sessionID string) error {
	key := fmt.Sprintf("device:%s", deviceID)
	userDevicesKey := fmt.Sprintf("user:%s:devices", userID)
	sessionDevicesKey := fmt.Sprintf("session:%s:devices", sessionID)

	pipe := c.client.Pipeline()
	pipe.Del(ctx, key)
	pipe.SRem(ctx, userDevicesKey, deviceID)
	pipe.SRem(ctx, sessionDevicesKey, deviceID)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to remove device: %w", err)
	}

	c.logger.Debug("Device removed",
		zap.String("device_id", deviceID),
		zap.String("user_id", userID),
	)

	return nil
}

func (c *Client) SaveHandoffToken(ctx context.Context, token *models.HandoffToken) error {
	key := fmt.Sprintf("handoff:%s", token.Token)

	data, err := json.Marshal(token)
	if err != nil {
		return fmt.Errorf("failed to marshal handoff token: %w", err)
	}

	if err := c.client.Set(ctx, key, data, models.HandoffTokenTTL).Err(); err != nil {
		return fmt.Errorf("failed to save handoff token: %w", err)
	}

	return nil
}

func (c *Client) GetHandoffToken(ctx context.Context, token string) (*models.HandoffToken, error) {
	key := fmt.Sprintf("handoff:%s", token)

	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get handoff token: %w", err)
	}

	var handoffToken models.HandoffToken
	if err := json.Unmarshal(data, &handoffToken); err != nil {
		return nil, fmt.Errorf("failed to unmarshal handoff token: %w", err)
	}

	return &handoffToken, nil
}

func (c *Client) DeleteHandoffToken(ctx context.Context, token string) error {
	key := fmt.Sprintf("handoff:%s", token)
	return c.client.Del(ctx, key).Err()
}

func (c *Client) GetSessionMetrics(ctx context.Context) (*models.SessionMetrics, error) {
	var metrics models.SessionMetrics

	metrics.Timestamp = time.Now()

	keys, err := c.client.Keys(ctx, "session:*").Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get session keys: %w", err)
	}

	metrics.TotalSessions = int64(len(keys))

	sessionsByDevice := make(map[string]int64)
	for _, key := range keys {
		if data, err := c.client.Get(ctx, key).Bytes(); err == nil {
			var snapshot models.SessionSnapshot
			if err := json.Unmarshal(data, &snapshot); err == nil {
				sessionsByDevice[snapshot.DeviceID]++
			}
		}
	}
	metrics.SessionsByDevice = sessionsByDevice

	return &metrics, nil
}

func (c *Client) GetSnapshotMetrics(ctx context.Context) (*models.SnapshotMetrics, error) {
	var metrics models.SnapshotMetrics

	metrics.Timestamp = time.Now()

	keys, err := c.client.Keys(ctx, "session:*").Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get snapshot keys: %w", err)
	}

	metrics.TotalSnapshots = int64(len(keys))

	var totalSize int64
	var compressedCount int64
	var oldestTime time.Time
	var newestTime time.Time

	for _, key := range keys {
		size, err := c.client.MemoryUsage(ctx, key).Result()
		if err == nil {
			totalSize += size
		}

		if data, err := c.client.Get(ctx, key).Bytes(); err == nil {
			var snapshot models.SessionSnapshot
			if err := json.Unmarshal(data, &snapshot); err == nil {
				if snapshot.Compressed {
					compressedCount++
				}
				if oldestTime.IsZero() || snapshot.CreatedAt.Before(oldestTime) {
					oldestTime = snapshot.CreatedAt
				}
				if newestTime.IsZero() || snapshot.CreatedAt.After(newestTime) {
					newestTime = snapshot.CreatedAt
				}
			}
		}
	}

	metrics.TotalSize = totalSize
	if metrics.TotalSnapshots > 0 {
		metrics.AverageSize = float64(totalSize) / float64(metrics.TotalSnapshots)
	}
	metrics.CompressedSnapshots = compressedCount
	metrics.OldestSnapshot = oldestTime
	metrics.NewestSnapshot = newestTime

	return &metrics, nil
}

func (c *Client) GetAllSessionIDs(ctx context.Context) ([]string, error) {
	keys, err := c.client.Keys(ctx, "session:*").Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get session keys: %w", err)
	}

	sessionIDs := make([]string, 0, len(keys))
	for _, key := range keys {
		if len(key) > 8 {
			sessionIDs = append(sessionIDs, key[8:])
		}
	}

	return sessionIDs, nil
}

func (c *Client) Set(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	return c.client.Set(ctx, key, value, ttl).Err()
}

func (c *Client) Get(ctx context.Context, key string) (string, error) {
	return c.client.Get(ctx, key).Result()
}

func (c *Client) Del(ctx context.Context, keys ...string) error {
	return c.client.Del(ctx, keys...).Err()
}

func calculateChecksum(data []byte) string {
	hash := sha256.Sum256(data)
	return fmt.Sprintf("%x", hash[:8])
}
