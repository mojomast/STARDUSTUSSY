/**
 * Snapshot Replay Engine Tests
 */

import { SnapshotReplayEngine } from '../src/handoff/SnapshotReplayEngine';
import { StateSnapshot } from '../src/types/snapshot';
import { StateDelta } from '../src/types/delta';
import { generateUUID } from '../src/utils/uuid';

describe('SnapshotReplayEngine', () => {
  let engine: SnapshotReplayEngine;

  beforeEach(() => {
    engine = new SnapshotReplayEngine({ debug: false });
  });

  describe('Snapshot Deserialization', () => {
    test('should deserialize a valid snapshot', () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { user: { name: 'John', email: 'john@example.com' } },
        checksum: '', // Will be computed
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const state = engine.deserializeSnapshot(snapshot);

      expect(state).toBeDefined();
      expect(state.id).toBe('session-1');
      expect(state.deviceId).toBe('device-1');
      expect(state.version).toBe(1);
      expect(state.data.user?.name).toBe('John');
    });

    test('should verify checksum when present', () => {
      // Create snapshot with a checksum
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: 1234567890,
        version: 1,
        data: { test: 'data' },
        checksum: '3c0e8b7e1b9e9b8a9c9d9e9f', // Invalid checksum
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      // Should throw due to checksum mismatch
      expect(() => engine.deserializeSnapshot(snapshot)).toThrow('checksum mismatch');
    });
  });

  describe('Snapshot Replay', () => {
    test('should replay snapshot with deltas', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { user: { name: 'John' } },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const deltas: StateDelta[] = [
        {
          baseVersion: 1,
          targetVersion: 2,
          operations: [
            { op: 'replace', path: '/user/name', value: 'Jane' },
          ],
          timestamp: Date.now(),
        },
      ];

      const result = await engine.replaySnapshot(snapshot, deltas, {
        conflictResolution: 'server-wins',
      });

      expect(result.success).toBe(true);
      expect(result.replayedOperations).toBe(1);
      expect(result.state.data.user?.name).toBe('Jane');
      expect(result.version).toBe(2);
    });

    test('should handle multiple deltas in sequence', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { counter: 0 },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const deltas: StateDelta[] = [
        {
          baseVersion: 1,
          targetVersion: 2,
          operations: [{ op: 'replace', path: '/counter', value: 1 }],
          timestamp: Date.now(),
        },
        {
          baseVersion: 2,
          targetVersion: 3,
          operations: [{ op: 'replace', path: '/counter', value: 2 }],
          timestamp: Date.now(),
        },
        {
          baseVersion: 3,
          targetVersion: 4,
          operations: [{ op: 'replace', path: '/counter', value: 3 }],
          timestamp: Date.now(),
        },
      ];

      const result = await engine.replaySnapshot(snapshot, deltas);

      expect(result.success).toBe(true);
      expect(result.state.data.counter).toBe(3);
      expect(result.version).toBe(4);
      expect(result.replayedOperations).toBe(3);
    });

    test('should skip deltas with gaps when not merging', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: {},
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      // Delta with gap (version 1 to 3, skipping 2)
      const deltas: StateDelta[] = [
        {
          baseVersion: 3, // Gap from 1
          targetVersion: 4,
          operations: [{ op: 'add', path: '/data', value: 'value' }],
          timestamp: Date.now(),
        },
      ];

      const result = await engine.replaySnapshot(snapshot, deltas);

      expect(result.success).toBe(true);
      expect(result.skippedOperations).toBe(1);
      expect(result.state.data).toEqual({}); // Unchanged
    });

    test('should handle add operations', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: {},
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const deltas: StateDelta[] = [
        {
          baseVersion: 1,
          targetVersion: 2,
          operations: [
            { op: 'add', path: '/user', value: {} },
            { op: 'add', path: '/user/name', value: 'John' },
            { op: 'add', path: '/user/age', value: 30 },
          ],
          timestamp: Date.now(),
        },
      ];

      const result = await engine.replaySnapshot(snapshot, deltas);

      expect(result.success).toBe(true);
      expect(result.state.data.user?.name).toBe('John');
      expect(result.state.data.user?.age).toBe(30);
    });

    test('should handle remove operations', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { user: { name: 'John', age: 30, temp: 'value' } },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const deltas: StateDelta[] = [
        {
          baseVersion: 1,
          targetVersion: 2,
          operations: [{ op: 'remove', path: '/user/temp' }],
          timestamp: Date.now(),
        },
      ];

      const result = await engine.replaySnapshot(snapshot, deltas);

      expect(result.success).toBe(true);
      expect(result.state.data.user?.name).toBe('John');
      expect(result.state.data.user?.temp).toBeUndefined();
    });

    test('should handle move operations', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { oldPath: { value: 'moved' } },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const deltas: StateDelta[] = [
        {
          baseVersion: 1,
          targetVersion: 2,
          operations: [{ op: 'move', path: '/newPath', from: '/oldPath' }],
          timestamp: Date.now(),
        },
      ];

      const result = await engine.replaySnapshot(snapshot, deltas);

      expect(result.success).toBe(true);
      expect(result.state.data.newPath?.value).toBe('moved');
      expect(result.state.data.oldPath).toBeUndefined();
    });

    test('should handle copy operations', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { original: { value: 'copied' } },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const deltas: StateDelta[] = [
        {
          baseVersion: 1,
          targetVersion: 2,
          operations: [{ op: 'copy', path: '/duplicate', from: '/original' }],
          timestamp: Date.now(),
        },
      ];

      const result = await engine.replaySnapshot(snapshot, deltas);

      expect(result.success).toBe(true);
      expect(result.state.data.original?.value).toBe('copied');
      expect(result.state.data.duplicate?.value).toBe('copied');
    });
  });

  describe('Delta Queueing', () => {
    test('should queue delta for replay', () => {
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [],
        timestamp: Date.now(),
      };

      const result = engine.queueDelta('session-1', delta, 'device-1');

      expect(result).toBe(true);
      expect(engine.getQueuedDeltas('session-1')).toHaveLength(1);
    });

    test('should maintain queue order', () => {
      const deltas: StateDelta[] = [
        { baseVersion: 1, targetVersion: 2, operations: [], timestamp: 1000 },
        { baseVersion: 2, targetVersion: 3, operations: [], timestamp: 2000 },
        { baseVersion: 3, targetVersion: 4, operations: [], timestamp: 3000 },
      ];

      deltas.forEach(d => engine.queueDelta('session-1', d, 'device-1'));

      const queued = engine.getQueuedDeltas('session-1');
      expect(queued).toHaveLength(3);
      expect(queued[0].timestamp).toBe(1000);
      expect(queued[2].timestamp).toBe(3000);
    });

    test('should respect max queue size', () => {
      const smallEngine = new SnapshotReplayEngine({ maxQueueSize: 3 });

      for (let i = 0; i < 5; i++) {
        smallEngine.queueDelta('session-1', {
          baseVersion: i,
          targetVersion: i + 1,
          operations: [],
          timestamp: Date.now() + i,
        }, 'device-1');
      }

      expect(smallEngine.getQueuedDeltas('session-1')).toHaveLength(3);
    });

    test('should clear queue', () => {
      engine.queueDelta('session-1', {
        baseVersion: 1,
        targetVersion: 2,
        operations: [],
        timestamp: Date.now(),
      }, 'device-1');

      engine.clearQueue('session-1');

      expect(engine.getQueuedDeltas('session-1')).toHaveLength(0);
    });
  });

  describe('Resume from Snapshot', () => {
    test('should resume from snapshot without current state', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 5,
        data: { test: 'data' },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const result = await engine.resumeFromSnapshot(snapshot, null);

      expect(result.success).toBe(true);
      expect(result.state.data).toEqual({ test: 'data' });
      expect(result.version).toBe(5);
    });

    test('should merge with current state when requested', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 5,
        data: { fromSnapshot: true },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const currentState = {
        id: 'session-1',
        userId: 'user-1',
        deviceId: 'device-2',
        version: 10,
        data: { fromCurrent: true },
        lastModified: Date.now(),
      };

      const result = await engine.resumeFromSnapshot(snapshot, currentState, {
        conflictResolution: 'merge',
      });

      expect(result.success).toBe(true);
      expect(result.state.data.fromSnapshot).toBe(true);
      expect(result.state.data.fromCurrent).toBe(true);
    });
  });

  describe('State Diff Creation', () => {
    test('should create state diff', () => {
      const fromState = {
        id: 'session-1',
        userId: 'user-1',
        deviceId: 'device-1',
        version: 1,
        data: { name: 'John' },
        lastModified: Date.now(),
      };

      const toState = {
        id: 'session-1',
        userId: 'user-1',
        deviceId: 'device-1',
        version: 2,
        data: { name: 'Jane' },
        lastModified: Date.now(),
      };

      const delta = engine.createStateDiff(fromState, toState);

      expect(delta).toBeDefined();
      expect(delta.baseVersion).toBe(1);
      expect(delta.targetVersion).toBe(2);
      expect(delta.operations.length).toBeGreaterThan(0);
    });
  });

  describe('Queue Validation', () => {
    test('should validate queue with no gaps', () => {
      engine.setBaseSnapshot('session-1', {
        id: 'snap-1',
        timestamp: Date.now(),
        version: 1,
        data: {},
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      });

      engine.queueDelta('session-1', {
        baseVersion: 1,
        targetVersion: 2,
        operations: [],
        timestamp: Date.now(),
      }, 'device-1');

      engine.queueDelta('session-1', {
        baseVersion: 2,
        targetVersion: 3,
        operations: [],
        timestamp: Date.now(),
      }, 'device-1');

      const validation = engine.validateQueue('session-1');

      expect(validation.valid).toBe(true);
      expect(validation.gaps).toHaveLength(0);
    });

    test('should detect gaps in queue', () => {
      engine.setBaseSnapshot('session-1', {
        id: 'snap-1',
        timestamp: Date.now(),
        version: 1,
        data: {},
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      });

      // Skip version 2
      engine.queueDelta('session-1', {
        baseVersion: 3,
        targetVersion: 4,
        operations: [],
        timestamp: Date.now(),
      }, 'device-1');

      const validation = engine.validateQueue('session-1');

      expect(validation.valid).toBe(false);
      expect(validation.gaps).toContain(2);
    });
  });

  describe('Error Handling', () => {
    test('should handle empty delta list', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: { test: 'data' },
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const result = await engine.replaySnapshot(snapshot, []);

      expect(result.success).toBe(true);
      expect(result.replayedOperations).toBe(0);
      expect(result.state.data).toEqual({ test: 'data' });
    });

    test('should handle malformed operations gracefully', async () => {
      const snapshot: StateSnapshot = {
        id: generateUUID(),
        timestamp: Date.now(),
        version: 1,
        data: {},
        checksum: '',
        deviceId: 'device-1',
        sessionId: 'session-1',
      };

      const deltas: StateDelta[] = [
        {
          baseVersion: 1,
          targetVersion: 2,
          operations: [
            { op: 'invalid' as any, path: '/test' },
          ],
          timestamp: Date.now(),
        },
      ];

      // Should not throw
      const result = await engine.replaySnapshot(snapshot, deltas);
      expect(result.success).toBe(true);
    });
  });
});
