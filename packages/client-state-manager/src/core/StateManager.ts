import {
  AppState,
  StateData,
  StateChange,
  StateChangeListener,
  SyncStatus,
  StateSnapshot,
  StateDelta,
  DeltaResult,
  SessionState,
} from '../types';
import { WebSocketClient } from './WebSocketClient';
import { StateSerializer } from './StateSerializer';
import { StateFingerprint } from './StateFingerprint';
import { DeltaCalculator } from './DeltaCalculator';
import { generateUUID } from '../utils/uuid';
import { MemoryProfiler, checkMemoryLeakPatterns } from '../utils/memoryProfiler';

export interface StateManagerConfig {
  deviceId: string;
  userId: string;
  sessionId: string;
  websocketUrl: string;
  token: string;
  autoSync?: boolean;
  syncInterval?: number;
  debug?: boolean;
  conflictResolution?: 'server-wins' | 'client-wins' | 'manual';
  debounceMs?: number;
  maxSnapshots?: number;
  enableCompression?: boolean;
  gcInterval?: number;
}

export interface SnapshotOptions {
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface RestoreOptions {
  mergeStrategy?: 'replace' | 'merge';
  preserveLocal?: boolean;
}

export interface PerformanceMetrics {
  serializationTime: number;
  deltaCalculationTime: number;
  memoryUsage: number;
  syncCount: number;
  changeCount: number;
}

export class StateManager {
  private state: AppState;
  private config: Required<StateManagerConfig>;
  private serializer: StateSerializer;
  private fingerprint: StateFingerprint;
  private deltaCalculator: DeltaCalculator;
  private websocket: WebSocketClient;
  private listeners: Set<StateChangeListener> = new Set();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private snapshots: Map<string, StateSnapshot> = new Map();
  private pendingChanges: StateChange[] = [];
  private lastSyncTime = 0;
  private serverVersion = 0;
  private localVersion = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_WAIT: number;
  private gcTimer: ReturnType<typeof setInterval> | null = null;
  private memoryProfiler: MemoryProfiler;
  private metrics: PerformanceMetrics = {
    serializationTime: 0,
    deltaCalculationTime: 0,
    memoryUsage: 0,
    syncCount: 0,
    changeCount: 0,
  };

  constructor(config: StateManagerConfig) {
    this.config = {
      autoSync: true,
      syncInterval: 30000,
      debug: false,
      conflictResolution: 'server-wins',
      debounceMs: 50,
      maxSnapshots: 10,
      enableCompression: true,
      gcInterval: 60000,
      ...config,
    };

    this.DEBOUNCE_WAIT = this.config.debounceMs;
    this.memoryProfiler = new MemoryProfiler({ maxSnapshots: 20, checkIntervalMs: 10000 });

    this.state = this.createInitialState();
    this.serializer = new StateSerializer();
    this.fingerprint = new StateFingerprint();
    this.deltaCalculator = new DeltaCalculator();
    this.websocket = new WebSocketClient({
      url: config.websocketUrl,
      sessionId: config.sessionId,
      token: config.token,
      deviceId: config.deviceId,
      autoReconnect: true,
      enableHeartbeat: true,
    });

    this.setupWebSocketHandlers();
  }

  private createInitialState(): AppState {
    const now = Date.now();
    return {
      version: 1,
      timestamp: now,
      data: {},
      metadata: {
        lastModified: now,
        modifiedBy: this.config.deviceId,
        syncStatus: SyncStatus.SYNCED,
      },
    };
  }

