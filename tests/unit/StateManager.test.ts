import { StateManager } from '../../packages/client-state-manager/src/core/StateManager';
import { StateFingerprint } from '../../packages/client-state-manager/src/core/StateFingerprint';
import { StateSerializer } from '../../packages/client-state-manager/src/core/StateSerializer';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager({
      debounceMs: 50,
      enableCompression: true,
    });
  });

  afterEach(() => {
    stateManager.destroy();
  });

  describe('State Operations', () => {
    test('should set and get state values', () => {
      stateManager.set('user.name', 'John Doe');
      stateManager.set('user.age', 30);

      expect(stateManager.get('user.name')).toBe('John Doe');
      expect(stateManager.get('user.age')).toBe(30);
    });

    test('should handle nested state paths', () => {
      stateManager.set('settings.theme.color', 'dark');
      stateManager.set('settings.theme.fontSize', 14);

      expect(stateManager.get('settings.theme.color')).toBe('dark');
      expect(stateManager.get('settings.theme.fontSize')).toBe(14);
    });

    test('should delete state values', () => {
      stateManager.set('temp.value', 123);
      expect(stateManager.get('temp.value')).toBe(123);

      stateManager.delete('temp.value');
      expect(stateManager.get('temp.value')).toBeUndefined();
    });

    test('should get full state snapshot', () => {
      stateManager.set('a', 1);
      stateManager.set('b', 2);

      const snapshot = stateManager.getSnapshot();
      expect(snapshot).toEqual({ a: 1, b: 2 });
    });

    test('should clear all state', () => {
      stateManager.set('a', 1);
      stateManager.set('b', 2);

      stateManager.clear();

      expect(stateManager.get('a')).toBeUndefined();
      expect(stateManager.get('b')).toBeUndefined();
      expect(stateManager.getSnapshot()).toEqual({});
    });
  });

  describe('State Change Callbacks', () => {
    test('should notify listeners on state changes', (done) => {
      const callback = jest.fn();
      stateManager.subscribe(callback);

      stateManager.set('value', 42);

      setTimeout(() => {
        expect(callback).toHaveBeenCalled();
        const change = callback.mock.calls[0][0];
        expect(change.path).toBe('value');
        expect(change.value).toBe(42);
        done();
      }, 100);
    });

    test('should debounce rapid state changes', (done) => {
      const callback = jest.fn();
      stateManager.subscribe(callback);

      // Rapid changes
      stateManager.set('counter', 1);
      stateManager.set('counter', 2);
      stateManager.set('counter', 3);
      stateManager.set('counter', 4);
      stateManager.set('counter', 5);

      setTimeout(() => {
        // Should only be called once due to debouncing
        expect(callback.mock.calls.length).toBeLessThanOrEqual(2);
        expect(stateManager.get('counter')).toBe(5);
        done();
      }, 200);
    });

    test('should unsubscribe listeners', (done) => {
      const callback = jest.fn();
      const unsubscribe = stateManager.subscribe(callback);

      stateManager.set('value', 1);

      setTimeout(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        
        unsubscribe();
        stateManager.set('value', 2);

        setTimeout(() => {
          // Should not be called again after unsubscribe
          expect(callback).toHaveBeenCalledTimes(1);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('Patch Operations', () => {
    test('should apply state patches', () => {
      stateManager.setSnapshot({
        user: { name: 'John', age: 30 },
        settings: { theme: 'light' },
      });

      stateManager.applyPatch({
        op: 'replace',
        path: '/user/age',
        value: 31,
      });

      expect(stateManager.get('user.age')).toBe(31);
    });

    test('should generate diff patches', () => {
      const oldState = { a: 1, b: 2, c: 3 };
      const newState = { a: 1, b: 20, d: 4 };

      const patches = stateManager.diff(oldState, newState);

      expect(patches).toContainEqual({ op: 'replace', path: '/b', value: 20 });
      expect(patches).toContainEqual({ op: 'remove', path: '/c' });
      expect(patches).toContainEqual({ op: 'add', path: '/d', value: 4 });
    });
  });

  describe('Serialization', () => {
    test('should serialize state to JSON', () => {
      stateManager.set('data', { nested: true, value: 123 });

      const serialized = stateManager.serialize();
      const parsed = JSON.parse(serialized);

      expect(parsed.data).toEqual({ nested: true, value: 123 });
    });

    test('should deserialize state from JSON', () => {
      const json = '{"user":{"name":"Jane"},"count":5}';
      
      stateManager.deserialize(json);

      expect(stateManager.get('user.name')).toBe('Jane');
      expect(stateManager.get('count')).toBe(5);
    });
  });
});
