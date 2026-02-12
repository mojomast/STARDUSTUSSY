/**
 * Handoff Manager - Main orchestrator for cross-device session handoff
 * Integrates all handoff components: SessionUUID, SnapshotReplay, DeviceHandoff, MultiDeviceSync
 */

import { SessionUUIDManager, SessionUUIDManagerConfig } from './SessionUUIDManager';
import { SnapshotReplayEngine, SnapshotReplayEngineConfig } from './SnapshotReplayEngine';
import { DeviceHandoffProtocol, DeviceHandoffProtocolConfig } from './DeviceHandoffProtocol';
import { MultiDeviceSyncManager } from './MultiDeviceSyncManager';
import {
  HandoffSession,
  HandoffStatus,
  HandoffToken,
  ReplayResult,
  HandoffResponse,
  HandoffDeepLink,
  PlatformType,
  PlatformOptimization,
} from '../types/handoff';
import { StateSnapshot } from '../types/snapshot';
import { SessionState } from '../types/session';
import { DeviceInfo } from '../types/device';
import { WebSocketClient } from '../core/WebSocketClient';

export interface HandoffManagerConfig {
  userId: string;
  deviceId?: string;
  websocket: WebSocketClient;
  websocketUrl: string;
  sessionUUID?: SessionUUIDManagerConfig;
  snapshotReplay?: SnapshotReplayEngineConfig;
  deviceHandoff?: DeviceHandoffProtocolConfig;
  platform?: PlatformType;
  debug?: boolean;
}

export type HandoffManagerEventType =
  | 'session-created'
  | 'session-joined'
  | 'handoff-started'
  | 'handoff-completed'
  | 'handoff-failed'
  | 'device-joined'
  | 'device-left'
  | 'state-synced'
  | 'state-conflict'
  | 'session-expired';

export interface HandoffManagerEvent {
  type: HandoffManagerEventType;
  timestamp: number;
  sessionId: string;
  deviceId: string;
  data?: Record<string, unknown>;
}

export class HandoffManager {
  private config: HandoffManagerConfig;
  public sessionUUID: SessionUUIDManager;
  public snapshotReplay: SnapshotReplayEngine;
  public deviceHandoff: DeviceHandoffProtocol;
  public multiDeviceSync: MultiDeviceSyncManager;
  
