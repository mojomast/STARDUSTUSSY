/**
 * Snapshot Replay Engine
 * Deserializes snapshots, reconstructs state, and replays missed updates
 */

import {
  SnapshotReplayOptions,
  ReplayResult,
  ReplayConflict,
  DeltaReplayQueue,
  QueuedDelta,
} from '../types/handoff';
import { StateSnapshot } from '../types/snapshot';
import { SessionState } from '../types/session';
import { StateDelta, DeltaOperation } from '../types/delta';
import { StateSerializer } from '../core/StateSerializer';
import { StateFingerprint } from '../core/StateFingerprint';
import { DeltaCalculator } from '../core/DeltaCalculator';


export interface SnapshotReplayEngineConfig {
  maxQueueSize?: number;
  maxReplayOperations?: number;
  debug?: boolean;
}

export class SnapshotReplayEngine {
  private config: Required<SnapshotReplayEngineConfig>;
  private serializer: StateSerializer;
  private fingerprint: StateFingerprint;
  private deltaCalculator: DeltaCalculator;
  private replayQueue: Map<string, DeltaReplayQueue> = new Map();

  constructor(config: SnapshotReplayEngineConfig = {}) {
    this.config = {
      maxQueueSize: 1000,
      maxReplayOperations: 10000,
      debug: false,
      ...config,
    };

    this.serializer = new StateSerializer();
    this.fingerprint = new StateFingerprint();
    this.deltaCalculator = new DeltaCalculator();
  }

  /**
   * Deserialize a snapshot and return the state
   */
  deserializeSnapshot(snapshot: StateSnapshot): SessionState {
    const startTime = performance.now();

    // Verify checksum if present
    if (snapshot.checksum) {
      const computedChecksum = this.fingerprint.generate({
        version: snapshot.version,
        timestamp: snapshot.timestamp,
        data: snapshot.data as Record<string, unknown>,
      } as import('../types/state').AppState);

      if (computedChecksum !== snapshot.checksum) {
        throw new Error('Snapshot checksum mismatch - data may be corrupted');
      }
    }

    const state: SessionState = {
      id: snapshot.sessionId,
      userId: '', // Will be populated from context
      deviceId: snapshot.deviceId,
      version: snapshot.version,
      data: this.serializer.clone(snapshot.data as Record<string, unknown>),
      lastModified: snapshot.timestamp,
      checksum: snapshot.checksum,
    };

    this.log('Snapshot deserialized in', performance.now() - startTime, 'ms');
    return state;
  }

