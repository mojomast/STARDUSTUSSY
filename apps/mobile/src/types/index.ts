export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface Device {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop' | 'web';
  platform: 'ios' | 'android' | 'web';
  lastSeen: Date;
  isActive: boolean;
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
}

export interface HandoffRequest {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sessionId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expiresAt: Date;
  qrCode: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegistrationData extends AuthCredentials {
  name: string;
  confirmPassword: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
}

export type BiometricType = 'fingerprint' | 'face' | 'iris' | null;

export interface BiometricState {
  isAvailable: boolean;
  type: BiometricType;
  isEnabled: boolean;
}
