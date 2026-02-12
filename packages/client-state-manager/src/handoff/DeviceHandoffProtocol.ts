/**
 * Device Handoff Protocol
 * Manages QR code pairing, token exchange, and secure device authorization
 */

import {
  HandoffToken,
  QRCodeData,
  HandoffRequest,
  HandoffResponse,
  DeviceAuthorization,
  DevicePermissions,
  HandoffHistoryEntry,
  DeviceFingerprint,
} from '../types/handoff';
import { DeviceInfo, DeviceType } from '../types/device';
import { SessionState } from '../types/session';
import { generateUUID, generateShortId } from '../utils/uuid';

export interface DeviceHandoffProtocolConfig {
  tokenExpiryMinutes?: number;
  maxTokenUses?: number;
  qrCodeSize?: number;
  storage?: Storage;
  apiBaseUrl?: string;
}

export type HandoffEventType = 
  | 'token-created'
  | 'token-scanned'
  | 'handoff-requested'
  | 'handoff-approved'
  | 'handoff-rejected'
  | 'handoff-completed'
  | 'handoff-failed'
  | 'device-authorized'
  | 'device-revoked';

export interface HandoffEvent {
  type: HandoffEventType;
  timestamp: number;
  sessionId: string;
  deviceId: string;
  data?: Record<string, unknown>;
}

export class DeviceHandoffProtocol {
  private config: Required<DeviceHandoffProtocolConfig>;
  private activeTokens: Map<string, HandoffToken> = new Map();
  private authorizedDevices: Map<string, DeviceAuthorization> = new Map();
  private handoffHistory: HandoffHistoryEntry[] = [];
  private eventListeners: Set<(event: HandoffEvent) => void> = new Set();

  constructor(config: DeviceHandoffProtocolConfig = {}) {
    this.config = {
      tokenExpiryMinutes: 5,
      maxTokenUses: 1,
      qrCodeSize: 256,
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined!,
      apiBaseUrl: '',
      ...config,
    };

    this.loadPersistedData();
  }

  /**
   * Generate a handoff token for device pairing
   */
  generateHandoffToken(
    sessionId: string,
    createdBy: string,
    options: { maxUses?: number; expiryMinutes?: number } = {}
  ): HandoffToken {
    const now = Date.now();
    const expiryMinutes = options.expiryMinutes || this.config.tokenExpiryMinutes;
    const maxUses = options.maxUses || this.config.maxTokenUses;

    const token: HandoffToken = {
      token: generateShortId(32),
      sessionId,
      expiresAt: now + expiryMinutes * 60 * 1000,
      maxUses,
      usedCount: 0,
      createdBy,
    };

    this.activeTokens.set(token.token, token);
    this.persistData();

    this.emitEvent({
      type: 'token-created',
      timestamp: now,
      sessionId,
      deviceId: createdBy,
      data: { token: token.token, expiresAt: token.expiresAt },
    });

    return token;
  }

  /**
   * Generate QR code data for scanning
   */
  generateQRCodeData(token: HandoffToken): QRCodeData {
    const data: QRCodeData = {
      token: token.token,
      sessionId: token.sessionId,
      expiresAt: token.expiresAt,
      checksum: this.generateChecksum(token),
    };

    return data;
  }