  /**
   * Reconstruct state from snapshot and replay missed deltas
   */
  async replaySnapshot(
    snapshot: StateSnapshot,
    deltas: StateDelta[],
    options: SnapshotReplayOptions = {}
  ): Promise<ReplayResult> {
    const startTime = performance.now();
    const conflicts: ReplayConflict[] = [];

    try {
      // Step 1: Deserialize the base snapshot
      let state = this.deserializeSnapshot(snapshot);
      let currentVersion = state.version;

      this.log('Starting replay from version', currentVersion);

      // Step 2: Sort deltas by version
      const sortedDeltas = deltas
        .filter(d => d.baseVersion >= currentVersion || d.targetVersion > currentVersion)
        .sort((a, b) => a.baseVersion - b.baseVersion);

      // Step 3: Filter deltas based on target version
      const targetVersion = options.targetVersion || Infinity;
      const deltasToReplay = sortedDeltas.filter(
        d => d.targetVersion <= targetVersion
      );

      this.log('Replaying', deltasToReplay.length, 'deltas');

      // Step 4: Replay each delta
      let replayedOperations = 0;
      let skippedOperations = 0;

      for (const delta of deltasToReplay) {
        // Check if this delta is the next in sequence
        if (delta.baseVersion !== currentVersion) {
          this.log('Gap detected: expected', currentVersion, 'got', delta.baseVersion);
          
          // Try to fill gaps with merge strategy
          if (options.conflictResolution === 'merge') {
            const gapFilled = await this.fillGap(state, currentVersion, delta.baseVersion);
            if (gapFilled) {
              currentVersion = delta.baseVersion;
            } else {
              skippedOperations++;
              continue;
            }
          } else {
            skippedOperations++;
            continue;
          }
        }

        // Apply the delta
        const result = await this.applyDeltaWithConflictResolution(
          state,
          delta,
          options.conflictResolution || 'server-wins'
        );

        if (result.conflicts.length > 0) {
          conflicts.push(...result.conflicts);
        }

        state = result.state;
        currentVersion = delta.targetVersion;
        replayedOperations += delta.operations.length;

        // Check operation limit
        if (replayedOperations >= this.config.maxReplayOperations) {
          this.log('Max replay operations reached');
          break;
        }
      }

      // Step 5: Apply pending changes if requested
      if (options.includePendingChanges && options.resumeFromTimestamp) {
        state = this.applyPendingChanges(state, options.resumeFromTimestamp);
      }

      // Step 6: Validate final state
      state.checksum = this.fingerprint.generate(state as unknown as import('../types/state').AppState);
      state.lastModified = Date.now();

      const duration = performance.now() - startTime;
      
      this.log('Replay completed in', duration, 'ms');

      return {
        success: true,
        state,
        version: currentVersion,
        replayedOperations,
        skippedOperations,
        conflicts,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      
      return {
        success: false,
        state: this.createEmptyState(snapshot.sessionId),
        version: snapshot.version,
        replayedOperations: 0,
        skippedOperations: deltas.length,
        conflicts,
        duration,
      };
    }
  }

  /**
   * Queue a delta for replay
   */
  queueDelta(sessionId: string, delta: StateDelta, deviceId: string): boolean {
    let queue = this.replayQueue.get(sessionId);
    
    if (!queue) {
      queue = {
        baseVersion: delta.baseVersion,
        targetVersion: delta.targetVersion,
        deltas: [],
        snapshot: null,
      };
      this.replayQueue.set(sessionId, queue);
    }

    if (queue.deltas.length >= this.config.maxQueueSize) {
      this.log('Queue full, removing oldest delta');
      queue.deltas.shift();
    }

    const queuedDelta: QueuedDelta = {
      version: delta.targetVersion,
      delta,
      timestamp: delta.timestamp,
      deviceId,
    };

    queue.deltas.push(queuedDelta);
    queue.targetVersion = Math.max(queue.targetVersion, delta.targetVersion);

    this.log('Delta queued for session', sessionId, 'version', delta.targetVersion);
    return true;
  }

  /**
   * Get queued deltas for a session
   */
  getQueuedDeltas(sessionId: string): QueuedDelta[] {
    return this.replayQueue.get(sessionId)?.deltas || [];
  }

  /**
   * Set base snapshot for replay queue
   */
  setBaseSnapshot(sessionId: string, snapshot: StateSnapshot): void {
    let queue = this.replayQueue.get(sessionId);
    
    if (!queue) {
      queue = {
        baseVersion: snapshot.version,
        targetVersion: snapshot.version,
        deltas: [],
        snapshot,
      };
      this.replayQueue.set(sessionId, queue);
    } else {
      queue.snapshot = snapshot;
      queue.baseVersion = snapshot.version;
    }
  }

  /**
   * Clear replay queue for a session
   */
  clearQueue(sessionId: string): void {
    this.replayQueue.delete(sessionId);
  }

  /**
   * Resume session from specific point
   */
  async resumeFromSnapshot(
    snapshot: StateSnapshot,
    currentState: SessionState | null,
    options: SnapshotReplayOptions = {}
  ): Promise<ReplayResult> {
    const startTime = performance.now();

    // If we have current state, merge with snapshot
    if (currentState && options.conflictResolution !== 'server-wins') {
      const merged = await this.mergeStates(
        currentState,
        this.deserializeSnapshot(snapshot),
        options.conflictResolution || 'merge'
      );

      return {
        success: true,
        state: merged,
        version: Math.max(currentState.version, snapshot.version),
        replayedOperations: 0,
        skippedOperations: 0,
        conflicts: [],
        duration: performance.now() - startTime,
      };
    }

    // Otherwise, just deserialize the snapshot
    const state = this.deserializeSnapshot(snapshot);
    
    return {
      success: true,
      state,
      version: snapshot.version,
      replayedOperations: 0,
      skippedOperations: 0,
      conflicts: [],
      duration: performance.now() - startTime,
    };
  }

  /**
   * Create a state diff between two versions
   */
  createStateDiff(fromState: SessionState, toState: SessionState): StateDelta {
    const result = this.deltaCalculator.calculateDelta(
      fromState.data,
      toState.data,
      fromState.version,
      toState.version
    );

    return result.delta;
  }

  /**
   * Validate a replay queue for consistency
   */
  validateQueue(sessionId: string): { valid: boolean; gaps: number[] } {
    const queue = this.replayQueue.get(sessionId);
    
    if (!queue || queue.deltas.length === 0) {
      return { valid: true, gaps: [] };
    }

    const sortedDeltas = [...queue.deltas].sort((a, b) => a.version - b.version);
    const gaps: number[] = [];
    let expectedVersion = queue.baseVersion;

    for (const delta of sortedDeltas) {
      const deltaVersion = (delta.delta as StateDelta).baseVersion;
      
      if (deltaVersion > expectedVersion) {
        for (let v = expectedVersion; v < deltaVersion; v++) {
          gaps.push(v);
        }
      }
      
      expectedVersion = (delta.delta as StateDelta).targetVersion;
    }

    return {
      valid: gaps.length === 0,
      gaps,
    };
  }

  private async applyDeltaWithConflictResolution(
    state: SessionState,
    delta: StateDelta,
    resolution: string
  ): Promise<{ state: SessionState; conflicts: ReplayConflict[] }> {
    const conflicts: ReplayConflict[] = [];
    const newState = this.serializer.clone(state);

    for (const operation of delta.operations) {
      try {
        const conflict = this.checkForConflict(newState, operation);
        
        if (conflict) {
          const resolved = this.resolveConflict(conflict, resolution);
          conflicts.push(resolved);
          
          if (resolution === 'client-wins') {
            continue; // Skip applying this operation
          }
        }

        this.applyOperation(newState.data, operation);
      } catch (error) {
        this.log('Error applying operation:', error);
      }
    }

    newState.version = delta.targetVersion;
    newState.lastModified = Date.now();

    return { state: newState, conflicts };
  }

  private checkForConflict(
    state: SessionState,
    operation: DeltaOperation
  ): ReplayConflict | null {
    const currentValue = this.getValueAtPath(state.data, operation.path);
    
    if (operation.op === 'replace' && currentValue !== undefined) {
      return {
        path: operation.path,
        serverValue: operation.value,
        clientValue: currentValue,
        resolvedValue: operation.value,
        resolution: 'server-wins',
      };
    }

    return null;
  }

  private resolveConflict(
    conflict: ReplayConflict,
    strategy: string
  ): ReplayConflict {
    switch (strategy) {
      case 'client-wins':
        return {
          ...conflict,
          resolvedValue: conflict.clientValue,
          resolution: 'client-wins',
        };
      case 'merge':
        return {
          ...conflict,
          resolvedValue: this.mergeValues(conflict.serverValue, conflict.clientValue),
          resolution: 'merged',
        };
      default: // server-wins
        return conflict;
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

  private async fillGap(
    _state: SessionState,
    fromVersion: number,
    toVersion: number
  ): Promise<boolean> {
    this.log('Attempting to fill gap from', fromVersion, 'to', toVersion);
    // In a real implementation, this would fetch missing deltas from the server
    return false;
  }

  private applyPendingChanges(state: SessionState, _resumeFromTimestamp: number): SessionState {
    // Apply any local changes made after the resume timestamp
    return state;
  }

  private async mergeStates(
    state1: SessionState,
    state2: SessionState,
    strategy: string
  ): Promise<SessionState> {
    const merged: SessionState = {
      ...state1,
      version: Math.max(state1.version, state2.version),
      data: {},
      lastModified: Date.now(),
    };

    if (strategy === 'server-wins') {
      merged.data = this.serializer.clone(state2.data);
    } else if (strategy === 'client-wins') {
      merged.data = this.serializer.clone(state1.data);
    } else {
      merged.data = this.deepMerge(state1.data, state2.data);
    }

    return merged;
  }

  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = this.deepMerge(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private mergeValues(a: unknown, b: unknown): unknown {
    if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
      return this.deepMerge(a as Record<string, unknown>, b as Record<string, unknown>);
    }
    return b; // Default to newer value
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

  private createEmptyState(sessionId: string): SessionState {
    return {
      id: sessionId,
      userId: '',
      deviceId: '',
      version: 0,
      data: {},
      lastModified: Date.now(),
    };
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[SnapshotReplayEngine]', ...args);
    }
  }
}