  private setupWebSocketHandlers(): void {
    this.websocket.on('state_sync', (serverState, version) => {
      this.handleStateSync(serverState, version);
    });

    this.websocket.on('state_delta', (delta, version) => {
      this.handleStateDelta(delta, version);
    });

    this.websocket.on('open', () => {
      this.log('WebSocket connected');
      this.state.metadata.syncStatus = SyncStatus.SYNCED;
      this.websocket.subscribe(this.config.sessionId, this.localVersion);
    });

    this.websocket.on('close', () => {
      this.log('WebSocket disconnected');
      if (this.state.metadata.syncStatus === SyncStatus.SYNCED) {
        this.state.metadata.syncStatus = SyncStatus.ERROR;
      }
    });

    this.websocket.on('reconnecting', (attempt, delay) => {
      this.log(`Reconnecting (attempt ${attempt}, delay ${delay}ms)`);
    });

    this.websocket.on('reconnected', () => {
      this.log('WebSocket reconnected');
    });

    this.websocket.on('error_message', (error) => {
      this.log('WebSocket error:', error);
      if (error.code === 'STATE_CONFLICT') {
        this.handleConflict();
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.websocket.connect();

    if (this.config.autoSync) {
      this.startAutoSync();
    }

    this.startGarbageCollection();
    this.memoryProfiler.start();

    this.initialized = true;
    this.log('StateManager initialized');
  }

  getState(): AppState {
    return this.serializer.shallowClone(this.state);
  }

  getStateData(): StateData {
    return this.serializer.shallowClone(this.state.data);
  }

  setState(path: string, value: unknown): void {
    const previousValue = this.getValueAtPath(path);

    if (this.isEqual(previousValue, value)) return;

    this.setValueAtPath(path, value);
    this.updateLocalState();

    const change: StateChange = {
      path,
      previousValue,
      newValue: value,
      timestamp: Date.now(),
    };

    this.pendingChanges.push(change);
    this.metrics.changeCount++;
    this.notifyListeners([change]);

    if (this.config.autoSync) {
      this.debouncedSync();
    }
  }

  getStateAtPath(path: string): unknown {
    return this.getValueAtPath(path);
  }

  deleteState(path: string): void {
    const previousValue = this.getValueAtPath(path);
    
    if (previousValue === undefined) return;

    this.deleteValueAtPath(path);
    this.updateLocalState();

    const change: StateChange = {
      path,
      previousValue,
      newValue: undefined,
      timestamp: Date.now(),
    };

    this.pendingChanges.push(change);
    this.metrics.changeCount++;
    this.notifyListeners([change]);

    if (this.config.autoSync) {
      this.debouncedSync();
    }
  }

  batchUpdate(updates: Record<string, unknown>): void {
    const changes: StateChange[] = [];
    const now = Date.now();

    for (const [path, value] of Object.entries(updates)) {
      const previousValue = this.getValueAtPath(path);
      
      if (!this.isEqual(previousValue, value)) {
        this.setValueAtPath(path, value);
        changes.push({
          path,
          previousValue,
          newValue: value,
          timestamp: now,
        });
      }
    }

    if (changes.length > 0) {
      this.updateLocalState();
      this.pendingChanges.push(...changes);
      this.metrics.changeCount += changes.length;
      this.notifyListeners(changes);

      if (this.config.autoSync) {
        this.debouncedSync();
      }
    }
  }

  createSnapshot(options: SnapshotOptions = {}): StateSnapshot {
    const start = performance.now();

    const snapshot: StateSnapshot = {
      id: generateUUID(),
      timestamp: Date.now(),
      version: this.localVersion,
      data: this.serializer.shallowClone(this.state.data),
      checksum: this.fingerprint.generate(this.state),
      deviceId: this.config.deviceId,
      sessionId: this.config.sessionId,
    };

    if (options.label) {
      (snapshot as unknown as Record<string, unknown>).label = options.label;
    }

    if (options.metadata) {
      (snapshot as unknown as Record<string, unknown>).metadata = options.metadata;
    }

    this.snapshots.set(snapshot.id, snapshot);
    this.enforceSnapshotLimit();

    const duration = performance.now() - start;
    if (duration > 10) {
      console.warn(`[StateManager] Slow snapshot creation: ${duration.toFixed(2)}ms`);
    }

    this.log('Snapshot created:', snapshot.id);
    return snapshot;
  }

  private enforceSnapshotLimit(): void {
    if (this.snapshots.size <= this.config.maxSnapshots) return;

    const sortedSnapshots = Array.from(this.snapshots.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toDelete = sortedSnapshots.slice(0, this.snapshots.size - this.config.maxSnapshots);
    for (const [id] of toDelete) {
      this.snapshots.delete(id);
    }
  }

  restoreSnapshot(snapshotId: string, options: RestoreOptions = {}): boolean {
    const snapshot = this.snapshots.get(snapshotId);
    
    if (!snapshot) {
      this.log('Snapshot not found:', snapshotId);
      return false;
    }

    const currentChecksum = this.fingerprint.generate(this.state);
    if (snapshot.checksum === currentChecksum) {
      this.log('Snapshot checksum matches current state, skipping restore');
      return true;
    }

    const mergeStrategy = options.mergeStrategy || 'replace';
    const changes: StateChange[] = [];

    if (mergeStrategy === 'replace') {
      const oldData = this.state.data;
      this.state.data = this.serializer.clone(snapshot.data as StateData);
      
      const diff = this.calculateDiff(oldData, this.state.data);
      changes.push(...diff);
    } else {
      const merged = options.preserveLocal
        ? this.mergeData(this.state.data, snapshot.data as StateData)
        : this.mergeData(snapshot.data as StateData, this.state.data);
      
      const oldData = this.state.data;
      this.state.data = merged as StateData;
      
      const diff = this.calculateDiff(oldData, this.state.data);
      changes.push(...diff);
    }

    this.updateLocalState();
    this.pendingChanges.push(...changes);
    this.notifyListeners(changes);

    this.log('State restored from snapshot:', snapshotId);
    return true;
  }

  getSnapshot(snapshotId: string): StateSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  listSnapshots(): StateSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  deleteSnapshot(snapshotId: string): boolean {
    const deleted = this.snapshots.delete(snapshotId);
    if (deleted) {
      this.log('Snapshot deleted:', snapshotId);
    }
    return deleted;
  }

  calculateDelta(fromVersion?: number): StateDelta | null {
    const start = performance.now();

    const baseVersion = fromVersion || this.serverVersion;
    
    if (baseVersion >= this.localVersion) {
      return null;
    }

    const result: DeltaResult = this.deltaCalculator.calculateDelta(
      {},
      this.state.data,
      baseVersion,
      this.localVersion,
      { compress: this.config.enableCompression }
    );

    this.metrics.deltaCalculationTime = performance.now() - start;

    return result.hasChanges ? result.delta : null;
  }

  applyDelta(delta: StateDelta): void {
    const changes = this.deltaCalculator.applyDelta(this.state.data, delta);
    
    if (changes.length > 0) {
      this.updateLocalState();
      this.pendingChanges.push(...changes);
      this.notifyListeners(changes);
    }

    this.serverVersion = delta.targetVersion;
  }

  async sync(): Promise<void> {
    if (!this.initialized) {
      throw new Error('StateManager not initialized');
    }

    if (this.state.metadata.syncStatus === SyncStatus.SYNCED) {
      return;
    }

    this.state.metadata.syncStatus = SyncStatus.PENDING;

    try {
      const start = performance.now();

      const sessionState: SessionState = {
        id: this.config.sessionId,
        userId: this.config.userId,
        deviceId: this.config.deviceId,
        version: this.localVersion,
        data: this.state.data,
        lastModified: Date.now(),
        checksum: this.fingerprint.generate(this.state),
      };

      await this.websocket.sendStateUpdate(sessionState);

      this.metrics.serializationTime = performance.now() - start;
      this.metrics.syncCount++;

      this.state.metadata.syncStatus = SyncStatus.SYNCED;
      this.pendingChanges = [];
      this.lastSyncTime = Date.now();
      this.log('State synced successfully');
    } catch (error) {
      this.state.metadata.syncStatus = SyncStatus.ERROR;
      this.log('Sync failed:', error);
      throw error;
    }
  }

  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getCurrentFingerprint(): string {
    return this.fingerprint.generate(this.state);
  }

  getVersion(): number {
    return this.localVersion;
  }

  getServerVersion(): number {
    return this.serverVersion;
  }

  getPendingChanges(): StateChange[] {
    return [...this.pendingChanges];
  }

  getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  getMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  resetMetrics(): void {
    this.metrics = {
      serializationTime: 0,
      deltaCalculationTime: 0,
      memoryUsage: 0,
      syncCount: 0,
      changeCount: 0,
    };
  }

  async destroy(): Promise<void> {
    this.stopAutoSync();
    this.stopGarbageCollection();
    this.flushDebounce();
    this.memoryProfiler.destroy();
    await this.websocket.disconnect();
    this.listeners.clear();
    this.snapshots.clear();
    this.pendingChanges = [];
    this.initialized = false;
  }

  /**
   * Get comprehensive performance metrics including memory profiling
   */
  getDetailedMetrics(): PerformanceMetrics & {
    serialization: ReturnType<StateSerializer['getMetrics']>;
    memoryAnalysis: ReturnType<MemoryProfiler['analyzeForLeaks']>;
    leakWarnings: string[];
  } {
    return {
      ...this.getMetrics(),
      serialization: this.serializer.getMetrics(),
      memoryAnalysis: this.memoryProfiler.analyzeForLeaks(),
      leakWarnings: checkMemoryLeakPatterns().warnings,
    };
  }

  /**
   * Check for potential memory leaks
   */
  checkMemoryHealth(): { healthy: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    // Check event listeners
    if (this.listeners.size > 100) {
      warnings.push(`High listener count: ${this.listeners.size} (potential leak)`);
    }

    // Check snapshots
    if (this.snapshots.size >= this.config.maxSnapshots) {
      warnings.push(`Snapshot cache at limit: ${this.snapshots.size}`);
    }

    // Check pending changes
    if (this.pendingChanges.length > 1000) {
      warnings.push(`High pending changes: ${this.pendingChanges.length}`);
    }

    // Check for memory API warnings
    warnings.push(...checkMemoryLeakPatterns().warnings);

    return {
      healthy: warnings.length === 0,
      warnings,
    };
  }

  private getValueAtPath(path: string): unknown {
    const keys = path.split('.');
    let current: unknown = this.state.data;

    for (const key of keys) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private setValueAtPath(path: string, value: unknown): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = this.state.data;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  private deleteValueAtPath(path: string): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = this.state.data;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) return;
      current = current[key] as Record<string, unknown>;
    }

    delete current[keys[keys.length - 1]];
  }

  private updateLocalState(): void {
    this.localVersion++;
    this.state.version = this.localVersion;
    this.state.timestamp = Date.now();
    this.state.metadata.lastModified = Date.now();
    this.state.metadata.modifiedBy = this.config.deviceId;
    this.state.metadata.syncStatus = SyncStatus.PENDING;
  }

  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      
      if (aKeys.length !== bKeys.length) return false;
      
      for (const key of aKeys) {
        if (!bKeys.includes(key) || !this.isEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
          return false;
        }
      }
      
      return true;
    }
    
    return false;
  }

