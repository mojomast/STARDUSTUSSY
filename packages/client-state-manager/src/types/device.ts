export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  platform: string;
  version: string;
  capabilities: DeviceCapabilities;
  lastSeenAt: number;
}

export interface DeviceInfo {
  id: string;
  type: DeviceType;
  name?: string;
  userAgent?: string;
  connectedAt: string;
  lastSeen?: string;
  capabilities?: string[];
  connectionStatus?: ConnectionStatus;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

export enum DeviceType {
  WEB = 'web',
  MOBILE = 'mobile',
  TABLET = 'tablet',
  DESKTOP = 'desktop',
  WEARABLE = 'wearable'
}

export interface DeviceCapabilities {
  canSync: boolean;
  canStoreLocally: boolean;
  supportsRealtime: boolean;
  maxStorageSize: number;
}

export interface DeviceRegistration {
  device: Device;
  token: string;
  expiresAt: number;
}
