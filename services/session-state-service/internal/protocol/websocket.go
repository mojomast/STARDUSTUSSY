package protocol

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/harmonyflow/syncbridge/session-state-service/pkg/models"
	"go.uber.org/zap"
)

const (
	maxMessageSize = 512 * 1024 // 512KB
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 30 * time.Second
)

type MessageType int

const (
	MessageTypeUnknown MessageType = iota
	MessageTypeHeartbeat
	MessageTypeHeartbeatAck
	MessageTypeSnapshotRequest
	MessageTypeSnapshotResponse
	MessageTypeStateUpdate
	MessageTypeError
	MessageTypeAuth
	MessageTypeAuthSuccess
	MessageTypeAuthFailure
	MessageTypeDeviceJoined
	MessageTypeDeviceLeft
	MessageTypeDeviceList
	MessageTypeBroadcast
	MessageTypeAdminUpdate
)

func (mt MessageType) String() string {
	names := []string{
		"Unknown",
		"Heartbeat",
		"HeartbeatAck",
		"SnapshotRequest",
		"SnapshotResponse",
		"StateUpdate",
		"Error",
		"Auth",
		"AuthSuccess",
		"AuthFailure",
		"DeviceJoined",
		"DeviceLeft",
		"DeviceList",
		"Broadcast",
		"AdminUpdate",
	}
	if int(mt) < len(names) {
		return names[mt]
	}
	return "Unknown"
}

type Message struct {
	Type          MessageType            `json:"type"`
	SessionID     string                 `json:"session_id,omitempty"`
	UserID        string                 `json:"user_id,omitempty"`
	DeviceID      string                 `json:"device_id,omitempty"`
	Timestamp     int64                  `json:"timestamp"`
	Payload       map[string]interface{} `json:"payload,omitempty"`
	CorrelationID string                 `json:"correlation_id,omitempty"`
}

type Connection struct {
	ID              string
	Conn            *websocket.Conn
	Send            chan []byte
	UserID          string
	SessionID       string
	DeviceID        string
	DeviceType      string
	DeviceName      string
	IsAuthenticated bool
	IsAdmin         bool
	ConnectedAt     time.Time
	LastPing        time.Time

	manager *Manager
	logger  *zap.Logger
	mu      sync.RWMutex
}

type Manager struct {
	connections map[string]*Connection
	userIndex   map[string]map[string]*Connection
	deviceIndex map[string]*Connection
	register    chan *Connection
	unregister  chan *Connection
	broadcast   chan Message
	adminChan   chan Message
	logger      *zap.Logger
	mu          sync.RWMutex

	connectionCount    int64
	authenticatedConns int64
	messagesSent       int64
	messagesReceived   int64
	peakConnections    int64
}

func NewManager(logger *zap.Logger) *Manager {
	return &Manager{
		connections: make(map[string]*Connection),
		userIndex:   make(map[string]map[string]*Connection),
		deviceIndex: make(map[string]*Connection),
		register:    make(chan *Connection),
		unregister:  make(chan *Connection),
		broadcast:   make(chan Message, 256),
		adminChan:   make(chan Message, 64),
		logger:      logger,
	}
}

func (m *Manager) Run() {
	for {
		select {
		case conn := <-m.register:
			m.registerConnection(conn)
		case conn := <-m.unregister:
			m.unregisterConnection(conn)
		case msg := <-m.broadcast:
			m.handleBroadcast(msg)
		case msg := <-m.adminChan:
			m.handleAdminMessage(msg)
		}
	}
}

func (m *Manager) registerConnection(conn *Connection) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.connections[conn.ID] = conn

	if _, ok := m.userIndex[conn.UserID]; !ok {
		m.userIndex[conn.UserID] = make(map[string]*Connection)
	}
	m.userIndex[conn.UserID][conn.ID] = conn

	if conn.DeviceID != "" {
		m.deviceIndex[conn.DeviceID] = conn
	}

	m.connectionCount++
	if m.connectionCount > m.peakConnections {
		m.peakConnections = m.connectionCount
	}

	m.logger.Info("Connection registered",
		zap.String("connection_id", conn.ID),
		zap.String("user_id", conn.UserID),
		zap.String("device_id", conn.DeviceID),
		zap.Int64("total_connections", m.connectionCount),
	)

	if conn.UserID != "" && conn.SessionID != "" {
		m.notifyDeviceJoined(conn)
	}
}

