export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface Device {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  platform: string;
  lastActive: string;
  isConnected?: boolean;
  isCurrentDevice?: boolean;
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface AppState {
  [key: string]: unknown;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  state: AppState;
  deviceId: string;
  lastActivity: string;
}

export interface WebSocketMessage {
  type: 'state_update' | 'device_connected' | 'device_disconnected' | 'error' | 'ping' | 'pong' | 'handoff_initiated' | 'handoff_completed';
  payload: unknown;
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  deviceId: string | null;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface SessionState {
  currentSession: SessionData | null;
  devices: Device[];
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
}

export interface HandoffRequest {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sessionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  createdAt: string;
  expiresAt: string;
}

export interface HandoffState {
  activeHandoff: HandoffRequest | null;
  handoffHistory: HandoffRequest[];
  qrCodeData: string | null;
  isScanning: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface RecentSession {
  id: string;
  deviceName: string;
  deviceType: string;
  lastActivity: string;
  state: AppState;
  snapshotSize: number;
}

export interface SessionContinuityState {
  recentSessions: RecentSession[];
  pendingResume: RecentSession | null;
  showResumePrompt: boolean;
  isRestoring: boolean;
  restorationProgress: number;
  conflictData: {
    localState: AppState;
    remoteState: AppState;
    sessionId: string;
  } | null;
  showConflictDialog: boolean;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

export interface DashboardMetric {
  name: string;
  value: number;
  change: number;
  unit: string;
  dataPoints: MetricDataPoint[];
}

export interface ActiveSessionMetrics {
  totalSessions: number;
  activeDevices: number;
  avgDevicesPerSession: number;
  geographicDistribution: {
    region: string;
    count: number;
    lat: number;
    lng: number;
  }[];
}

export interface ReconnectionMetrics {
  successRate: number;
  failureRate: number;
  avgReconnectionTime: number;
  backoffDistribution: {
    attempt: number;
    count: number;
    successRate: number;
  }[];
}

export interface SnapshotMetrics {
  snapshotsPerHour: MetricDataPoint[];
  snapshotsPerDay: MetricDataPoint[];
  storageUsage: number;
  storageLimit: number;
  ttlExpiringToday: number;
  ttlExpiringThisWeek: number;
}

export interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  message: string;
  timestamp: string;
  resolved: boolean;
  metadata?: Record<string, unknown>;
}

export interface AdminDashboardState {
  activeSessions: ActiveSessionMetrics;
  reconnectionMetrics: ReconnectionMetrics;
  snapshotMetrics: SnapshotMetrics;
  alerts: Alert[];
  timeRange: '1h' | '24h' | '7d' | '30d';
  isLoading: boolean;
  lastUpdated: string | null;
  error: string | null;
}

export type TimeRange = '1h' | '24h' | '7d' | '30d';

export interface ExportData {
  format: 'csv' | 'json';
  timeRange: TimeRange;
  metrics: string[];
}