  private notifyListeners(changes: StateChange[]): void {
    this.listeners.forEach((listener) => {
      try {
        listener(changes);
      } catch (error) {
        this.log('Error in state change listener:', error);
      }
    });
  }

  private handleStateSync(serverState: SessionState, version: number): void {
    this.log('Received state sync, version:', version);
    
    const oldData = this.state.data;
    this.state.data = serverState.data;
    this.serverVersion = version;
    this.localVersion = version;
    this.state.version = version;
    
    const changes = this.calculateDiff(oldData, this.state.data);
    
    if (changes.length > 0) {
      this.notifyListeners(changes);
    }
  }

  private handleStateDelta(delta: StateDelta, version: number): void {
    this.log('Received state delta, version:', version);
    this.applyDelta(delta);
  }

  private handleConflict(): void {
    this.log('State conflict detected');
    
    switch (this.config.conflictResolution) {
      case 'server-wins':
        this.requestFullSync();
        break;
      case 'client-wins':
        this.sync();
        break;
      case 'manual':
        this.state.metadata.syncStatus = SyncStatus.CONFLICT;
        break;
    }
  }

  private requestFullSync(): void {
    this.websocket.subscribe(this.config.sessionId, 0);
  }

  private debouncedSync = (): void => {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.sync();
    }, this.DEBOUNCE_WAIT);
  };

  private flushDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      this.sync();
    }
  }

  private startAutoSync(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      if (this.state.metadata.syncStatus === SyncStatus.PENDING) {
        this.sync();
      }
    }, this.config.syncInterval);
  }

  private stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private startGarbageCollection(): void {
    if (this.gcTimer) return;

    this.gcTimer = setInterval(() => {
      this.performGarbageCollection();
    }, this.config.gcInterval);
  }

  private stopGarbageCollection(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  private performGarbageCollection(): void {
    this.serializer.cleanup();
    this.deltaCalculator.cleanup();

    const now = Date.now();
    const oldSnapshotThreshold = 3600000;

    for (const [id, snapshot] of this.snapshots) {
      if (now - snapshot.timestamp > oldSnapshotThreshold) {
        this.snapshots.delete(id);
      }
    }

    this.log('Garbage collection completed');
  }

  private estimateMemoryUsage(): number {
    let size = 0;
    
    size += JSON.stringify(this.state).length;
    size += JSON.stringify(this.pendingChanges).length;
    
    for (const snapshot of this.snapshots.values()) {
      size += JSON.stringify(snapshot).length;
    }

    return size;
  }

  private calculateDiff(oldData: unknown, newData: unknown): StateChange[] {
    const changes: StateChange[] = [];
    const now = Date.now();

    const compare = (old: unknown, current: unknown, path: string) => {
      if (this.isEqual(old, current)) return;

      if (
        typeof old !== 'object' ||
        typeof current !== 'object' ||
        old === null ||
        current === null
      ) {
        changes.push({
          path: path || 'root',
          previousValue: old,
          newValue: current,
          timestamp: now,
        });
        return;
      }

      const oldKeys = Object.keys(old as Record<string, unknown>);
      const currentKeys = Object.keys(current as Record<string, unknown>);
      const allKeys = new Set([...oldKeys, ...currentKeys]);

      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        const oldVal = (old as Record<string, unknown>)[key];
        const currentVal = (current as Record<string, unknown>)[key];

        if (!(key in (old as Record<string, unknown>))) {
          changes.push({
            path: newPath,
            previousValue: undefined,
            newValue: currentVal,
            timestamp: now,
          });
        } else if (!(key in (current as Record<string, unknown>))) {
          changes.push({
            path: newPath,
            previousValue: oldVal,
            newValue: undefined,
            timestamp: now,
          });
        } else {
          compare(oldVal, currentVal, newPath);
        }
      }
    };

    compare(oldData, newData, '');
    return changes;
  }

  private mergeData(
    base: Record<string, unknown>,
    overlay: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...base };

    for (const [key, value] of Object.entries(overlay)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = this.mergeData(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[StateManager]', ...args);
    }
  }
}
