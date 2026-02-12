package models

import (
	"time"
)

const (
	SnapshotTTL           = 7 * 24 * time.Hour // 7 days
	MaxConnectionsPerUser = 10
	HeartbeatInterval     = 30 * time.Second
	HeartbeatTimeout      = 60 * time.Second
	WriteTimeout          = 10 * time.Second
	ReadTimeout           = 60 * time.Second
	HandoffTokenTTL       = 5 * time.Minute
	DevicePresenceTTL     = 2 * time.Minute
)

type SessionSnapshot struct {
	SessionID   string                 `json:"session_id"`
	UserID      string                 `json:"user_id"`
	StateData   map[string]interface{} `json:"state_data"`
	CreatedAt   time.Time              `json:"created_at"`
	ExpiresAt   time.Time              `json:"expires_at"`
	DeviceID    string                 `json:"device_id"`
	AppVersion  string                 `json:"app_version"`
	LastUpdated time.Time              `json:"last_updated"`
	Version     int64                  `json:"version"`
	Checksum    string                 `json:"checksum,omitempty"`
	Compressed  bool                   `json:"compressed"`
}

type UserClaims struct {
	UserID    string   `json:"user_id"`
	Email     string   `json:"email"`
	Roles     []string `json:"roles"`
	DeviceID  string   `json:"device_id"`
	SessionID string   `json:"session_id"`
	Exp       int64    `json:"exp"`
}

type ConnectionInfo struct {
	UserID          string
	SessionID       string
	DeviceID        string
	ConnectedAt     time.Time
	LastPing        time.Time
	IsAuthenticated bool
}

type HealthStatus struct {
	Status      string                 `json:"status"`
	Timestamp   time.Time              `json:"timestamp"`
	Version     string                 `json:"version"`
	Uptime      time.Duration          `json:"uptime"`
	Connections int64                  `json:"active_connections"`
	Metrics     map[string]interface{} `json:"metrics,omitempty"`
}

const (
	StatusHealthy   = "healthy"
	StatusDegraded  = "degraded"
	StatusUnhealthy = "unhealthy"
)

type DeviceInfo struct {
	DeviceID     string                 `json:"device_id"`
	DeviceType   string                 `json:"device_type"`
	DeviceName   string                 `json:"device_name"`
	AppVersion   string                 `json:"app_version"`
	OSVersion    string                 `json:"os_version"`
	ConnectedAt  time.Time              `json:"connected_at"`
	LastSeen     time.Time              `json:"last_seen"`
	IsOnline     bool                   `json:"is_online"`
	SessionID    string                 `json:"session_id"`
	UserID       string                 `json:"user_id"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	IPAddress    string                 `json:"ip_address"`
	ConnectionID string                 `json:"connection_id,omitempty"`
}

type HandoffToken struct {
	Token        string                 `json:"token"`
	SessionID    string                 `json:"session_id"`
	SourceDevice string                 `json:"source_device"`
	TargetDevice string                 `json:"target_device"`
	UserID       string                 `json:"user_id"`
	CreatedAt    time.Time              `json:"created_at"`
	ExpiresAt    time.Time              `json:"expires_at"`
	StateData    map[string]interface{} `json:"state_data,omitempty"`
}

type IncrementalUpdate struct {
	SessionID   string                 `json:"session_id"`
	UserID      string                 `json:"user_id"`
	DeviceID    string                 `json:"device_id"`
	BaseVersion int64                  `json:"base_version"`
	Changes     map[string]interface{} `json:"changes"`
	DeletedKeys []string               `json:"deleted_keys"`
	Timestamp   time.Time              `json:"timestamp"`
}

type ConflictInfo struct {
	SessionID       string                 `json:"session_id"`
	ServerVersion   int64                  `json:"server_version"`
	ClientVersion   int64                  `json:"client_version"`
	ServerState     map[string]interface{} `json:"server_state"`
	ClientState     map[string]interface{} `json:"client_state"`
	ConflictingKeys []string               `json:"conflicting_keys"`
	Timestamp       time.Time              `json:"timestamp"`
}

type SessionMetrics struct {
	TotalSessions     int64            `json:"total_sessions"`
	ActiveSessions    int64            `json:"active_sessions"`
	ExpiredSessions   int64            `json:"expired_sessions"`
	AverageSessionTTL float64          `json:"average_session_ttl_hours"`
	SessionsByDevice  map[string]int64 `json:"sessions_by_device"`
	Timestamp         time.Time        `json:"timestamp"`
}

type ConnectionMetrics struct {
	TotalConnections   int64            `json:"total_connections"`
	ActiveConnections  int64            `json:"active_connections"`
	AuthenticatedConns int64            `json:"authenticated_connections"`
	ConnectionsByUser  map[string]int64 `json:"connections_by_user"`
	PeakConnections    int64            `json:"peak_connections"`
	MessagesSent       int64            `json:"messages_sent"`
	MessagesReceived   int64            `json:"messages_received"`
	Timestamp          time.Time        `json:"timestamp"`
}

type SnapshotMetrics struct {
	TotalSnapshots      int64     `json:"total_snapshots"`
	TotalSize           int64     `json:"total_size_bytes"`
	AverageSize         float64   `json:"average_size_bytes"`
	CompressedSnapshots int64     `json:"compressed_snapshots"`
	OldestSnapshot      time.Time `json:"oldest_snapshot"`
	NewestSnapshot      time.Time `json:"newest_snapshot"`
	Timestamp           time.Time `json:"timestamp"`
}

type AdminMetrics struct {
	Sessions    SessionMetrics    `json:"sessions"`
	Connections ConnectionMetrics `json:"connections"`
	Snapshots   SnapshotMetrics   `json:"snapshots"`
	Timestamp   time.Time         `json:"timestamp"`
}