  /**
   * Create QR code as data URL (base64 encoded SVG)
   */
  createQRCode(data: QRCodeData): string {
    // Generate a simple QR-like representation as data URL
    // In production, use a library like qrcode.js
    const jsonData = JSON.stringify(data);
    const base64Data = btoa(jsonData);
    
    // Create a simple SVG placeholder (production: use actual QR library)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${this.config.qrCodeSize}" height="${this.config.qrCodeSize}">
        <rect width="100%" height="100%" fill="white"/>
        <rect x="10" y="10" width="30" height="30" fill="black"/>
        <rect x="${this.config.qrCodeSize - 40}" y="10" width="30" height="30" fill="black"/>
        <rect x="10" y="${this.config.qrCodeSize - 40}" width="30" height="30" fill="black"/>
        <text x="50%" y="50%" text-anchor="middle" font-size="12" font-family="monospace">
          ${base64Data.substring(0, 20)}...
        </text>
        <text x="50%" y="60%" text-anchor="middle" font-size="10" fill="#666">
          Scan to connect
        </text>
      </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  /**
   * Parse QR code data from scanned result
   */
  parseQRCodeData(scannedData: string): QRCodeData | null {
    try {
      // Handle both raw JSON and data URLs
      let jsonData = scannedData;
      
      if (scannedData.startsWith('data:')) {
        const base64Data = scannedData.split(',')[1];
        if (!base64Data) return null;
        jsonData = atob(base64Data);
      }

      const data = JSON.parse(jsonData) as QRCodeData;
      
      // Validate checksum
      const token = this.activeTokens.get(data.token);
      if (!token) return null;
      
      const expectedChecksum = this.generateChecksum(token);
      if (data.checksum !== expectedChecksum) return null;

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Request handoff using token
   */
  async requestHandoff(
    token: string,
    deviceFingerprint: DeviceFingerprint,
    sourceDeviceId: string
  ): Promise<HandoffResponse> {
    const handoffToken = this.activeTokens.get(token);

    if (!handoffToken) {
      return {
        approved: false,
        sessionId: '',
        sessionState: {} as SessionState,
        authToken: '',
        devices: [],
        message: 'Invalid or expired token',
      };
    }

    // Check expiration
    if (handoffToken.expiresAt < Date.now()) {
      this.activeTokens.delete(token);
      this.persistData();
      
      return {
        approved: false,
        sessionId: '',
        sessionState: {} as SessionState,
        authToken: '',
        devices: [],
        message: 'Token expired',
      };
    }

    // Check usage limit
    if (handoffToken.usedCount >= handoffToken.maxUses) {
      return {
        approved: false,
        sessionId: '',
        sessionState: {} as SessionState,
        authToken: '',
        devices: [],
        message: 'Token usage limit reached',
      };
    }

    const request: HandoffRequest = {
      token,
      deviceFingerprint,
      sourceDeviceId,
      targetDeviceType: deviceFingerprint.platform,
      requestedAt: Date.now(),
    };

    this.emitEvent({
      type: 'handoff-requested',
      timestamp: Date.now(),
      sessionId: handoffToken.sessionId,
      deviceId: sourceDeviceId,
      data: { targetDevice: deviceFingerprint.id },
    });

    // In production, this would call the server API
    // For now, we simulate approval
    const response = await this.simulateHandoffApproval(request, handoffToken);

    if (response.approved) {
      handoffToken.usedCount++;
      
      if (handoffToken.usedCount >= handoffToken.maxUses) {
        this.activeTokens.delete(token);
      } else {
        this.activeTokens.set(token, handoffToken);
      }
      
      this.persistData();

      // Authorize the new device
      this.authorizeDevice(
        deviceFingerprint.id,
        handoffToken.sessionId,
        handoffToken.createdBy,
        { canRead: true, canWrite: true, canDelete: false, canInvite: true }
      );

      // Add to history
      this.addHandoffHistoryEntry(
        sourceDeviceId,
        deviceFingerprint.id,
        handoffToken.sessionId,
        'success'
      );

      this.emitEvent({
        type: 'handoff-approved',
        timestamp: Date.now(),
        sessionId: handoffToken.sessionId,
        deviceId: sourceDeviceId,
        data: { newDevice: deviceFingerprint.id },
      });
    }

    return response;
  }

  /**
   * Validate a handoff token without using it
   */
  validateToken(token: string): { valid: boolean; reason?: string } {
    const handoffToken = this.activeTokens.get(token);

    if (!handoffToken) {
      return { valid: false, reason: 'Token not found' };
    }

    if (handoffToken.expiresAt < Date.now()) {
      return { valid: false, reason: 'Token expired' };
    }

    if (handoffToken.usedCount >= handoffToken.maxUses) {
      return { valid: false, reason: 'Usage limit reached' };
    }

    return { valid: true };
  }

  /**
   * Revoke a handoff token
   */
  revokeToken(token: string): boolean {
    const deleted = this.activeTokens.delete(token);
    if (deleted) {
      this.persistData();
    }
    return deleted;
  }

  /**
   * Authorize a device for session access
   */
  authorizeDevice(
    deviceId: string,
    sessionId: string,
    authorizedBy: string,
    permissions: DevicePermissions
  ): DeviceAuthorization {
    const authorization: DeviceAuthorization = {
      deviceId,
      sessionId,
      authorizedAt: Date.now(),
      authorizedBy,
      permissions,
    };

    this.authorizedDevices.set(deviceId, authorization);
    this.persistData();

    this.emitEvent({
      type: 'device-authorized',
      timestamp: Date.now(),
      sessionId,
      deviceId,
      data: { authorizedBy, permissions },
    });

    return authorization;
  }

  /**
   * Revoke device authorization
   */
  revokeDeviceAuthorization(deviceId: string): boolean {
    const auth = this.authorizedDevices.get(deviceId);
    if (auth) {
      this.authorizedDevices.delete(deviceId);
      this.persistData();

      this.emitEvent({
        type: 'device-revoked',
        timestamp: Date.now(),
        sessionId: auth.sessionId,
        deviceId,
      });

      return true;
    }
    return false;
  }

  /**
   * Check if device is authorized
   */
  isDeviceAuthorized(deviceId: string): boolean {
    return this.authorizedDevices.has(deviceId);
  }

  /**
   * Get device permissions
   */
  getDevicePermissions(deviceId: string): DevicePermissions | null {
    return this.authorizedDevices.get(deviceId)?.permissions || null;
  }

  /**
   * Get handoff history
   */
  getHandoffHistory(sessionId?: string): HandoffHistoryEntry[] {
    if (sessionId) {
      return this.handoffHistory.filter(h => {
        // Find entries related to this session
        const auth = this.authorizedDevices.get(h.toDevice.id);
        return auth?.sessionId === sessionId;
      });
    }
    return [...this.handoffHistory];
  }

  /**
   * Subscribe to handoff events
   */
  subscribeToEvents(listener: (event: HandoffEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, token] of this.activeTokens.entries()) {
      if (token.expiresAt < now) {
        this.activeTokens.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.persistData();
    }

    return cleaned;
  }

  private generateChecksum(token: HandoffToken): string {
    // Simple checksum generation
    const data = `${token.token}:${token.sessionId}:${token.expiresAt}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private async simulateHandoffApproval(
    request: HandoffRequest,
    token: HandoffToken
  ): Promise<HandoffResponse> {
    // In production, this calls the actual API
    // For testing/development, simulate success
    
    await new Promise(resolve => setTimeout(resolve, 100));

    const mockDevice: DeviceInfo = {
      id: request.deviceFingerprint.id,
      type: DeviceType.MOBILE,
      name: `${request.deviceFingerprint.platform} Device`,
      userAgent: request.deviceFingerprint.userAgent,
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      connectionStatus: 'connected',
    };

    return {
      approved: true,
      sessionId: token.sessionId,
      sessionState: {
        id: token.sessionId,
        userId: '',
        deviceId: request.deviceFingerprint.id,
        version: 1,
        data: {},
        lastModified: Date.now(),
      },
      authToken: generateShortId(64),
      devices: [mockDevice],
      message: 'Handoff approved',
    };
  }

  private addHandoffHistoryEntry(
    fromDeviceId: string,
    toDeviceId: string,
    _sessionId: string,
    status: 'success' | 'failed' | 'cancelled'
  ): void {
    // Get device info from authorized devices
    const fromAuth = this.authorizedDevices.get(fromDeviceId);
    const toAuth = this.authorizedDevices.get(toDeviceId);

    const entry: HandoffHistoryEntry = {
      id: generateUUID(),
      fromDevice: {
        id: fromDeviceId,
        type: 'web',
        connectedAt: new Date(fromAuth?.authorizedAt || Date.now()).toISOString(),
      } as DeviceInfo,
      toDevice: {
        id: toDeviceId,
        type: 'mobile',
        connectedAt: new Date(toAuth?.authorizedAt || Date.now()).toISOString(),
      } as DeviceInfo,
      timestamp: Date.now(),
      duration: 0, // Will be updated on completion
      dataTransferred: 0,
      status,
    };

    this.handoffHistory.unshift(entry);
    
    // Keep only last 100 entries
    if (this.handoffHistory.length > 100) {
      this.handoffHistory = this.handoffHistory.slice(0, 100);
    }

    this.persistData();
  }

  private emitEvent(event: HandoffEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in handoff event listener:', error);
      }
    });
  }

  private persistData(): void {
    const data = {
      tokens: Array.from(this.activeTokens.entries()),
      devices: Array.from(this.authorizedDevices.entries()),
      history: this.handoffHistory,
    };
    this.config.storage.setItem('harmonyflow_handoff', JSON.stringify(data));
  }

  private loadPersistedData(): void {
    const stored = this.config.storage.getItem('harmonyflow_handoff');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        
        if (data.tokens) {
          this.activeTokens = new Map(data.tokens);
        }
        if (data.devices) {
          this.authorizedDevices = new Map(data.devices);
        }
        if (data.history) {
          this.handoffHistory = data.history;
        }

        // Clean up expired tokens on load
        this.cleanupExpiredTokens();
      } catch {
        // Invalid data, ignore
      }
    }
  }
}