func (m *Manager) unregisterConnection(conn *Connection) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.connections[conn.ID]; ok {
		delete(m.connections, conn.ID)
		close(conn.Send)

		if userConns, ok := m.userIndex[conn.UserID]; ok {
			delete(userConns, conn.ID)
			if len(userConns) == 0 {
				delete(m.userIndex, conn.UserID)
			}
		}

		if conn.DeviceID != "" {
			delete(m.deviceIndex, conn.DeviceID)
		}

		m.connectionCount--
		if conn.IsAuthenticated {
			m.authenticatedConns--
		}

		m.logger.Info("Connection unregistered",
			zap.String("connection_id", conn.ID),
			zap.String("user_id", conn.UserID),
			zap.String("device_id", conn.DeviceID),
			zap.Int64("total_connections", m.connectionCount),
		)

		if conn.UserID != "" && conn.SessionID != "" {
			m.notifyDeviceLeft(conn)
		}
	}
}

func (m *Manager) handleBroadcast(msg Message) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	m.messagesReceived++

	if msg.UserID != "" {
		if userConns, ok := m.userIndex[msg.UserID]; ok {
			for _, conn := range userConns {
				if conn.ID != msg.Payload["exclude_connection"] {
					select {
					case conn.Send <- m.serializeMessage(msg):
						m.messagesSent++
					default:
						m.logger.Warn("Send channel full, dropping message",
							zap.String("connection_id", conn.ID),
						)
					}
				}
			}
		}
	}
}

func (m *Manager) handleAdminMessage(msg Message) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, conn := range m.connections {
		if conn.IsAdmin {
			select {
			case conn.Send <- m.serializeMessage(msg):
			default:
				m.logger.Warn("Admin send channel full, dropping message",
					zap.String("connection_id", conn.ID),
				)
			}
		}
	}
}

func (m *Manager) notifyDeviceJoined(conn *Connection) {
	msg := Message{
		Type:      MessageTypeDeviceJoined,
		UserID:    conn.UserID,
		SessionID: conn.SessionID,
		DeviceID:  conn.DeviceID,
		Timestamp: time.Now().Unix(),
		Payload: map[string]interface{}{
			"connection_id": conn.ID,
			"device_type":   conn.DeviceType,
			"device_name":   conn.DeviceName,
			"connected_at":  conn.ConnectedAt.Unix(),
		},
	}

	if userConns, ok := m.userIndex[conn.UserID]; ok {
		for _, otherConn := range userConns {
			if otherConn.ID != conn.ID {
				select {
				case otherConn.Send <- m.serializeMessage(msg):
				default:
				}
			}
		}
	}
}

func (m *Manager) notifyDeviceLeft(conn *Connection) {
	msg := Message{
		Type:      MessageTypeDeviceLeft,
		UserID:    conn.UserID,
		SessionID: conn.SessionID,
		DeviceID:  conn.DeviceID,
		Timestamp: time.Now().Unix(),
		Payload: map[string]interface{}{
			"connection_id":   conn.ID,
			"disconnected_at": time.Now().Unix(),
		},
	}

	if userConns, ok := m.userIndex[conn.UserID]; ok {
		for _, otherConn := range userConns {
			select {
			case otherConn.Send <- m.serializeMessage(msg):
			default:
			}
		}
	}
}

func (m *Manager) GetConnection(id string) (*Connection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.connections[id]
	return conn, ok
}

func (m *Manager) GetUserConnections(userID string) []*Connection {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var conns []*Connection
	if userConns, ok := m.userIndex[userID]; ok {
		for _, conn := range userConns {
			conns = append(conns, conn)
		}
	}
	return conns
}

func (m *Manager) GetDeviceConnection(deviceID string) (*Connection, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conn, ok := m.deviceIndex[deviceID]
	return conn, ok
}

