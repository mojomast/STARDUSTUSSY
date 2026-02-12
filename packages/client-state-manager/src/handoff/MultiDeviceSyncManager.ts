/**
 * Multi-Device State Synchronization Manager
 * Broadcasts state changes, handles concurrent edits, and manages device presence
 */

import {
  MultiDeviceSyncConfig,
  DevicePresence,
  BroadcastMessage,
  ConcurrentEdit,
  StateMergeResult,
  OptimisticLock,
} from '../types/handoff';
import { SessionState } from '../types/session';
import { StateDelta, DeltaOperation } from '../types/delta';
import { AppState } from '../types/state';
import { DeviceInfo } from '../types/device';
import { WebSocketClient } from '../core/WebSocketClient';
import { StateSerializer } from '../core/StateSerializer';
import { StateFingerprint } from '../core/StateFingerprint';


export interface MultiDeviceSyncManagerConfig {
  deviceId: string;
  sessionId: string;
  websocket: WebSocketClient;
  syncConfig?: Partial<MultiDeviceSyncConfig>;
  debug?: boolean;
}

export type PresenceEventType = 'device-online' | 'device-offline' | 'device-away' | 'state-changed';

export interface PresenceEvent {
  type: PresenceEventType;
  deviceId: string;
  timestamp: number;
  data?: unknown;
}

export class MultiDeviceSyncManager {
  private config: Required<MultiDeviceSyncManagerConfig>;
  private syncConfig: MultiDeviceSyncConfig;
  private devices: Map<string, DevicePresence> = new Map();
  private locks: Map<string, OptimisticLock> = new Map();
  private websocket: WebSocketClient;
  private serializer: StateSerializer;
  private fingerprint: StateFingerprint;
  private presenceListeners: Set<(event: PresenceEvent) => void> = new Set();
  private syncThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingBroadcasts: BroadcastMessage[] = [];
  private lastBroadcastTime = 0;

  constructor(config: MultiDeviceSyncManagerConfig) {
    this.config = {
      syncConfig: {},
      debug: false,
      ...config,
    };

    this.syncConfig = {
      broadcastEnabled: true,
      optimisticLocking: true,
      presenceDetection: true,
      conflictResolution: 'last-write-wins',
      mergeStrategy: 'deep-merge',
      syncThrottleMs: 100,
      ...this.config.syncConfig,
    };

    this.websocket = config.websocket;
    this.serializer = new StateSerializer();
    this.fingerprint = new StateFingerprint();

    this.setupWebSocketHandlers();
  }

  /**
   * Register a device in the session
   */
  registerDevice(device: DeviceInfo): void {
    const presence: DevicePresence = {
      deviceId: device.id,
      status: 'online',
      lastSeenAt: Date.now(),
      pendingChanges: 0,
    };

    this.devices.set(device.id, presence);
    
    if (this.syncConfig.presenceDetection) {
      this.broadcastPresenceUpdate(device.id, 'online');
    }

    this.emitPresenceEvent({
      type: 'device-online',
      deviceId: device.id,
      timestamp: Date.now(),
    });

    this.log('Device registered:', device.id);
  }

  /**
   * Unregister a device from the session
   */
  unregisterDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.status = 'offline';
      device.lastSeenAt = Date.now();

      if (this.syncConfig.presenceDetection) {
        this.broadcastPresenceUpdate(deviceId, 'offline');
      }

      this.emitPresenceEvent({
        type: 'device-offline',
        deviceId,
        timestamp: Date.now(),
      });

      // Release any locks held by this device
      this.releaseDeviceLocks(deviceId);