  private currentSession: HandoffSession | null = null;
  private eventListeners: Set<(event: HandoffManagerEvent) => void> = new Set();
  private initialized = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: HandoffManagerConfig) {
    this.config = config;

    // Initialize sub-components
    this.sessionUUID = new SessionUUIDManager({
      userId: config.userId,
      ...config.sessionUUID,
    });

    this.snapshotReplay = new SnapshotReplayEngine({
      debug: config.debug,
      ...config.snapshotReplay,
    });

    this.deviceHandoff = new DeviceHandoffProtocol({
      apiBaseUrl: config.websocketUrl,
      ...config.deviceHandoff,
    });

    this.multiDeviceSync = new MultiDeviceSyncManager({
      deviceId: this.sessionUUID.getDeviceId(),
      sessionId: '',
      websocket: config.websocket,
      debug: config.debug,
    });

    // Setup device handoff event forwarding
    this.deviceHandoff.subscribeToEvents((event) => {
      this.handleHandoffEvent(event);
    });
  }

  /**
   * Initialize the handoff manager
   */
  async initialize(sessionId?: string): Promise<HandoffStatus> {
    if (this.initialized) {
      return this.getStatus();
    }

    this.log('Initializing HandoffManager');

    // Try to restore existing session
    if (sessionId) {
      const joined = this.sessionUUID.joinSession(sessionId);
      if (joined) {
        this.currentSession = this.createHandoffSession(joined);
    this.multiDeviceSync = new MultiDeviceSyncManager({
      deviceId: this.sessionUUID.getDeviceId(),
      sessionId: joined.id,
      websocket: this.config.websocket,
      debug: this.config.debug ?? false,
    });
        
        this.emitEvent({
          type: 'session-joined',
          timestamp: Date.now(),
          sessionId: joined.id,
          deviceId: this.sessionUUID.getDeviceId(),
        });
      }
    } else {
      // Check for persisted session
      const current = this.sessionUUID.getCurrentSession();
      if (current) {
        this.currentSession = this.createHandoffSession(current);
        this.multiDeviceSync = new MultiDeviceSyncManager({
          deviceId: this.sessionUUID.getDeviceId(),
          sessionId: current.id,
          websocket: this.config.websocket,
          debug: this.config.debug ?? false,
        });
      }
    }

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute

    this.initialized = true;
    this.log('HandoffManager initialized');

    return this.getStatus();
  }

  /**
   * Create a new cross-device session
   */
  createSession(metadata?: Record<string, unknown>): HandoffSession {
    const sessionUUID = this.sessionUUID.createSession();
    
    this.currentSession = {
      id: sessionUUID.id,
      userId: this.config.userId,
      devices: sessionUUID.deviceList,
      activeDeviceId: this.sessionUUID.getDeviceId(),
      state: this.createInitialState(sessionUUID.id),
      createdAt: sessionUUID.createdAt,
      lastActiveAt: sessionUUID.lastActiveAt,
      expiresAt: sessionUUID.expiresAt,
      handoffHistory: [],
      metadata: metadata || {},
    };

    // Re-initialize multi-device sync with new session
    this.multiDeviceSync = new MultiDeviceSyncManager({
      deviceId: this.sessionUUID.getDeviceId(),
      sessionId: sessionUUID.id,
      websocket: this.config.websocket,
      debug: this.config.debug,
    });

    this.emitEvent({
      type: 'session-created',
      timestamp: Date.now(),
      sessionId: sessionUUID.id,
      deviceId: this.sessionUUID.getDeviceId(),
    });

    this.log('Session created:', sessionUUID.id);
    return this.currentSession;
  }

  /**
   * Join an existing session via handoff
   */
  async joinSession(sessionId: string): Promise<HandoffStatus> {
    const joined = this.sessionUUID.joinSession(sessionId);
    
    if (!joined) {
      return {
        sessionId,
        isActive: false,
        deviceCount: 0,
        activeDeviceId: null,
        pendingHandoff: false,
        lastHandoffAt: null,
      };
    }

    this.currentSession = this.createHandoffSession(joined);
    
    // Re-initialize multi-device sync
    this.multiDeviceSync = new MultiDeviceSyncManager({
      deviceId: this.sessionUUID.getDeviceId(),
      sessionId: joined.id,
      websocket: this.config.websocket,
      debug: this.config.debug,
    });

    // Register all existing devices
    for (const device of joined.deviceList) {
      this.multiDeviceSync.registerDevice(device);
    }

    this.emitEvent({
      type: 'session-joined',
      timestamp: Date.now(),
      sessionId: joined.id,
      deviceId: this.sessionUUID.getDeviceId(),
    });

    return this.getStatus();
  }

  /**
   * Generate QR code for device pairing
   */
  generateQRCode(): { dataUrl: string; token: HandoffToken } | null {
    if (!this.currentSession) return null;

    const token = this.deviceHandoff.generateHandoffToken(
      this.currentSession.id,
      this.sessionUUID.getDeviceId()
    );

    const qrData = this.deviceHandoff.generateQRCodeData(token);
    const dataUrl = this.deviceHandoff.createQRCode(qrData);

    return { dataUrl, token };
  }

  /**
   * Parse and handle scanned QR code
   */
  async scanQRCode(scannedData: string): Promise<HandoffResponse> {
    const qrData = this.deviceHandoff.parseQRCodeData(scannedData);
    
    if (!qrData) {
      return {
        approved: false,
        sessionId: '',
        sessionState: {} as SessionState,
        authToken: '',
        devices: [],
        message: 'Invalid QR code',
      };
    }

    return this.requestHandoff(qrData.token);
  }

  /**
   * Request handoff to this device
   */
  async requestHandoff(token: string): Promise<HandoffResponse> {
    const fingerprint = this.sessionUUID.getDeviceFingerprint();
    
    if (!fingerprint) {
      return {
        approved: false,
        sessionId: '',
        sessionState: {} as SessionState,
        authToken: '',
        devices: [],
        message: 'Device fingerprint not available',
      };
    }

    this.emitEvent({
      type: 'handoff-started',
      timestamp: Date.now(),
      sessionId: this.currentSession?.id || '',
      deviceId: this.sessionUUID.getDeviceId(),
    });

    const response = await this.deviceHandoff.requestHandoff(
      token,
      fingerprint,
      this.sessionUUID.getDeviceId()
    );

    if (response.approved) {
      // Join the session
      await this.joinSession(response.sessionId);
      
      // Apply the received state
      if (response.sessionState) {
        this.currentSession!.state = response.sessionState;
      }

      this.emitEvent({
        type: 'handoff-completed',
        timestamp: Date.now(),
        sessionId: response.sessionId,
        deviceId: this.sessionUUID.getDeviceId(),
        data: { devices: response.devices.length },
      });
    } else {
      this.emitEvent({
        type: 'handoff-failed',
        timestamp: Date.now(),
        sessionId: this.currentSession?.id || '',
        deviceId: this.sessionUUID.getDeviceId(),
        data: { reason: response.message },
      });
    }

    return response;
  }

  /**
   * Resume session from snapshot
   */
  async resumeFromSnapshot(
    snapshot: StateSnapshot,
    options?: { targetVersion?: number }
  ): Promise<ReplayResult> {
    if (!this.currentSession) {
      return {
        success: false,
        state: {} as SessionState,
        version: 0,
        replayedOperations: 0,
        skippedOperations: 0,
        conflicts: [],
        duration: 0,
      };
    }

    const result = await this.snapshotReplay.resumeFromSnapshot(
      snapshot,
      this.currentSession.state,
      { targetVersion: options?.targetVersion }
    );

    if (result.success) {
      this.currentSession.state = result.state;
      this.sessionUUID.updateLastActive();

      this.emitEvent({
        type: 'state-synced',
        timestamp: Date.now(),
        sessionId: this.currentSession.id,
        deviceId: this.sessionUUID.getDeviceId(),
        data: { version: result.version },
      });
    }

    return result;
  }

  /**
   * Sync state with other devices
   */
  syncState(path: string, value: unknown): void {
    if (!this.currentSession) return;

    // Acquire lock
    if (!this.multiDeviceSync.acquireLock(path)) {
      this.emitEvent({
        type: 'state-conflict',
        timestamp: Date.now(),
        sessionId: this.currentSession.id,
        deviceId: this.sessionUUID.getDeviceId(),
        data: { path },
      });
      return;
    }

    // Update local state
    this.setStateAtPath(this.currentSession.state.data, path, value);
    this.currentSession.state.version++;
    this.currentSession.state.lastModified = Date.now();
    this.sessionUUID.updateLastActive();

    // Broadcast to other devices
    this.multiDeviceSync.broadcastStateChange(
      path,
      value,
      undefined // previous value
    );

    // Release lock after a short delay
    setTimeout(() => {
      this.multiDeviceSync.releaseLock(path);
    }, 100);
  }

  /**
   * Handle incoming state change from another device
   */
  handleRemoteStateChange(deviceId: string, delta: unknown): void {
    if (!this.currentSession) return;

    const result = this.multiDeviceSync.handleRemoteStateChange(
      deviceId,
      delta as import('../types/delta').StateDelta,
      this.currentSession.state
    );

    if (result.success) {
      this.currentSession.state = result.mergedState;
      
      this.emitEvent({
        type: 'state-synced',
        timestamp: Date.now(),
        sessionId: this.currentSession.id,
        deviceId,
        data: { 
          version: result.mergedState.version,
          conflicts: result.conflicts.length 
        },
      });
    }
  }

  /**
   * Handle deep link for handoff
   */
  handleDeepLink(url: string): HandoffDeepLink | null {
    try {
      const urlObj = new URL(url);
      
      const deepLink: HandoffDeepLink = {
        scheme: urlObj.protocol.replace(':', ''),
        host: urlObj.hostname,
        path: urlObj.pathname,
        params: {},
      };

      // Extract query parameters
      urlObj.searchParams.forEach((value, key) => {
        deepLink.params[key] = value;
      });

      // Check for handoff parameters
      if (deepLink.params.token) {
        deepLink.token = deepLink.params.token;
      }
      if (deepLink.params.sessionId) {
        deepLink.sessionId = deepLink.params.sessionId;
      }

      this.log('Deep link handled:', deepLink);
      return deepLink;
    } catch {
      return null;
    }
  }

  /**
   * Process handoff from deep link
   */
  async processHandoffDeepLink(url: string): Promise<HandoffResponse | null> {
    const deepLink = this.handleDeepLink(url);
    
    if (!deepLink?.token) return null;

    return this.requestHandoff(deepLink.token);
  }

  /**
   * Get current session status
   */
  getStatus(): HandoffStatus {
    if (!this.currentSession) {
      return {
        sessionId: '',
        isActive: false,
        deviceCount: 0,
        activeDeviceId: null,
        pendingHandoff: false,
        lastHandoffAt: null,
      };
    }

    const history = this.deviceHandoff.getHandoffHistory(this.currentSession.id);
    const lastHandoff = history[0];

    return {
      sessionId: this.currentSession.id,
      isActive: !this.sessionUUID.isExpired(),
      deviceCount: this.currentSession.devices.length,
      activeDeviceId: this.currentSession.activeDeviceId,
      pendingHandoff: false, // Would be set based on pending handoff state
      lastHandoffAt: lastHandoff?.timestamp || null,
    };
  }

  /**
   * Get current session
   */
  getCurrentSession(): HandoffSession | null {
    return this.currentSession;
  }

  /**
   * Get list of devices in session
   */
  getDevices(): DeviceInfo[] {
    return this.sessionUUID.getDevices();
  }

  /**
   * Get device presence information
   */
  getDevicePresence(deviceId: string) {
    return this.multiDeviceSync.getDevicePresence(deviceId);
  }

  /**
   * Leave current session
   */
  leaveSession(): void {
    if (this.currentSession) {
      this.multiDeviceSync.unregisterDevice(this.sessionUUID.getDeviceId());
      this.sessionUUID.clearSession();
      this.currentSession = null;
    }
  }

  /**
   * Subscribe to handoff manager events
   */
  subscribe(listener: (event: HandoffManagerEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Destroy the handoff manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.multiDeviceSync.destroy();
    this.leaveSession();
    
    this.eventListeners.clear();
    this.initialized = false;
  }

  /**
   * Get platform-specific optimizations
   */
  getPlatformOptimizations(): PlatformOptimization {
    const platform = this.config.platform ?? 'web';
    const base: PlatformOptimization = {
      platform,
      batteryAware: true,
      backgroundSync: false,
      pushNotifications: false,
      maxSyncInterval: 30000,
      minSyncInterval: 1000,
    };

    switch (platform) {
      case 'ios':
      case 'android':
        return {
          ...base,
          batteryAware: true,
          backgroundSync: true,
          pushNotifications: true,
          maxSyncInterval: 60000,
          minSyncInterval: 5000,
        };
      
      case 'desktop':
        return {
          ...base,
          batteryAware: false,
          backgroundSync: true,
          pushNotifications: true,
          maxSyncInterval: 15000,
          minSyncInterval: 100,
        };
      
      case 'web':
      default:
        return base;
    }
  }

  private createHandoffSession(sessionUUID: import('../types/handoff').SessionUUID): HandoffSession {
    return {
      id: sessionUUID.id,
      userId: sessionUUID.metadata.userId,
      devices: sessionUUID.deviceList,
      activeDeviceId: this.sessionUUID.getDeviceId(),
      state: this.createInitialState(sessionUUID.id),
      createdAt: sessionUUID.createdAt,
      lastActiveAt: sessionUUID.lastActiveAt,
      expiresAt: sessionUUID.expiresAt,
      handoffHistory: [],
      metadata: {},
    };
  }

  private createInitialState(sessionId: string): SessionState {
    return {
      id: sessionId,
      userId: this.config.userId,
      deviceId: this.sessionUUID.getDeviceId(),
      version: 1,
      data: {},
      lastModified: Date.now(),
    };
  }

  private handleHandoffEvent(event: import('./DeviceHandoffProtocol').HandoffEvent): void {
    // Forward device handoff events as appropriate
    this.log('Device handoff event:', event.type);
  }

  private cleanup(): void {
    // Clean up expired tokens
    this.deviceHandoff.cleanupExpiredTokens();
    
    // Clean up stale presence data
    this.multiDeviceSync.cleanup();
    
    // Check session expiration
    if (this.currentSession && this.sessionUUID.isExpired()) {
      this.emitEvent({
        type: 'session-expired',
        timestamp: Date.now(),
        sessionId: this.currentSession.id,
        deviceId: this.sessionUUID.getDeviceId(),
      });
      
      this.leaveSession();
    }
  }

  private emitEvent(event: HandoffManagerEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        this.log('Error in event listener:', error);
      }
    });
  }

  private setStateAtPath(data: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
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

  private log(...args: unknown[]): void {
    if (this.config.debug ?? false) {
      console.log('[HandoffManager]', ...args);
    }
  }
}
