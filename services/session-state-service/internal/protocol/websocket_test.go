package protocol

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
)

func TestNewManager(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	assert.NotNil(t, manager)
	assert.NotNil(t, manager.connections)
	assert.NotNil(t, manager.userIndex)
	assert.NotNil(t, manager.deviceIndex)
	assert.NotNil(t, manager.register)
	assert.NotNil(t, manager.unregister)
	assert.NotNil(t, manager.broadcast)
	assert.NotNil(t, manager.adminChan)
	assert.NotNil(t, manager.logger)
	assert.Equal(t, 0, manager.GetConnectionCount())
}

func TestNewConnection(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	conn := NewConnection("test-conn-1", nil, manager, logger)

	assert.NotNil(t, conn)
	assert.Equal(t, "test-conn-1", conn.ID)
	assert.NotNil(t, conn.Send)
	assert.Equal(t, manager, conn.manager)
	assert.Equal(t, logger, conn.logger)
	assert.False(t, conn.IsAuthenticated)
	assert.False(t, conn.IsAdmin)
	assert.WithinDuration(t, time.Now(), conn.ConnectedAt, time.Second)
	assert.WithinDuration(t, time.Now(), conn.LastPing, time.Second)
}

func TestConnectionUpdateAuth(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)
	conn := NewConnection("test-conn-1", nil, manager, logger)

	conn.UpdateAuth("user-123", "session-456", "device-789")

	assert.Equal(t, "user-123", conn.UserID)
	assert.Equal(t, "session-456", conn.SessionID)
	assert.Equal(t, "device-789", conn.DeviceID)
	assert.True(t, conn.IsAuthenticated)

	info := conn.GetInfo()
	assert.Equal(t, "user-123", info.UserID)
	assert.Equal(t, "session-456", info.SessionID)
	assert.Equal(t, "device-789", info.DeviceID)
	assert.True(t, info.IsAuthenticated)
}

func TestConnectionUpdateDeviceInfo(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)
	conn := NewConnection("test-conn-1", nil, manager, logger)

	conn.UpdateDeviceInfo("mobile", "Test iPhone")

	assert.Equal(t, "mobile", conn.DeviceType)
	assert.Equal(t, "Test iPhone", conn.DeviceName)
}

func TestConnectionSetAdmin(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)
	conn := NewConnection("test-conn-1", nil, manager, logger)

	assert.False(t, conn.IsAdmin)

	conn.SetAdmin(true)
	assert.True(t, conn.IsAdmin)

	conn.SetAdmin(false)
	assert.False(t, conn.IsAdmin)
}

func TestBuildMessage(t *testing.T) {
	payload := map[string]interface{}{
		"key": "value",
		"num": 42,
	}

	msg := BuildMessage(MessageTypeStateUpdate, payload)

	assert.Equal(t, MessageTypeStateUpdate, msg.Type)
	assert.Equal(t, payload, msg.Payload)
	assert.NotZero(t, msg.Timestamp)
	assert.WithinDuration(t, time.Now(), time.Unix(msg.Timestamp, 0), time.Second)
}

func TestBuildErrorMessage(t *testing.T) {
	msg := BuildErrorMessage(404, "Not Found", "Resource does not exist")

	assert.Equal(t, MessageTypeError, msg.Type)
	assert.Equal(t, int32(404), msg.Payload["code"])
	assert.Equal(t, "Not Found", msg.Payload["message"])
	assert.Equal(t, "Resource does not exist", msg.Payload["details"])
	assert.NotZero(t, msg.Timestamp)
}

func TestManagerRegisterAndUnregister(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn2 := NewConnection("conn-2", nil, manager, logger)

	manager.Register(conn1)
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, 1, manager.GetConnectionCount())

	manager.Register(conn2)
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, 2, manager.GetConnectionCount())

	retrieved, ok := manager.GetConnection("conn-1")
	assert.True(t, ok)
	assert.Equal(t, conn1, retrieved)

	manager.Unregister(conn1)
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, 1, manager.GetConnectionCount())

	_, ok = manager.GetConnection("conn-1")
	assert.False(t, ok)
}

func TestManagerGetUserConnections(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn1.UserID = "user-1"

	conn2 := NewConnection("conn-2", nil, manager, logger)
	conn2.UserID = "user-1"

	conn3 := NewConnection("conn-3", nil, manager, logger)
	conn3.UserID = "user-2"

	manager.Register(conn1)
	manager.Register(conn2)
	manager.Register(conn3)

	time.Sleep(100 * time.Millisecond)

	user1Conns := manager.GetUserConnections("user-1")
	assert.Len(t, user1Conns, 2)

	user2Conns := manager.GetUserConnections("user-2")
	assert.Len(t, user2Conns, 1)

	user3Conns := manager.GetUserConnections("user-3")
	assert.Len(t, user3Conns, 0)
}