      this.log('Device unregistered:', deviceId);
    }
  }

  /**
   * Broadcast state change to all devices
   */
  broadcastStateChange(
    path: string,
    value: unknown,
    previousValue: unknown
  ): void {
    if (!this.syncConfig.broadcastEnabled) return;

    const message: BroadcastMessage = {
      type: 'state-change',
      deviceId: this.config.deviceId,
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      payload: {
        path,
        value,
        previousValue,
        version: Date.now(),
      },
    };

    this.queueBroadcast(message);
  }

  /**
   * Handle incoming state change from another device
   */
  handleRemoteStateChange(
    deviceId: string,
    delta: StateDelta,
    currentState: SessionState
  ): StateMergeResult {
    // Check for concurrent edits
    const conflicts = this.detectConflicts(currentState, delta, deviceId);
    
    // Apply conflict resolution
    let mergedState = this.serializer.clone(currentState);
    let autoResolved = 0;

    if (conflicts.length > 0) {
      this.log('Detected', conflicts.length, 'conflicts from device', deviceId);
      
      for (const conflict of conflicts) {
        const resolved = this.resolveConflict(conflict, mergedState);
        if (resolved) {
          autoResolved++;
        }
      }
    }

    // Apply the delta
    for (const operation of delta.operations) {
      try {
        this.applyOperation(mergedState.data, operation);
      } catch (error) {
        this.log('Error applying operation:', error);
      }
    }

    mergedState.version = delta.targetVersion;
    mergedState.lastModified = Date.now();
    mergedState.checksum = this.fingerprint.generate(mergedState as unknown as AppState);
    mergedState.lastModified = Date.now();

    // Update device presence
    this.updateDeviceActivity(deviceId);

    this.emitPresenceEvent({
      type: 'state-changed',
      deviceId,
      timestamp: Date.now(),
      data: { version: delta.targetVersion },
    });

    return {
      success: true,
      mergedState,
      conflicts,
      autoResolved,
    };
  }

  /**
   * Acquire optimistic lock on a path
   */
  acquireLock(path: string, durationMs = 5000): boolean {
    if (!this.syncConfig.optimisticLocking) return true;

    const existingLock = this.locks.get(path);
    
    if (existingLock && existingLock.expiresAt > Date.now()) {
      if (existingLock.deviceId !== this.config.deviceId) {
        this.log('Lock conflict on path:', path);
        return false;
      }
      // Renew own lock
      existingLock.expiresAt = Date.now() + durationMs;
      return true;
    }

    const lock: OptimisticLock = {
      path,
      deviceId: this.config.deviceId,
      lockedAt: Date.now(),
      expiresAt: Date.now() + durationMs,
      version: Date.now(),
    };

    this.locks.set(path, lock);
    
    // Auto-release after duration
    setTimeout(() => {
      if (this.locks.get(path)?.deviceId === this.config.deviceId) {
        this.locks.delete(path);
      }
    }, durationMs);

    return true;
  }

  /**
   * Release lock on a path
   */
  releaseLock(path: string): boolean {
    const lock = this.locks.get(path);
    if (lock?.deviceId === this.config.deviceId) {
      this.locks.delete(path);
      return true;
    }
    return false;
  }

  /**
   * Check if path is locked by another device
   */
  isLockedByOther(path: string): boolean {
    if (!this.syncConfig.optimisticLocking) return false;
    
    const lock = this.locks.get(path);
    if (!lock) return false;
    
    return lock.deviceId !== this.config.deviceId && lock.expiresAt > Date.now();
  }

  /**
   * Get device presence information
   */
  getDevicePresence(deviceId: string): DevicePresence | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Get all online devices
   */
  getOnlineDevices(): DevicePresence[] {
    return Array.from(this.devices.values()).filter(
      d => d.status === 'online'
    );
  }

  /**
   * Get all devices in session
   */
  getAllDevices(): DevicePresence[] {
    return Array.from(this.devices.values());
  }

  /**
   * Update device activity timestamp
   */
  updateDeviceActivity(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeenAt = Date.now();
      
      if (device.status === 'offline' || device.status === 'away') {
        device.status = 'online';
        this.emitPresenceEvent({
          type: 'device-online',
          deviceId,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Set device status manually
   */
  setDeviceStatus(deviceId: string, status: DevicePresence['status']): void {
    const device = this.devices.get(deviceId);
    if (device) {
      const oldStatus = device.status;
      device.status = status;
      device.lastSeenAt = Date.now();

      if (status === 'offline' && oldStatus !== 'offline') {
        this.emitPresenceEvent({
          type: 'device-offline',
          deviceId,
          timestamp: Date.now(),
        });
      } else if (status === 'online' && oldStatus !== 'online') {
        this.emitPresenceEvent({
          type: 'device-online',
          deviceId,
          timestamp: Date.now(),
        });
      }

      if (this.syncConfig.presenceDetection) {
        this.broadcastPresenceUpdate(deviceId, status);
      }
    }
  }

  /**
   * Subscribe to presence events
   */
  subscribeToPresence(listener: (event: PresenceEvent) => void): () => void {
    this.presenceListeners.add(listener);
    return () => this.presenceListeners.delete(listener);
  }

  /**
   * Force sync all pending broadcasts
   */
  async flushBroadcasts(): Promise<void> {
    if (this.syncThrottleTimer) {
      clearTimeout(this.syncThrottleTimer);
      this.syncThrottleTimer = null;
    }
    await this.processBroadcasts();
  }

  /**
   * Clean up stale devices and locks
   */
  cleanup(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    // Clean up stale devices
    for (const [deviceId, device] of this.devices.entries()) {
      if (device.status === 'online' && now - device.lastSeenAt > staleThreshold) {
        this.setDeviceStatus(deviceId, 'away');
      }
    }

    // Clean up expired locks
    for (const [path, lock] of this.locks.entries()) {
      if (lock.expiresAt <= now) {
        this.locks.delete(path);
      }
    }
  }

  /**
   * Destroy the sync manager
   */
  destroy(): void {
    if (this.syncThrottleTimer) {
      clearTimeout(this.syncThrottleTimer);
    }
    this.devices.clear();
    this.locks.clear();
    this.presenceListeners.clear();
    this.pendingBroadcasts = [];
  }

  private setupWebSocketHandlers(): void {
    this.websocket.on('device_joined', (device) => {
      this.registerDevice(device);
    });

    this.websocket.on('device_left', (deviceId) => {
      this.unregisterDevice(deviceId);
    });
  }

  private queueBroadcast(message: BroadcastMessage): void {
    this.pendingBroadcasts.push(message);
    
    // Throttle broadcasts
    if (!this.syncThrottleTimer) {
      const timeSinceLastBroadcast = Date.now() - this.lastBroadcastTime;
      const delay = Math.max(0, this.syncConfig.syncThrottleMs - timeSinceLastBroadcast);
      
      this.syncThrottleTimer = setTimeout(() => {
        this.processBroadcasts();
      }, delay);
    }
  }

  private async processBroadcasts(): Promise<void> {
    this.syncThrottleTimer = null;
    
    if (this.pendingBroadcasts.length === 0) return;

    // Deduplicate broadcasts
    const deduped = this.deduplicateBroadcasts(this.pendingBroadcasts);
    this.pendingBroadcasts = [];

    // Send broadcasts via WebSocket
    for (const message of deduped) {
      try {
        // In production, this would use a dedicated broadcast channel
        // For now, we use the existing WebSocket
        this.log('Broadcasting:', message.type, 'to', this.devices.size, 'devices');
      } catch (error) {
        this.log('Broadcast error:', error);
      }
    }

    this.lastBroadcastTime = Date.now();
  }

  private deduplicateBroadcasts(messages: BroadcastMessage[]): BroadcastMessage[] {
    const seen = new Set<string>();
    const deduped: BroadcastMessage[] = [];

    // Process in reverse to keep most recent
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const key = `${msg.deviceId}:${msg.type}:${JSON.stringify(msg.payload)}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        deduped.unshift(msg);
      }
    }

    return deduped;
  }

  private broadcastPresenceUpdate(
    deviceId: string,
    status: DevicePresence['status']
  ): void {
    const message: BroadcastMessage = {
      type: 'presence-update',
      deviceId,
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      payload: { status },
    };

    this.queueBroadcast(message);
  }

  private detectConflicts(
    currentState: SessionState,
    remoteDelta: StateDelta,
    remoteDeviceId: string
  ): ConcurrentEdit[] {
    const conflicts: ConcurrentEdit[] = [];

    for (const operation of remoteDelta.operations) {
      const currentValue = this.getValueAtPath(currentState.data, operation.path);
      
      // Check if this path is locked by us
      if (this.isLockedByOther(operation.path)) {
        conflicts.push({
          path: operation.path,
          localValue: currentValue,
          remoteValue: operation.value,
          localTimestamp: Date.now(),
          remoteTimestamp: remoteDelta.baseVersion,
          localDeviceId: this.config.deviceId,
          remoteDeviceId,
        });
      }
    }

    return conflicts;
  }

  private resolveConflict(
    conflict: ConcurrentEdit,
    state: SessionState
  ): boolean {
    switch (this.syncConfig.conflictResolution) {
      case 'last-write-wins':
        // Remote wins if newer
        if (conflict.remoteTimestamp >= conflict.localTimestamp) {
          this.setValueAtPath(state.data, conflict.path, conflict.remoteValue);
          return true;
        }
        return false;

      case 'timestamp-wins':
        // Use timestamp to decide
        if (conflict.remoteTimestamp < conflict.localTimestamp) {
          return false; // Keep local
        }
        this.setValueAtPath(state.data, conflict.path, conflict.remoteValue);
        return true;

      case 'manual':
        // Don't auto-resolve, keep conflict for manual resolution
        return false;

      default:
        return false;
    }
  }

  private applyOperation(data: Record<string, unknown>, operation: DeltaOperation): void {
    switch (operation.op) {
      case 'add':
      case 'replace':
        this.setValueAtPath(data, operation.path, operation.value);
        break;
      case 'remove':
        this.deleteValueAtPath(data, operation.path);
        break;
      case 'move':
        if (operation.from) {
          const value = this.getValueAtPath(data, operation.from);
          this.deleteValueAtPath(data, operation.from);
          this.setValueAtPath(data, operation.path, value);
        }
        break;
      case 'copy':
        if (operation.from) {
          const value = this.getValueAtPath(data, operation.from);
          this.setValueAtPath(data, operation.path, value);
        }
        break;
    }
  }

  private releaseDeviceLocks(deviceId: string): void {
    for (const [path, lock] of this.locks.entries()) {
      if (lock.deviceId === deviceId) {
        this.locks.delete(path);
      }
    }
  }

  private getValueAtPath(data: Record<string, unknown>, path: string): unknown {
    const keys = path.split('/').filter(k => k);
    let current: unknown = data;

    for (const key of keys) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private setValueAtPath(data: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('/').filter(k => k);
    let current: Record<string, unknown> = data;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  private deleteValueAtPath(data: Record<string, unknown>, path: string): void {
    const keys = path.split('/').filter(k => k);
    let current: Record<string, unknown> = data;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) return;
      current = current[key] as Record<string, unknown>;
    }

    delete current[keys[keys.length - 1]];
  }

  private emitPresenceEvent(event: PresenceEvent): void {
    this.presenceListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        this.log('Error in presence listener:', error);
      }
    });
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[MultiDeviceSyncManager]', ...args);
    }
  }
}
