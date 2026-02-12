// Session types

export interface Session {
  id: string;
  deviceId: string;
  userId: string;
  createdAt: number;
  lastActiveAt: number;
  metadata?: Record<string, unknown>;
}

export interface SessionConfig {
  heartbeatInterval?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface SessionState {
  id: string;
  userId: string;
  deviceId: string;
  version: number;
  data: Record<string, unknown>;
  lastModified: number;
  checksum?: string;
}

export interface SessionSettings {
  duration?: number;
  audioEnabled?: boolean;
  hapticEnabled?: boolean;
  autoSave?: boolean;
  customProperties?: Record<string, unknown>;
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived';
export type SessionType = 'meditation' | 'breathing' | 'yoga' | 'mindfulness' | 'custom';
