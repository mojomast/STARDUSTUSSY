/**
 * Session UUID Manager
 * Manages session identifiers, device fingerprinting, and session persistence
 */

import {
  SessionUUID,
  SessionMetadata,
  DeviceFingerprint,
  SESSION_TTL_MS,
} from '../types/handoff';
import { DeviceInfo, DeviceType } from '../types/device';
import { generateUUID } from '../utils/uuid';

export interface SessionUUIDManagerConfig {
  userId: string;
  sessionType?: string;
  maxDevices?: number;
  storage?: Storage;
  persistKey?: string;
}

export class SessionUUIDManager {
  private currentSession: SessionUUID | null = null;
  private deviceFingerprint: DeviceFingerprint | null = null;
  private config: Required<SessionUUIDManagerConfig>;
  private listeners: Set<(session: SessionUUID | null) => void> = new Set();

  constructor(config: SessionUUIDManagerConfig) {
    this.config = {
      sessionType: 'default',
      maxDevices: 5,
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined!,
      persistKey: 'harmonyflow_session',
      ...config,
    };

    this.loadPersistedSession();
    this.generateDeviceFingerprint();
  }

  /**
   * Generate or retrieve a unique device fingerprint
   */
  private generateDeviceFingerprint(): DeviceFingerprint {
    const stored = this.config.storage.getItem('harmonyflow_device_fp');
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DeviceFingerprint;
        this.deviceFingerprint = parsed;
        return parsed;
      } catch {
        // Invalid stored fingerprint, generate new one
      }
    }

    const fingerprint: DeviceFingerprint = {
      id: generateUUID(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      screenResolution: typeof screen !== 'undefined' 
        ? `${screen.width}x${screen.height}` 
        : 'unknown',
      timezone: typeof Intl !== 'undefined' 
        ? Intl.DateTimeFormat().resolvedOptions().timeZone 
        : 'unknown',
      language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      hardwareConcurrency: typeof navigator !== 'undefined' 
        ? navigator.hardwareConcurrency || 1 
        : 1,
      deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory,
      colorDepth: typeof screen !== 'undefined' ? screen.colorDepth : 24,
      pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      touchSupport: typeof navigator !== 'undefined' 
        ? 'ontouchstart' in window || navigator.maxTouchPoints > 0 
        : false,
      createdAt: Date.now(),
    };

    this.deviceFingerprint = fingerprint;
    this.config.storage.setItem('harmonyflow_device_fp', JSON.stringify(fingerprint));
    
    return fingerprint;
  }

  /**
   * Create a new session
   */
  createSession(): SessionUUID {
    const now = Date.now();
    
    const metadata: SessionMetadata = {
      userId: this.config.userId,
      sessionType: this.config.sessionType,
      createdBy: this.getDeviceId(),
      totalDevices: 1,
      maxDevices: this.config.maxDevices,
    };

    const session: SessionUUID = {
      id: generateUUID(),
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + SESSION_TTL_MS,
      deviceList: [this.createDeviceInfo()],
      metadata,
    };

    this.currentSession = session;
    this.persistSession();
    this.notifyListeners();

    return session;
  }

  /**
   * Join an existing session
   */
  joinSession(sessionId: string): SessionUUID | null {
    // In a real implementation, this would fetch from server
    // For now, we simulate by checking if we have a persisted session
    if (this.currentSession?.id === sessionId) {
      this.updateLastActive();
      return this.currentSession;
    }

    // Load from storage or fetch from server
    const persisted = this.config.storage.getItem(`${this.config.persistKey}_${sessionId}`);
    if (persisted) {
      try {
        const session = JSON.parse(persisted) as SessionUUID;
        
        // Check if expired
        if (session.expiresAt < Date.now()) {
          this.clearSession(sessionId);
          return null;
        }

        // Add this device if not already present
        if (!session.deviceList.find(d => d.id === this.getDeviceId())) {
          if (session.deviceList.length >= session.metadata.maxDevices) {
            throw new Error('Maximum number of devices reached for this session');
          }
          session.deviceList.push(this.createDeviceInfo());
          session.metadata.totalDevices = session.deviceList.length;
        }

        session.lastActiveAt = Date.now();
        this.currentSession = session;
        this.persistSession();
        this.notifyListeners();
        
        return session;
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionUUID | null {
    if (this.currentSession && this.currentSession.expiresAt < Date.now()) {
      this.clearSession(this.currentSession.id);
      return null;
    }
    return this.currentSession;
  }

  /**
   * Get device ID from fingerprint
   */
  getDeviceId(): string {
    return this.deviceFingerprint?.id || '';
  }

  /**
   * Get device fingerprint
   */
  getDeviceFingerprint(): DeviceFingerprint | null {
    return this.deviceFingerprint;
  }

  /**
   * Update last active timestamp
   */
  updateLastActive(): void {
    if (this.currentSession) {
      this.currentSession.lastActiveAt = Date.now();
      this.persistSession();
    }
  }

  /**
   * Add device to session
   */
  addDevice(device: DeviceInfo): boolean {
    if (!this.currentSession) return false;

    if (this.currentSession.deviceList.length >= this.currentSession.metadata.maxDevices) {
      return false;
    }

    if (!this.currentSession.deviceList.find(d => d.id === device.id)) {
      this.currentSession.deviceList.push(device);
      this.currentSession.metadata.totalDevices = this.currentSession.deviceList.length;
      this.persistSession();
      this.notifyListeners();
    }

    return true;
  }

  /**
   * Remove device from session
   */
  removeDevice(deviceId: string): boolean {
    if (!this.currentSession) return false;

    const index = this.currentSession.deviceList.findIndex(d => d.id === deviceId);
    if (index >= 0) {
      this.currentSession.deviceList.splice(index, 1);
      this.currentSession.metadata.totalDevices = this.currentSession.deviceList.length;
      this.persistSession();
      this.notifyListeners();
      return true;
    }

    return false;
  }

  /**
   * Get list of devices in session
   */
  getDevices(): DeviceInfo[] {
    return this.currentSession?.deviceList || [];
  }

  /**
   * Check if session is expired
   */
  isExpired(sessionId?: string): boolean {
    const session = sessionId 
      ? (this.currentSession?.id === sessionId ? this.currentSession : null)
      : this.currentSession;
    
    if (!session) return true;
    return session.expiresAt < Date.now();
  }

  /**
   * Extend session expiration
   */
  extendSession(): boolean {
    if (!this.currentSession) return false;

    this.currentSession.expiresAt = Date.now() + SESSION_TTL_MS;
    this.persistSession();
    return true;
  }

  /**
   * Clear/destroy session
   */
  clearSession(sessionId?: string): void {
    if (sessionId) {
      this.config.storage.removeItem(`${this.config.persistKey}_${sessionId}`);
      if (this.currentSession?.id === sessionId) {
        this.currentSession = null;
        this.notifyListeners();
      }
    } else {
      if (this.currentSession) {
        this.config.storage.removeItem(`${this.config.persistKey}_${this.currentSession.id}`);
      }
      this.currentSession = null;
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to session changes
   */
  subscribe(listener: (session: SessionUUID | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Refresh session from server data
   */
  refreshSession(sessionData: SessionUUID): void {
    this.currentSession = {
      ...sessionData,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    this.persistSession();
    this.notifyListeners();
  }

  private createDeviceInfo(): DeviceInfo {
    const fp = this.deviceFingerprint!;
    return {
      id: fp.id,
      type: this.detectDeviceType(),
      name: `${fp.platform} (${fp.screenResolution})`,
      userAgent: fp.userAgent,
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      capabilities: this.detectCapabilities(),
      connectionStatus: 'connected',
    };
  }

  private detectDeviceType(): DeviceType {
    const fp = this.deviceFingerprint!;
    const ua = fp.userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipad|ipod/.test(ua)) {
      if (/ipad|tablet/.test(ua) || (window.innerWidth > 768 && /ipad/.test(ua))) {
        return DeviceType.TABLET;
      }
      return DeviceType.MOBILE;
    }
    
    if (/wearable|watch/.test(ua)) {
      return DeviceType.WEARABLE;
    }
    
    if (/mac|win|linux/.test(ua) && !/mobile/.test(ua)) {
      return DeviceType.DESKTOP;
    }
    
    return DeviceType.WEB;
  }

  private detectCapabilities(): string[] {
    const capabilities: string[] = ['sync', 'realtime'];
    
    if (typeof Storage !== 'undefined') {
      capabilities.push('storage');
    }
    
    if (this.deviceFingerprint?.touchSupport) {
      capabilities.push('touch');
    }
    
    return capabilities;
  }

  private persistSession(): void {
    if (this.currentSession) {
      this.config.storage.setItem(
        `${this.config.persistKey}_${this.currentSession.id}`,
        JSON.stringify(this.currentSession)
      );
      this.config.storage.setItem(
        this.config.persistKey,
        this.currentSession.id
      );
    }
  }

  private loadPersistedSession(): void {
    const lastSessionId = this.config.storage.getItem(this.config.persistKey);
    if (lastSessionId) {
      const persisted = this.config.storage.getItem(`${this.config.persistKey}_${lastSessionId}`);
      if (persisted) {
        try {
          const session = JSON.parse(persisted) as SessionUUID;
          if (session.expiresAt > Date.now()) {
            this.currentSession = session;
          } else {
            this.clearSession(lastSessionId);
          }
        } catch {
          this.config.storage.removeItem(`${this.config.persistKey}_${lastSessionId}`);
        }
      }
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentSession);
      } catch (error) {
        console.error('Error in session listener:', error);
      }
    });
  }
}
