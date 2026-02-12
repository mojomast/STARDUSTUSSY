export interface TestSession {
  id: string;
  name: string;
  state: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

export interface TestDevice {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
}

export interface HandoffToken {
  token: string;
  sessionId: string;
  expiresAt: Date;
  deviceId: string;
}

export interface StateChange {
  deviceId: string;
  timestamp: number;
  path: string;
  value: unknown;
  previousValue: unknown;
}

export interface ConflictResolution {
  resolvedAt: number;
  winningDeviceId: string;
  resolutionStrategy: 'last-write-wins' | 'merge' | 'manual';
  changes: StateChange[];
}

export interface PerformanceMetrics {
  handoffLatencyMs: number;
  stateTransferTimeMs: number;
  syncLatencyMs: number;
  conflictResolutionTimeMs?: number;
  memoryUsageMB: number;
  deviceCount: number;
}

export interface DevicePresence {
  deviceId: string;
  connected: boolean;
  lastSeenAt: Date;
  joinedAt: Date;
}

export interface TestScenarioResult {
  scenario: string;
  passed: boolean;
  durationMs: number;
  metrics: PerformanceMetrics;
  errors: string[];
  warnings: string[];
}
