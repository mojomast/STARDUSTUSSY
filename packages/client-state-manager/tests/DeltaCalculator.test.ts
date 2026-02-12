import { DeltaCalculator } from '../src/core/DeltaCalculator';
import { StateDelta, DeltaOperation } from '../src/types';

describe('DeltaCalculator', () => {
  let calculator: DeltaCalculator;

  beforeEach(() => {
    calculator = new DeltaCalculator();
  });

  describe('calculateDelta', () => {
    it('should return no changes for identical objects', () => {
      const oldState = { name: 'John', age: 30 };
      const newState = { name: 'John', age: 30 };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(false);
      expect(result.delta.operations).toHaveLength(0);
    });

    it('should detect added properties', () => {
      const oldState = { name: 'John' };
      const newState = { name: 'John', age: 30 };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'add',
        path: '/age',
        value: 30,
      });
    });

    it('should detect removed properties', () => {
      const oldState = { name: 'John', age: 30 };
      const newState = { name: 'John' };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'remove',
        path: '/age',
      });
    });

    it('should detect modified properties', () => {
      const oldState = { name: 'John', age: 30 };
      const newState = { name: 'Jane', age: 30 };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'replace',
        path: '/name',
        value: 'Jane',
      });
    });

    it('should detect nested changes', () => {
      const oldState = { user: { name: 'John', profile: { age: 30 } } };
      const newState = { user: { name: 'John', profile: { age: 31 } } };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'replace',
        path: '/user/profile/age',
        value: 31,
      });
    });

    it('should handle array changes', () => {
      const oldState = { items: [1, 2, 3] };
      const newState = { items: [1, 2, 4] };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'replace',
        path: '/items/2',
        value: 4,
      });
    });

    it('should handle array length changes', () => {
      const oldState = { items: [1, 2] };
      const newState = { items: [1, 2, 3] };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'replace',
        path: '/items',
        value: [1, 2, 3],
      });
    });

    it('should handle null values', () => {
      const oldState = { value: 'test' };
      const newState = { value: null };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'replace',
        path: '/value',
        value: null,
      });
    });

    it('should handle removed keys vs null values', () => {
      // Key completely removed (undefined) vs key set to null
      const oldState = { value: 'test' };
      const newState = {};

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'remove',
        path: '/value',
      });
    });

    it('should handle type changes', () => {
      const oldState = { value: '123' };
      const newState = { value: 123 };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations).toContainEqual({
        op: 'replace',
        path: '/value',
        value: 123,
      });
    });

    it('should set correct version info', () => {
      const oldState = { a: 1 };
      const newState = { a: 2 };

      const result = calculator.calculateDelta(oldState, newState, 5, 10);

      expect(result.delta.baseVersion).toBe(5);
      expect(result.delta.targetVersion).toBe(10);
      expect(result.delta.timestamp).toBeGreaterThan(0);
    });
  });

  describe('applyDelta', () => {
    it('should apply add operation', () => {
      const state: Record<string, unknown> = {};
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'add', path: '/name', value: 'John' }],
        timestamp: Date.now(),
      };

      const changes = calculator.applyDelta(state, delta);

      expect(state.name).toBe('John');
      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('name');
    });

    it('should apply remove operation', () => {
      const state: Record<string, unknown> = { name: 'John', age: 30 };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'remove', path: '/age' }],
        timestamp: Date.now(),
      };

      const changes = calculator.applyDelta(state, delta);

      expect(state.age).toBeUndefined();
      expect(changes).toHaveLength(1);
      expect(changes[0].previousValue).toBe(30);
    });

    it('should apply replace operation', () => {
      const state: Record<string, unknown> = { name: 'John' };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'replace', path: '/name', value: 'Jane' }],
        timestamp: Date.now(),
      };

      const changes = calculator.applyDelta(state, delta);

      expect(state.name).toBe('Jane');
      expect(changes).toHaveLength(1);
      expect(changes[0].previousValue).toBe('John');
    });

    it('should apply nested operations', () => {
      const state: Record<string, unknown> = { user: { profile: {} } };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'add', path: '/user/profile/age', value: 30 }],
        timestamp: Date.now(),
      };

      calculator.applyDelta(state, delta);

      expect((state.user as Record<string, unknown>).profile).toEqual({ age: 30 });
    });

    it('should apply multiple operations', () => {
      const state: Record<string, unknown> = { name: 'John' };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [
          { op: 'replace', path: '/name', value: 'Jane' },
          { op: 'add', path: '/age', value: 30 },
        ],
        timestamp: Date.now(),
      };

      const changes = calculator.applyDelta(state, delta);

      expect(state.name).toBe('Jane');
      expect(state.age).toBe(30);
      expect(changes).toHaveLength(2);
    });

    it('should handle move operation', () => {
      const state: Record<string, unknown> = { oldKey: 'value' };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'move', path: '/newKey', from: '/oldKey' }],
        timestamp: Date.now(),
      };

      calculator.applyDelta(state, delta);

      expect(state.oldKey).toBeUndefined();
      expect(state.newKey).toBe('value');
    });

    it('should handle copy operation', () => {
      const state: Record<string, unknown> = { source: 'value' };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'copy', path: '/target', from: '/source' }],
        timestamp: Date.now(),
      };

      calculator.applyDelta(state, delta);

      expect(state.source).toBe('value');
      expect(state.target).toBe('value');
    });

    it('should throw on test operation failure', () => {
      const state: Record<string, unknown> = { value: 'actual' };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'test', path: '/value', value: 'expected' }],
        timestamp: Date.now(),
      };

      // The test operation should fail since 'actual' !== 'expected'
      expect(() => calculator.applyDelta(state, delta)).toThrow();
    });

    it('should handle root path operations', () => {
      const state: Record<string, unknown> = { a: 1 };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'replace', path: '', value: { b: 2 } }],
        timestamp: Date.now(),
      };

      calculator.applyDelta(state, delta);

      // Root replace should update the entire object
      expect(state).toEqual({ b: 2 });
    });

    it('should handle escaped path characters', () => {
      const state: Record<string, unknown> = {};
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'add', path: '/path~1with~0slashes', value: 'test' }],
        timestamp: Date.now(),
      };

      calculator.applyDelta(state, delta);

      expect((state as Record<string, unknown>)['path/with~slashes']).toBe('test');
    });

    it('should return empty changes for no-op operations', () => {
      const state: Record<string, unknown> = { value: 'test' };
      const delta: StateDelta = {
        baseVersion: 1,
        targetVersion: 2,
        operations: [{ op: 'add', path: '/value', value: 'test' }],
        timestamp: Date.now(),
      };

      const changes = calculator.applyDelta(state, delta);

      expect(changes).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const oldState = {};
      const newState = {};

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(false);
    });

    it('should handle deeply nested changes', () => {
      const oldState = { a: { b: { c: { d: { e: 1 } } } } };
      const newState = { a: { b: { c: { d: { e: 2 } } } } };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
      expect(result.delta.operations[0].path).toBe('/a/b/c/d/e');
    });

    it('should handle special values', () => {
      const oldState = { value: undefined };
      const newState = { value: 0 };

      const result = calculator.calculateDelta(oldState, newState, 1, 2);

      expect(result.hasChanges).toBe(true);
    });
  });
});
