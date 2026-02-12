package handlers

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/auth"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestNewWebSocketHandler(t *testing.T) {
	logger := zap.NewNop()
	wsManager := protocol.NewManager(logger)

	redisConfig := redis.Config{
		Addr: "localhost:6379",
		DB:   15,
	}

	redisClient, err := redis.NewClient(redisConfig, logger)
	if err != nil {
		t.Skip("Redis not available")
	}
	defer redisClient.Close()

	authConfig := auth.Config{
		SecretKey:     "test-secret",
		TokenExpiry:   15 * time.Minute,
		RefreshExpiry: 7 * 24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	handler := NewWebSocketHandler(wsManager, redisClient, authMiddleware, logger)

	assert.NotNil(t, handler)
	assert.NotNil(t, handler.wsManager)
	assert.NotNil(t, handler.redisClient)
	assert.NotNil(t, handler.authMiddleware)
	assert.NotNil(t, handler.logger)
}

func TestHandleHeartbeat(t *testing.T) {
	logger := zap.NewNop()
	wsManager := protocol.NewManager(logger)
	go wsManager.Run()

	redisConfig := redis.Config{
		Addr: "localhost:6379",
		DB:   15,
	}

	redisClient, err := redis.NewClient(redisConfig, logger)
	if err != nil {
		t.Skip("Redis not available")
	}
	defer redisClient.Close()

	authConfig := auth.Config{
		SecretKey:     "test-secret",
		TokenExpiry:   15 * time.Minute,
		RefreshExpiry: 7 * 24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	handler := NewWebSocketHandler(wsManager, redisClient, authMiddleware, logger)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/ws", handler.HandleConnection)

	server := httptest.NewServer(router)
	defer server.Close()

	wsURL := "ws" + server.URL[4:] + "/ws"

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Skip("WebSocket connection failed:", err)
	}
	defer ws.Close()

	heartbeat := protocol.Message{
		Type:      protocol.MessageTypeHeartbeat,
		Timestamp: time.Now().Unix(),
		Payload: map[string]interface{}{
			"client_time": time.Now().Unix(),
		},
	}

	err = ws.WriteJSON(heartbeat)
	require.NoError(t, err)

	ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	var response protocol.Message
	err = ws.ReadJSON(&response)
	require.NoError(t, err)

	assert.Equal(t, protocol.MessageTypeHeartbeatAck, response.Type)
	assert.NotNil(t, response.Payload["server_time"])
}

func TestBuildMessage(t *testing.T) {
	payload := map[string]interface{}{
		"test": "data",
	}

	msg := protocol.BuildMessage(protocol.MessageTypeStateUpdate, payload)

	assert.Equal(t, protocol.MessageTypeStateUpdate, msg.Type)
	assert.Equal(t, payload, msg.Payload)
}

func TestBuildErrorMessage(t *testing.T) {
	msg := protocol.BuildErrorMessage(404, "Not Found", "Details")

	assert.Equal(t, protocol.MessageTypeError, msg.Type)
	assert.Equal(t, int32(404), msg.Payload["code"])
	assert.Equal(t, "Not Found", msg.Payload["message"])
}
