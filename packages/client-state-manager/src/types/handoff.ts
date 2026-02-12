/**
 * Handoff types for cross-device session management
 */

import { DeviceInfo } from './device';
import { StateSnapshot } from './snapshot';
import { SessionState } from './session';

// ============================================================================
// Session UUID Management Types
// ============================================================================

export interface SessionUUID {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  deviceList: DeviceInfo[];
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  userId: string;
  sessionType: string;
  createdBy: string;
  totalDevices: number;
  maxDevices: number;
}

export interface DeviceFingerprint {
  id: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory?: number;
  colorDepth: number;
  pixelRatio: number;
  touchSupport: boolean;
  createdAt: number;
}

export const SESSION_TTL_DAYS = 7;
export const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

// ============================================================================
// Snapshot Replay Engine Types
// ============================================================================

export interface SnapshotReplayOptions {
  targetVersion?: number;
  resumeFromTimestamp?: number;
  includePendingChanges?: boolean;
  conflictResolution?: 'server-wins' | 'client-wins' | 'merge';
}

export interface ReplayResult {
  success: boolean;
  state: SessionState;
  version: number;
  replayedOperations: number;
  skippedOperations: number;
  conflicts: ReplayConflict[];
  duration: number;
}

export interface ReplayConflict {
  path: string;
  serverValue: unknown;
  clientValue: unknown;
  resolvedValue: unknown;
  resolution: 'server-wins' | 'client-wins' | 'merged';
}

export interface DeltaReplayQueue {
  baseVersion: number;
  targetVersion: number;
  deltas: QueuedDelta[];
  snapshot: StateSnapshot | null;
}

export interface QueuedDelta {
  version: number;
  delta: unknown;
  timestamp: number;
  deviceId: string;
}

// ============================================================================
// Device Handoff Protocol Types
// ============================================================================

export interface HandoffToken {
  token: string;
  sessionId: string;
  expiresAt: number;
  maxUses: number;
  usedCount: number;
  createdBy: string;
}

export interface QRCodeData {
  token: string;
  sessionId: string;
  expiresAt: number;
  checksum: string;
}

export interface HandoffRequest {
  token: string;
  deviceFingerprint: DeviceFingerprint;
  sourceDeviceId: string;
  targetDeviceType: string;
  requestedAt: number;
}

export interface HandoffResponse {
  approved: boolean;
  sessionId: string;
  sessionState: SessionState;
  authToken: string;
  devices: DeviceInfo[];
  message?: string;
}

export interface DeviceAuthorization {
  deviceId: string;
  sessionId: string;
  authorizedAt: number;
  authorizedBy: string;
  permissions: DevicePermissions;
}

export interface DevicePermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canInvite: boolean;
}

export interface HandoffHistoryEntry {
  id: string;
  fromDevice: DeviceInfo;
  toDevice: DeviceInfo;
  timestamp: number;
  duration: number;
  dataTransferred: number;
  status: 'success' | 'failed' | 'cancelled';
}

// ============================================================================
// Multi-Device State Synchronization Types
// ============================================================================

export interface MultiDeviceSyncConfig {
  broadcastEnabled: boolean;
  optimisticLocking: boolean;
  presenceDetection: boolean;
  conflictResolution: 'last-write-wins' | 'timestamp-wins' | 'manual';
  mergeStrategy: 'deep-merge' | 'shallow-merge' | 'replace';
  syncThrottleMs: number;
}

export interface DevicePresence {
  deviceId: string;
  status: 'online' | 'offline' | 'away';
  lastSeenAt: number;
  currentState?: SessionState;
  pendingChanges: number;
}

export interface BroadcastMessage {
  type: 'state-change' | 'presence-update' | 'handoff-request' | 'handoff-complete';
  deviceId: string;
  sessionId: string;
  timestamp: number;
  payload: unknown;
}

export interface ConcurrentEdit {
  path: string;
  localValue: unknown;
  remoteValue: unknown;
  localTimestamp: number;
  remoteTimestamp: number;
  localDeviceId: string;
  remoteDeviceId: string;
}

export interface StateMergeResult {
  success: boolean;
  mergedState: SessionState;
  conflicts: ConcurrentEdit[];
  autoResolved: number;
}

export interface OptimisticLock {
  path: string;
  deviceId: string;
  lockedAt: number;
  expiresAt: number;
  version: number;
}

// ============================================================================
// Handoff Session Types
// ============================================================================

export interface HandoffSession {
  id: string;
  userId: string;
  devices: DeviceInfo[];
  activeDeviceId: string;
  state: SessionState;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  handoffHistory: HandoffHistoryEntry[];
  metadata: Record<string, unknown>;
}

export interface HandoffStatus {
  sessionId: string;
  isActive: boolean;
  deviceCount: number;
  activeDeviceId: string | null;
  pendingHandoff: boolean;
  lastHandoffAt: number | null;
}

// ============================================================================
// Deep Link Types
// ============================================================================

export interface HandoffDeepLink {
  scheme: string;
  host: string;
  path: string;
  params: Record<string, string>;
  token?: string;
  sessionId?: string;
}

export type PlatformType = 'web' | 'ios' | 'android' | 'desktop';

export interface PlatformOptimization {
  platform: PlatformType;
  batteryAware: boolean;
  backgroundSync: boolean;
  pushNotifications: boolean;
  maxSyncInterval: number;
  minSyncInterval: number;
}
