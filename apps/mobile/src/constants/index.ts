import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

export const API_BASE_URL = __DEV__
  ? 'https://staging-api.harmonyflow.io'
  : 'https://api.harmonyflow.io';

export const WS_BASE_URL = __DEV__
  ? 'wss://staging-ws.harmonyflow.io'
  : 'wss://ws.harmonyflow.io';

export const APP_CONFIG = {
  name: 'HarmonyFlow',
  version: '1.0.0',
  buildNumber: '1',
  bundleId: Platform.select({
    ios: 'com.harmonyflow.mobile',
    android: 'com.harmonyflow.mobile',
    default: 'com.harmonyflow.mobile',
  }),
};

export const SYNC_CONFIG = {
  syncInterval: 30000, // 30 seconds
  backgroundSyncInterval: 900, // 15 minutes in seconds
  maxRetries: 3,
  retryDelay: 5000, // 5 seconds
  batchSize: 100,
};

export const STORAGE_KEYS = {
  authToken: '@harmonyflow/auth_token',
  refreshToken: '@harmonyflow/refresh_token',
  userData: '@harmonyflow/user_data',
  deviceId: '@harmonyflow/device_id',
  biometricEnabled: '@harmonyflow/biometric_enabled',
  lastSyncTime: '@harmonyflow/last_sync',
  pendingQueue: '@harmonyflow/pending_queue',
  sessionData: '@harmonyflow/session_data',
  preferences: '@harmonyflow/preferences',
};

export const DEEP_LINKS = {
  prefix: 'harmonyflow://',
  login: 'harmonyflow://login',
  handoff: 'harmonyflow://handoff',
  session: 'harmonyflow://session',
  settings: 'harmonyflow://settings',
};

export const BIOMETRIC_CONFIG = {
  title: 'Authentication Required',
  subtitle: 'Verify your identity',
  description: 'Use biometric authentication to access your account',
  cancelButton: 'Cancel',
};

export const QR_CONFIG = {
  scanTimeout: 30000, // 30 seconds
  codeSize: 200,
  codeLevel: 'M' as const,
};

export const NOTIFICATION_CHANNELS = {
  sessionAlerts: {
    id: 'session_alerts',
    name: 'Session Alerts',
    description: 'Notifications about session status and handoff requests',
    importance: 4, // High
  },
  syncAlerts: {
    id: 'sync_alerts',
    name: 'Sync Alerts',
    description: 'Notifications about sync status and conflicts',
    importance: 3, // Default
  },
};

export const NAVIGATION = {
  animationDuration: 300,
  gestureEnabled: true,
  headerShown: false,
};

export const COLORS = {
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  background: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#000000',
  textSecondary: '#8E8E93',
  border: '#C7C7CC',
  divider: '#E5E5EA',
};
