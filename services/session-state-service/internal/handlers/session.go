package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"go.uber.org/zap"
)

type SessionHandler struct {
	redisClient *redis.Client
	wsManager   *protocol.Manager
	logger      *zap.Logger
	startTime   time.Time
}

func NewSessionHandler(redisClient *redis.Client, wsManager *protocol.Manager, logger *zap.Logger) *SessionHandler {
	return &SessionHandler{
		redisClient: redisClient,
		wsManager:   wsManager,
		logger:      logger,
		startTime:   time.Now(),
	}
}

type CreateSnapshotRequest struct {
	SessionID  string                 `json:"session_id" binding:"required,uuid"`
	UserID     string                 `json:"user_id" binding:"required"`
	StateData  map[string]interface{} `json:"state_data" binding:"required"`
	DeviceID   string                 `json:"device_id"`
	AppVersion string                 `json:"app_version"`
	Version    int64                  `json:"version"`
}

type SnapshotResponse struct {
	SessionID  string    `json:"session_id"`
	UserID     string    `json:"user_id"`
	CreatedAt  time.Time `json:"created_at"`
	ExpiresAt  time.Time `json:"expires_at"`
	DeviceID   string    `json:"device_id"`
	AppVersion string    `json:"app_version"`
	Version    int64     `json:"version"`
}

type IncrementalUpdateRequest struct {
	SessionID   string                 `json:"session_id" binding:"required"`
	UserID      string                 `json:"user_id" binding:"required"`
	DeviceID    string                 `json:"device_id" binding:"required"`
	BaseVersion int64                  `json:"base_version"`
	Changes     map[string]interface{} `json:"changes"`
	DeletedKeys []string               `json:"deleted_keys"`
}

type ConflictResolutionRequest struct {
	SessionID          string                 `json:"session_id" binding:"required"`
	ClientVersion      int64                  `json:"client_version"`
	ClientState        map[string]interface{} `json:"client_state"`
	ResolutionStrategy string                 `json:"resolution_strategy"` // "server_wins", "client_wins", "merge"
}

