package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/auth"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"go.uber.org/zap"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return false
		}

		allowedOrigins := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",")
		if len(allowedOrigins) == 0 {
			allowedOrigins = []string{"staging.harmonyflow.io", "production.harmonyflow.io", "localhost"}
		}

		for _, allowed := range allowedOrigins {
			allowed = strings.TrimSpace(allowed)
			if strings.EqualFold(origin, allowed) {
				return true
			}
		}
		return false
	},
}

type WebSocketHandler struct {
	wsManager      *protocol.Manager
	redisClient    *redis.Client
	authMiddleware *auth.Middleware
	logger         *zap.Logger
}

func NewWebSocketHandler(wsManager *protocol.Manager, redisClient *redis.Client, authMiddleware *auth.Middleware, logger *zap.Logger) *WebSocketHandler {
	return &WebSocketHandler{
		wsManager:      wsManager,
		redisClient:    redisClient,
		authMiddleware: authMiddleware,
		logger:         logger,
	}
}

func generateConnectionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *WebSocketHandler) HandleConnection(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error("WebSocket upgrade failed", zap.Error(err))
		return
	}

	connectionID := generateConnectionID()
	connection := protocol.NewConnection(connectionID, conn, h.wsManager, h.logger)

	h.wsManager.Register(connection)

	go connection.WritePump()
	go connection.ReadPump(h.handleMessage(connection))
}

func (h *WebSocketHandler) handleMessage(conn *protocol.Connection) func(protocol.Message) {
	return func(msg protocol.Message) {
		switch msg.Type {
		case protocol.MessageTypeHeartbeat:
			h.handleHeartbeat(conn, msg)
		case protocol.MessageTypeAuth:
			h.handleAuth(conn, msg)
		case protocol.MessageTypeSnapshotRequest:
			h.handleSnapshotRequest(conn, msg)
		case protocol.MessageTypeStateUpdate:
			h.handleStateUpdate(conn, msg)
		case protocol.MessageTypeDeviceList:
			h.handleDeviceListRequest(conn, msg)
		default:
			h.logger.Warn("Unknown message type",
				zap.Int("type", int(msg.Type)),
				zap.String("connection_id", conn.ID),
			)
		}
	}
}

func (h *WebSocketHandler) handleHeartbeat(conn *protocol.Connection, msg protocol.Message) {
	conn.LastPing = time.Now()

	response := protocol.BuildMessage(protocol.MessageTypeHeartbeatAck, map[string]interface{}{
		"server_time": time.Now().Unix(),
		"client_time": msg.Payload["client_time"],
	})

	data := h.serializeMessage(response)
	select {
	case conn.Send <- data:
	default:
		h.logger.Warn("Send channel full, dropping heartbeat ack",
			zap.String("connection_id", conn.ID),
		)
	}
}

func (h *WebSocketHandler) handleAuth(conn *protocol.Connection, msg protocol.Message) {
	token, ok := msg.Payload["token"].(string)
	if !ok {
		h.sendError(conn, 401, "Missing token", "")
		return
	}

	claims, err := h.authMiddleware.ValidateToken(token)
	if err != nil {
		h.sendError(conn, 401, "Invalid token", err.Error())
		return
	}

	conn.UpdateAuth(claims.UserID, claims.SessionID, claims.DeviceID)

	deviceType, _ := msg.Payload["device_type"].(string)
	deviceName, _ := msg.Payload["device_name"].(string)
	conn.UpdateDeviceInfo(deviceType, deviceName)

	if roles, ok := msg.Payload["roles"].([]interface{}); ok {
		for _, role := range roles {
			if role == "admin" {
				conn.SetAdmin(true)
				break
			}
		}
	}

	deviceInfo := &models.DeviceInfo{
		DeviceID:     claims.DeviceID,
		DeviceType:   deviceType,
		DeviceName:   deviceName,
		SessionID:    claims.SessionID,
		UserID:       claims.UserID,
		ConnectedAt:  conn.ConnectedAt,
		LastSeen:     time.Now(),
		IsOnline:     true,
		IPAddress:    "", // Could extract from connection
		ConnectionID: conn.ID,
	}

	if err := h.redisClient.RegisterDevice(nil, deviceInfo); err != nil {
		h.logger.Error("Failed to register device", zap.Error(err))
	}

	if snapshot, err := h.redisClient.GetSnapshot(nil, claims.SessionID); err == nil && snapshot != nil {
		response := protocol.BuildMessage(protocol.MessageTypeSnapshotResponse, map[string]interface{}{
			"session_id": snapshot.SessionID,
			"state_data": snapshot.StateData,
			"restored":   true,
			"version":    snapshot.Version,
		})
		conn.Send <- h.serializeMessage(response)
	}

	newToken, _, err := h.authMiddleware.RefreshToken(token)
	if err != nil {
		h.logger.Error("Failed to refresh token", zap.Error(err))
	}

	response := protocol.BuildMessage(protocol.MessageTypeAuthSuccess, map[string]interface{}{
		"new_token":  newToken,
		"expires_at": claims.Exp,
		"device_id":  claims.DeviceID,
		"session_id": claims.SessionID,
	})
	conn.Send <- h.serializeMessage(response)

	h.logger.Info("Connection authenticated",
		zap.String("connection_id", conn.ID),
		zap.String("user_id", claims.UserID),
		zap.String("session_id", claims.SessionID),
		zap.String("device_id", claims.DeviceID),
	)
}