func TestManagerGetDeviceConnection(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn1.UserID = "user-1"
	conn1.DeviceID = "device-1"

	conn2 := NewConnection("conn-2", nil, manager, logger)
	conn2.UserID = "user-1"
	conn2.DeviceID = "device-2"

	manager.Register(conn1)
	manager.Register(conn2)

	time.Sleep(100 * time.Millisecond)

	retrieved, ok := manager.GetDeviceConnection("device-1")
	assert.True(t, ok)
	assert.Equal(t, conn1, retrieved)

	retrieved, ok = manager.GetDeviceConnection("device-2")
	assert.True(t, ok)
	assert.Equal(t, conn2, retrieved)

	_, ok = manager.GetDeviceConnection("device-3")
	assert.False(t, ok)
}

func TestManagerGetUserDeviceCount(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn1.UserID = "user-1"
	conn1.DeviceID = "device-1"

	conn2 := NewConnection("conn-2", nil, manager, logger)
	conn2.UserID = "user-1"
	conn2.DeviceID = "device-2"

	conn3 := NewConnection("conn-3", nil, manager, logger)
	conn3.UserID = "user-1"
	conn3.DeviceID = "device-1" // Same device as conn1

	manager.Register(conn1)
	manager.Register(conn2)
	manager.Register(conn3)

	time.Sleep(100 * time.Millisecond)

	count := manager.GetUserDeviceCount("user-1")
	assert.Equal(t, 2, count)
}

func TestManagerGetAllConnectedDevices(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn1.UserID = "user-1"
	conn1.DeviceID = "device-1"

	conn2 := NewConnection("conn-2", nil, manager, logger)
	conn2.UserID = "user-1"
	conn2.DeviceID = "device-2"

	conn3 := NewConnection("conn-3", nil, manager, logger)
	conn3.UserID = "user-2"
	conn3.DeviceID = "device-3"

	manager.Register(conn1)
	manager.Register(conn2)
	manager.Register(conn3)

	time.Sleep(100 * time.Millisecond)

	devices := manager.GetAllConnectedDevices()
	assert.Len(t, devices, 2)
	assert.Len(t, devices["user-1"], 2)
	assert.Len(t, devices["user-2"], 1)
}

func TestManagerBroadcast(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	msg := Message{
		Type:      MessageTypeStateUpdate,
		UserID:    "user-1",
		SessionID: "session-1",
		Payload: map[string]interface{}{
			"data": "test",
		},
	}

	manager.Broadcast(msg)
}

func TestManagerBroadcastToAdmin(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	msg := Message{
		Type: MessageTypeAdminUpdate,
		Payload: map[string]interface{}{
			"message": "Admin notification",
		},
	}

	manager.BroadcastToAdmin(msg)
}

func TestManagerDisconnectDevice(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn1.UserID = "user-1"
	conn1.DeviceID = "device-1"

	manager.Register(conn1)
	time.Sleep(100 * time.Millisecond)

	assert.Equal(t, 1, manager.GetConnectionCount())

	manager.DisconnectDevice("device-1")
	time.Sleep(100 * time.Millisecond)

	assert.Equal(t, 0, manager.GetConnectionCount())
}

func TestManagerGetMessageStats(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	sent, received := manager.GetMessageStats()
	assert.Equal(t, int64(0), sent)
	assert.Equal(t, int64(0), received)
}

func TestManagerGetPeakConnections(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	assert.Equal(t, int64(0), manager.GetPeakConnections())

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn2 := NewConnection("conn-2", nil, manager, logger)
	conn3 := NewConnection("conn-3", nil, manager, logger)

	manager.Register(conn1)
	manager.Register(conn2)
	manager.Register(conn3)

	time.Sleep(100 * time.Millisecond)

	assert.Equal(t, int64(3), manager.GetPeakConnections())

	manager.Unregister(conn1)
	time.Sleep(100 * time.Millisecond)

	assert.Equal(t, int64(3), manager.GetPeakConnections())
}

func TestManagerGetAuthenticatedCount(t *testing.T) {
	logger := zap.NewNop()
	manager := NewManager(logger)

	go manager.Run()

	assert.Equal(t, int64(0), manager.GetAuthenticatedCount())

	conn1 := NewConnection("conn-1", nil, manager, logger)
	conn1.UpdateAuth("user-1", "session-1", "device-1")

	manager.Register(conn1)
	time.Sleep(100 * time.Millisecond)

	assert.Equal(t, int64(1), manager.GetAuthenticatedCount())
}

func TestMessageTypeConstants(t *testing.T) {
	tests := []struct {
		msgType  MessageType
		expected int
	}{
		{MessageTypeUnknown, 0},
		{MessageTypeHeartbeat, 1},
		{MessageTypeHeartbeatAck, 2},
		{MessageTypeSnapshotRequest, 3},
		{MessageTypeSnapshotResponse, 4},
		{MessageTypeStateUpdate, 5},
		{MessageTypeError, 6},
		{MessageTypeAuth, 7},
		{MessageTypeAuthSuccess, 8},
		{MessageTypeAuthFailure, 9},
		{MessageTypeDeviceJoined, 10},
		{MessageTypeDeviceLeft, 11},
		{MessageTypeDeviceList, 12},
		{MessageTypeBroadcast, 13},
		{MessageTypeAdminUpdate, 14},
	}

	for _, tt := range tests {
		t.Run(tt.msgType.String(), func(t *testing.T) {
			assert.Equal(t, MessageType(tt.expected), tt.msgType)
		})
	}
}