func (h *SessionHandler) CreateSnapshot(c *gin.Context) {
	var req CreateSnapshotRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	snapshot := &models.SessionSnapshot{
		SessionID:   req.SessionID,
		UserID:      req.UserID,
		StateData:   req.StateData,
		CreatedAt:   time.Now(),
		ExpiresAt:   time.Now().Add(models.SnapshotTTL),
		DeviceID:    req.DeviceID,
		AppVersion:  req.AppVersion,
		LastUpdated: time.Now(),
		Version:     req.Version,
	}

	if snapshot.Version == 0 {
		snapshot.Version = time.Now().UnixNano()
	}

	start := time.Now()
	if err := h.redisClient.SaveSnapshot(c.Request.Context(), snapshot); err != nil {
		h.logger.Error("Failed to save snapshot",
			zap.Error(err),
			zap.String("session_id", req.SessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save snapshot"})
		return
	}

	duration := time.Since(start)
	h.logger.Info("Snapshot created",
		zap.String("session_id", req.SessionID),
		zap.String("user_id", req.UserID),
		zap.Int64("version", snapshot.Version),
		zap.Duration("duration", duration),
	)

	c.JSON(http.StatusCreated, SnapshotResponse{
		SessionID:  snapshot.SessionID,
		UserID:     snapshot.UserID,
		CreatedAt:  snapshot.CreatedAt,
		ExpiresAt:  snapshot.ExpiresAt,
		DeviceID:   snapshot.DeviceID,
		AppVersion: snapshot.AppVersion,
		Version:    snapshot.Version,
	})
}

func (h *SessionHandler) GetSnapshot(c *gin.Context) {
	sessionID := c.Param("uuid")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session ID is required"})
		return
	}

	version := int64(0)
	if v := c.Query("version"); v != "" {
		// Parse version from query parameter if needed
	}

	start := time.Now()
	var snapshot *models.SessionSnapshot
	var err error

	if version > 0 {
		snapshot, err = h.redisClient.GetSnapshotWithVersion(c.Request.Context(), sessionID, version)
	} else {
		snapshot, err = h.redisClient.GetSnapshot(c.Request.Context(), sessionID)
	}

	if err != nil {
		h.logger.Error("Failed to get snapshot",
			zap.Error(err),
			zap.String("session_id", sessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve snapshot"})
		return
	}

	if snapshot == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Snapshot not found"})
		return
	}

	duration := time.Since(start)
	h.logger.Debug("Snapshot retrieved",
		zap.String("session_id", sessionID),
		zap.Int64("version", snapshot.Version),
		zap.Duration("duration", duration),
	)

	c.JSON(http.StatusOK, snapshot)
}

func (h *SessionHandler) ApplyIncrementalUpdate(c *gin.Context) {
	var req IncrementalUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	update := &models.IncrementalUpdate{
		SessionID:   req.SessionID,
		UserID:      req.UserID,
		DeviceID:    req.DeviceID,
		BaseVersion: req.BaseVersion,
		Changes:     req.Changes,
		DeletedKeys: req.DeletedKeys,
		Timestamp:   time.Now(),
	}

	if err := h.redisClient.ApplyIncrementalUpdate(c.Request.Context(), update); err != nil {
		h.logger.Error("Failed to apply incremental update",
			zap.Error(err),
			zap.String("session_id", req.SessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to apply update"})
		return
	}

	h.logger.Info("Incremental update applied",
		zap.String("session_id", req.SessionID),
		zap.String("device_id", req.DeviceID),
	)

	c.JSON(http.StatusOK, gin.H{
		"message":    "Update applied successfully",
		"session_id": req.SessionID,
	})
}

func (h *SessionHandler) ResolveConflict(c *gin.Context) {
	var req ConflictResolutionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	serverSnapshot, err := h.redisClient.GetSnapshot(ctx, req.SessionID)
	if err != nil {
		h.logger.Error("Failed to get snapshot for conflict resolution",
			zap.Error(err),
			zap.String("session_id", req.SessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve server state"})
		return
	}

	if serverSnapshot == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	resolvedState := h.resolveConflict(serverSnapshot.StateData, req.ClientState, req.ResolutionStrategy)

	serverSnapshot.StateData = resolvedState
	serverSnapshot.Version = time.Now().UnixNano()
	serverSnapshot.LastUpdated = time.Now()

	if err := h.redisClient.SaveSnapshot(ctx, serverSnapshot); err != nil {
		h.logger.Error("Failed to save resolved snapshot",
			zap.Error(err),
			zap.String("session_id", req.SessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save resolved state"})
		return
	}

	conflictInfo := models.ConflictInfo{
		SessionID:       req.SessionID,
		ServerVersion:   serverSnapshot.Version,
		ClientVersion:   req.ClientVersion,
		ServerState:     serverSnapshot.StateData,
		ClientState:     req.ClientState,
		ConflictingKeys: h.findConflictingKeys(serverSnapshot.StateData, req.ClientState),
		Timestamp:       time.Now(),
	}

	h.logger.Info("Conflict resolved",
		zap.String("session_id", req.SessionID),
		zap.String("strategy", req.ResolutionStrategy),
		zap.Int64("new_version", serverSnapshot.Version),
	)

	c.JSON(http.StatusOK, conflictInfo)
}

func (h *SessionHandler) resolveConflict(serverState, clientState map[string]interface{}, strategy string) map[string]interface{} {
	resolved := make(map[string]interface{})

	switch strategy {
	case "client_wins":
		for k, v := range serverState {
			resolved[k] = v
		}
		for k, v := range clientState {
			resolved[k] = v
		}
	case "server_wins":
		for k, v := range clientState {
			resolved[k] = v
		}
		for k, v := range serverState {
			resolved[k] = v
		}
	case "merge":
		for k, v := range serverState {
			resolved[k] = v
		}
		for k, v := range clientState {
			if _, exists := resolved[k]; !exists {
				resolved[k] = v
			}
		}
	default:
		resolved = serverState
	}

	return resolved
}

func (h *SessionHandler) findConflictingKeys(serverState, clientState map[string]interface{}) []string {
	conflicts := []string{}

	for key, clientValue := range clientState {
		if serverValue, exists := serverState[key]; exists {
			if serverValue != clientValue {
				conflicts = append(conflicts, key)
			}
		}
	}

	return conflicts
}

func (h *SessionHandler) HealthCheck(c *gin.Context) {
	ctx := c.Request.Context()

	status := models.HealthStatus{
		Status:      models.StatusHealthy,
		Timestamp:   time.Now(),
		Version:     "1.1.0",
		Uptime:      time.Since(h.startTime),
		Connections: int64(h.wsManager.GetConnectionCount()),
		Metrics: map[string]interface{}{
			"snapshot_ttl_hours":   models.SnapshotTTL.Hours(),
			"multi_device_enabled": true,
			"versioning_enabled":   true,
		},
	}

	if err := h.redisClient.HealthCheck(ctx); err != nil {
		status.Status = models.StatusDegraded
		status.Metrics["redis_error"] = err.Error()
		h.logger.Error("Redis health check failed", zap.Error(err))
	}

	code := http.StatusOK
	if status.Status == models.StatusUnhealthy {
		code = http.StatusServiceUnavailable
	}

	c.JSON(code, status)
}