func (m *Manager) GetConnectionCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return int(m.connectionCount)
}

func (m *Manager) GetAuthenticatedCount() int64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.authenticatedConns
}

func (m *Manager) GetPeakConnections() int64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.peakConnections
}

func (m *Manager) GetMessageStats() (sent int64, received int64) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.messagesSent, m.messagesReceived
}

func (m *Manager) GetUserDeviceCount(userID string) int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	deviceSet := make(map[string]bool)
	if userConns, ok := m.userIndex[userID]; ok {
		for _, conn := range userConns {
			if conn.DeviceID != "" {
				deviceSet[conn.DeviceID] = true
			}
		}
	}
	return len(deviceSet)
}

func (m *Manager) GetAllConnectedDevices() map[string][]string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string][]string)
	for userID, conns := range m.userIndex {
		deviceSet := make(map[string]bool)
		for _, conn := range conns {
			if conn.DeviceID != "" {
				deviceSet[conn.DeviceID] = true
			}
		}
		for deviceID := range deviceSet {
			result[userID] = append(result[userID], deviceID)
		}
	}
	return result
}

func (m *Manager) Register(conn *Connection) {
	m.register <- conn
}

func (m *Manager) Unregister(conn *Connection) {
	m.unregister <- conn
}

func (m *Manager) Broadcast(msg Message) {
	m.broadcast <- msg
}

func (m *Manager) BroadcastToAdmin(msg Message) {
	m.adminChan <- msg
}

func (m *Manager) DisconnectDevice(deviceID string) {
	m.mu.RLock()
	conn, ok := m.deviceIndex[deviceID]
	m.mu.RUnlock()

	if ok {
		m.unregister <- conn
	}
}

func NewConnection(id string, wsConn *websocket.Conn, manager *Manager, logger *zap.Logger) *Connection {
	return &Connection{
		ID:          id,
		Conn:        wsConn,
		Send:        make(chan []byte, 256),
		ConnectedAt: time.Now(),
		LastPing:    time.Now(),
		manager:     manager,
		logger:      logger,
	}
}

func (c *Connection) ReadPump(handleMessage func(msg Message)) {
	defer func() {
		c.manager.unregister <- c
		_ = c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		c.mu.Lock()
		c.LastPing = time.Now()
		c.mu.Unlock()
		return nil
	})

	for {
		var msg Message
		err := c.Conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.logger.Error("WebSocket error", zap.Error(err))
			}
			break
		}

		msg.Timestamp = time.Now().Unix()
		handleMessage(msg)
	}
}

func (c *Connection) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			n := len(c.Send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Connection) UpdateAuth(userID, sessionID, deviceID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.UserID = userID
	c.SessionID = sessionID
	c.DeviceID = deviceID
	c.IsAuthenticated = true
	c.manager.authenticatedConns++
}

func (c *Connection) UpdateDeviceInfo(deviceType, deviceName string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.DeviceType = deviceType
	c.DeviceName = deviceName
}

func (c *Connection) SetAdmin(isAdmin bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.IsAdmin = isAdmin
}

func (c *Connection) GetInfo() models.ConnectionInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return models.ConnectionInfo{
		UserID:          c.UserID,
		SessionID:       c.SessionID,
		DeviceID:        c.DeviceID,
		ConnectedAt:     c.ConnectedAt,
		LastPing:        c.LastPing,
		IsAuthenticated: c.IsAuthenticated,
	}
}

func (m *Manager) serializeMessage(msg Message) []byte {
	data, _ := json.Marshal(msg)
	return data
}

func BuildMessage(msgType MessageType, payload map[string]interface{}) Message {
	return Message{
		Type:      msgType,
		Timestamp: time.Now().Unix(),
		Payload:   payload,
	}
}

func BuildErrorMessage(code int32, message, details string) Message {
	return Message{
		Type: MessageTypeError,
		Payload: map[string]interface{}{
			"code":    code,
			"message": message,
			"details": details,
		},
		Timestamp: time.Now().Unix(),
	}
}
