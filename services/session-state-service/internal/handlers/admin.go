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

type AdminHandler struct {
	redisClient *redis.Client
	wsManager   *protocol.Manager
	logger      *zap.Logger
}

func NewAdminHandler(redisClient *redis.Client, wsManager *protocol.Manager, logger *zap.Logger) *AdminHandler {
	return &AdminHandler{
		redisClient: redisClient,
		wsManager:   wsManager,
		logger:      logger,
	}
}

func (h *AdminHandler) GetSessionMetrics(c *gin.Context) {
	ctx := c.Request.Context()

	metrics, err := h.redisClient.GetSessionMetrics(ctx)
	if err != nil {
		h.logger.Error("Failed to get session metrics", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve session metrics"})
		return
	}

	activeCount := int64(0)
	for _, count := range metrics.SessionsByDevice {
		activeCount += count
	}
	metrics.ActiveSessions = activeCount

	c.JSON(http.StatusOK, metrics)
}

func (h *AdminHandler) GetConnectionMetrics(c *gin.Context) {
	totalConns := h.wsManager.GetConnectionCount()
	authenticatedConns := h.wsManager.GetAuthenticatedCount()
	peakConns := h.wsManager.GetPeakConnections()
	messagesSent, messagesReceived := h.wsManager.GetMessageStats()

	connectedDevices := h.wsManager.GetAllConnectedDevices()
	connectionsByUser := make(map[string]int64)
	for userID, devices := range connectedDevices {
		connectionsByUser[userID] = int64(len(devices))
	}

	metrics := models.ConnectionMetrics{
		TotalConnections:   int64(totalConns),
		ActiveConnections:  int64(totalConns),
		AuthenticatedConns: authenticatedConns,
		ConnectionsByUser:  connectionsByUser,
		PeakConnections:    peakConns,
		MessagesSent:       messagesSent,
		MessagesReceived:   messagesReceived,
		Timestamp:          time.Now(),
	}

	c.JSON(http.StatusOK, metrics)
}

func (h *AdminHandler) GetSnapshotMetrics(c *gin.Context) {
	ctx := c.Request.Context()

	metrics, err := h.redisClient.GetSnapshotMetrics(ctx)
	if err != nil {
		h.logger.Error("Failed to get snapshot metrics", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve snapshot metrics"})
		return
	}

	c.JSON(http.StatusOK, metrics)
}

func (h *AdminHandler) GetAllMetrics(c *gin.Context) {
	ctx := c.Request.Context()

	sessionMetrics, err := h.redisClient.GetSessionMetrics(ctx)
	if err != nil {
		h.logger.Error("Failed to get session metrics", zap.Error(err))
		sessionMetrics = &models.SessionMetrics{Timestamp: time.Now()}
	}

	snapshotMetrics, err := h.redisClient.GetSnapshotMetrics(ctx)
	if err != nil {
		h.logger.Error("Failed to get snapshot metrics", zap.Error(err))
		snapshotMetrics = &models.SnapshotMetrics{Timestamp: time.Now()}
	}

	totalConns := h.wsManager.GetConnectionCount()
	authenticatedConns := h.wsManager.GetAuthenticatedCount()
	peakConns := h.wsManager.GetPeakConnections()
	messagesSent, messagesReceived := h.wsManager.GetMessageStats()

	connectedDevices := h.wsManager.GetAllConnectedDevices()
	connectionsByUser := make(map[string]int64)
	for userID, devices := range connectedDevices {
		connectionsByUser[userID] = int64(len(devices))
	}

	connectionMetrics := models.ConnectionMetrics{
		TotalConnections:   int64(totalConns),
		ActiveConnections:  int64(totalConns),
		AuthenticatedConns: authenticatedConns,
		ConnectionsByUser:  connectionsByUser,
		PeakConnections:    peakConns,
		MessagesSent:       messagesSent,
		MessagesReceived:   messagesReceived,
		Timestamp:          time.Now(),
	}

	metrics := models.AdminMetrics{
		Sessions:    *sessionMetrics,
		Connections: connectionMetrics,
		Snapshots:   *snapshotMetrics,
		Timestamp:   time.Now(),
	}

	c.JSON(http.StatusOK, metrics)
}

func (h *AdminHandler) GetActiveSessions(c *gin.Context) {
	ctx := c.Request.Context()

	sessionIDs, err := h.redisClient.GetAllSessionIDs(ctx)
	if err != nil {
		h.logger.Error("Failed to get session IDs", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve sessions"})
		return
	}

	sessions := make([]gin.H, 0, len(sessionIDs))
	for _, sessionID := range sessionIDs {
		snapshot, err := h.redisClient.GetSnapshot(ctx, sessionID)
		if err != nil {
			continue
		}
		if snapshot != nil {
			sessions = append(sessions, gin.H{
				"session_id":   snapshot.SessionID,
				"user_id":      snapshot.UserID,
				"device_id":    snapshot.DeviceID,
				"last_updated": snapshot.LastUpdated,
				"version":      snapshot.Version,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"sessions": sessions,
		"count":    len(sessions),
	})
}

func (h *AdminHandler) GetActiveConnections(c *gin.Context) {
	totalConns := h.wsManager.GetConnectionCount()
	connectedDevices := h.wsManager.GetAllConnectedDevices()

	c.JSON(http.StatusOK, gin.H{
		"total_connections": totalConns,
		"connected_devices": connectedDevices,
		"unique_users":      len(connectedDevices),
	})
}

func (h *AdminHandler) BroadcastAdminMessage(c *gin.Context) {
	var req struct {
		Message string `json:"message" binding:"required"`
		Type    string `json:"type,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	msg := protocol.Message{
		Type:      protocol.MessageTypeAdminUpdate,
		Timestamp: time.Now().Unix(),
		Payload: map[string]interface{}{
			"message": req.Message,
			"type":    req.Type,
			"sent_at": time.Now().Unix(),
		},
	}

	h.wsManager.BroadcastToAdmin(msg)

	h.logger.Info("Admin message broadcasted",
		zap.String("type", req.Type),
	)

	c.JSON(http.StatusOK, gin.H{
		"message": "Broadcast sent successfully",
		"type":    req.Type,
	})
}
