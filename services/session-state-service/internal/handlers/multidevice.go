package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"go.uber.org/zap"
)

type MultiDeviceHandler struct {
	redisClient *redis.Client
	wsManager   *protocol.Manager
	logger      *zap.Logger
}

func NewMultiDeviceHandler(redisClient *redis.Client, wsManager *protocol.Manager, logger *zap.Logger) *MultiDeviceHandler {
	return &MultiDeviceHandler{
		redisClient: redisClient,
		wsManager:   wsManager,
		logger:      logger,
	}
}

type HandoffRequest struct {
	SourceDevice string `json:"source_device" binding:"required"`
	TargetDevice string `json:"target_device" binding:"required"`
}

type HandoffResponse struct {
	Token        string    `json:"token"`
	SessionID    string    `json:"session_id"`
	SourceDevice string    `json:"source_device"`
	TargetDevice string    `json:"target_device"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type DeviceListResponse struct {
	SessionID string               `json:"session_id"`
	Devices   []*models.DeviceInfo `json:"devices"`
	Count     int                  `json:"count"`
}

func (h *MultiDeviceHandler) GetSessionDevices(c *gin.Context) {
	sessionID := c.Param("uuid")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session ID is required"})
		return
	}

	ctx := c.Request.Context()
	devices, err := h.redisClient.GetSessionDevices(ctx, sessionID)
	if err != nil {
		h.logger.Error("Failed to get session devices",
			zap.Error(err),
			zap.String("session_id", sessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve devices"})
		return
	}

	activeDevices := make([]*models.DeviceInfo, 0, len(devices))
	for _, device := range devices {
		if h.isDeviceOnline(device.DeviceID) {
			device.IsOnline = true
		}
		activeDevices = append(activeDevices, device)
	}

	c.JSON(http.StatusOK, DeviceListResponse{
		SessionID: sessionID,
		Devices:   activeDevices,
		Count:     len(activeDevices),
	})
}

func (h *MultiDeviceHandler) InitiateHandoff(c *gin.Context) {
	sessionID := c.Param("uuid")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session ID is required"})
		return
	}

	var req HandoffRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	snapshot, err := h.redisClient.GetSnapshot(ctx, sessionID)
	if err != nil {
		h.logger.Error("Failed to get snapshot for handoff",
			zap.Error(err),
			zap.String("session_id", sessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve session"})
		return
	}

	if snapshot == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	token := generateHandoffToken()
	handoffToken := &models.HandoffToken{
		Token:        token,
		SessionID:    sessionID,
		SourceDevice: req.SourceDevice,
		TargetDevice: req.TargetDevice,
		UserID:       snapshot.UserID,
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(models.HandoffTokenTTL),
		StateData:    snapshot.StateData,
	}

	if err := h.redisClient.SaveHandoffToken(ctx, handoffToken); err != nil {
		h.logger.Error("Failed to save handoff token",
			zap.Error(err),
			zap.String("session_id", sessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create handoff token"})
		return
	}

	h.broadcastHandoffNotification(snapshot.UserID, sessionID, req.SourceDevice, req.TargetDevice)

	h.logger.Info("Handoff initiated",
		zap.String("session_id", sessionID),
		zap.String("source_device", req.SourceDevice),
		zap.String("target_device", req.TargetDevice),
	)

	c.JSON(http.StatusCreated, HandoffResponse{
		Token:        token,
		SessionID:    sessionID,
		SourceDevice: req.SourceDevice,
		TargetDevice: req.TargetDevice,
		ExpiresAt:    handoffToken.ExpiresAt,
	})
}

func (h *MultiDeviceHandler) ValidateHandoffToken(c *gin.Context) {
	sessionID := c.Param("uuid")
	token := c.Param("token")

	if sessionID == "" || token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session ID and token are required"})
		return
	}

	ctx := c.Request.Context()
	handoffToken, err := h.redisClient.GetHandoffToken(ctx, token)
	if err != nil {
		h.logger.Error("Failed to get handoff token",
			zap.Error(err),
			zap.String("token", token),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to validate token"})
		return
	}

	if handoffToken == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Handoff token not found or expired"})
		return
	}

	if handoffToken.SessionID != sessionID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Token does not match session"})
		return
	}

	if time.Now().After(handoffToken.ExpiresAt) {
		_ = h.redisClient.DeleteHandoffToken(ctx, token)
		c.JSON(http.StatusGone, gin.H{"error": "Handoff token has expired"})
		return
	}

	_ = h.redisClient.DeleteHandoffToken(ctx, token)

	h.logger.Info("Handoff token validated",
		zap.String("session_id", sessionID),
		zap.String("token", token),
	)

	c.JSON(http.StatusOK, gin.H{
		"valid":         true,
		"session_id":    handoffToken.SessionID,
		"source_device": handoffToken.SourceDevice,
		"target_device": handoffToken.TargetDevice,
		"state_data":    handoffToken.StateData,
	})
}

func (h *MultiDeviceHandler) DisconnectDevice(c *gin.Context) {
	sessionID := c.Param("uuid")
	deviceID := c.Param("device_id")

	if sessionID == "" || deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session ID and device ID are required"})
		return
	}

	ctx := c.Request.Context()
	snapshot, err := h.redisClient.GetSnapshot(ctx, sessionID)
	if err != nil {
		h.logger.Error("Failed to get snapshot",
			zap.Error(err),
			zap.String("session_id", sessionID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve session"})
		return
	}

	if snapshot == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	if err := h.redisClient.RemoveDevice(ctx, deviceID, snapshot.UserID, sessionID); err != nil {
		h.logger.Error("Failed to remove device",
			zap.Error(err),
			zap.String("device_id", deviceID),
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove device"})
		return
	}

	h.wsManager.DisconnectDevice(deviceID)

	h.broadcastDeviceDisconnected(snapshot.UserID, sessionID, deviceID)

	h.logger.Info("Device disconnected",
		zap.String("device_id", deviceID),
		zap.String("session_id", sessionID),
	)

	c.JSON(http.StatusOK, gin.H{
		"message":    "Device disconnected successfully",
		"device_id":  deviceID,
		"session_id": sessionID,
	})
}

func (h *MultiDeviceHandler) isDeviceOnline(deviceID string) bool {
	_, ok := h.wsManager.GetDeviceConnection(deviceID)
	return ok
}

func (h *MultiDeviceHandler) broadcastHandoffNotification(userID, sessionID, sourceDevice, targetDevice string) {
	msg := protocol.Message{
		Type:      protocol.MessageTypeBroadcast,
		UserID:    userID,
		SessionID: sessionID,
		Timestamp: time.Now().Unix(),
		Payload: map[string]interface{}{
			"event":         "handoff_initiated",
			"source_device": sourceDevice,
			"target_device": targetDevice,
			"session_id":    sessionID,
		},
	}
	h.wsManager.Broadcast(msg)
}

func (h *MultiDeviceHandler) broadcastDeviceDisconnected(userID, sessionID, deviceID string) {
	msg := protocol.Message{
		Type:      protocol.MessageTypeDeviceLeft,
		UserID:    userID,
		SessionID: sessionID,
		DeviceID:  deviceID,
		Timestamp: time.Now().Unix(),
		Payload: map[string]interface{}{
			"event":           "device_disconnected",
			"device_id":       deviceID,
			"session_id":      sessionID,
			"disconnected_at": time.Now().Unix(),
		},
	}
	h.wsManager.Broadcast(msg)
}

func generateHandoffToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