func (h *WebSocketHandler) handleSnapshotRequest(conn *protocol.Connection, msg protocol.Message) {
	if !conn.IsAuthenticated {
		h.sendError(conn, 403, "Not authenticated", "")
		return
	}

	sessionID := conn.SessionID
	if sid, ok := msg.Payload["session_id"].(string); ok && sid != "" {
		sessionID = sid
	}

	snapshot, err := h.redisClient.GetSnapshot(nil, sessionID)
	if err != nil {
		h.logger.Error("Failed to get snapshot", zap.Error(err))
		h.sendError(conn, 500, "Failed to retrieve snapshot", "")
		return
	}

	var response protocol.Message
	if snapshot != nil {
		response = protocol.BuildMessage(protocol.MessageTypeSnapshotResponse, map[string]interface{}{
			"session_id": snapshot.SessionID,
			"state_data": snapshot.StateData,
			"created_at": snapshot.CreatedAt.Unix(),
			"version":    snapshot.Version,
		})
	} else {
		response = protocol.BuildMessage(protocol.MessageTypeSnapshotResponse, map[string]interface{}{
			"session_id": sessionID,
			"state_data": map[string]interface{}{},
			"created_at": nil,
			"version":    0,
		})
	}

	conn.Send <- h.serializeMessage(response)
}

func (h *WebSocketHandler) handleStateUpdate(conn *protocol.Connection, msg protocol.Message) {
	if !conn.IsAuthenticated {
		h.sendError(conn, 403, "Not authenticated", "")
		return
	}

	snapshot, err := h.redisClient.GetSnapshot(nil, conn.SessionID)
	if err != nil {
		h.logger.Error("Failed to get snapshot for update", zap.Error(err))
		h.sendError(conn, 500, "Failed to retrieve snapshot", "")
		return
	}

	if snapshot == nil {
		snapshot = &models.SessionSnapshot{
			SessionID:   conn.SessionID,
			UserID:      conn.UserID,
			StateData:   make(map[string]interface{}),
			CreatedAt:   time.Now(),
			ExpiresAt:   time.Now().Add(models.SnapshotTTL),
			LastUpdated: time.Now(),
			DeviceID:    conn.DeviceID,
		}
	}

	if key, ok := msg.Payload["key"].(string); ok {
		if value, exists := msg.Payload["value"]; exists {
			snapshot.StateData[key] = value
		} else if operation, ok := msg.Payload["operation"].(string); ok && operation == "DELETE" {
			delete(snapshot.StateData, key)
		}
	}

	snapshot.Version = time.Now().UnixNano()
	snapshot.LastUpdated = time.Now()

	if err := h.redisClient.SaveSnapshot(nil, snapshot); err != nil {
		h.logger.Error("Failed to save snapshot", zap.Error(err))
		h.sendError(conn, 500, "Failed to save snapshot", "")
		return
	}

	excludeConn := ""
	if sync, ok := msg.Payload["sync_devices"].(bool); ok && !sync {
		excludeConn = conn.ID
	}

	h.wsManager.Broadcast(protocol.Message{
		Type:      protocol.MessageTypeStateUpdate,
		UserID:    conn.UserID,
		SessionID: conn.SessionID,
		DeviceID:  conn.DeviceID,
		Payload: map[string]interface{}{
			"key":                msg.Payload["key"],
			"value":              msg.Payload["value"],
			"operation":          msg.Payload["operation"],
			"exclude_connection": excludeConn,
			"version":            snapshot.Version,
		},
		Timestamp: time.Now().Unix(),
	})
}

func (h *WebSocketHandler) handleDeviceListRequest(conn *protocol.Connection, msg protocol.Message) {
	if !conn.IsAuthenticated {
		h.sendError(conn, 403, "Not authenticated", "")
		return
	}

	ctx := context.Background()
	devices, err := h.redisClient.GetUserDevices(ctx, conn.UserID)
	if err != nil {
		h.logger.Error("Failed to get user devices", zap.Error(err))
		h.sendError(conn, 500, "Failed to retrieve devices", "")
		return
	}

	for _, device := range devices {
		if _, online := h.wsManager.GetDeviceConnection(device.DeviceID); online {
			device.IsOnline = true
		}
	}

	response := protocol.BuildMessage(protocol.MessageTypeDeviceList, map[string]interface{}{
		"devices": devices,
		"count":   len(devices),
	})

	conn.Send <- h.serializeMessage(response)
}

func (h *WebSocketHandler) sendError(conn *protocol.Connection, code int32, message, details string) {
	errMsg := protocol.BuildErrorMessage(code, message, details)
	conn.Send <- h.serializeMessage(errMsg)
}

func (h *WebSocketHandler) serializeMessage(msg protocol.Message) []byte {
	data, _ := json.Marshal(msg)
	return data
}
