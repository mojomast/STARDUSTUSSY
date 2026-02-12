import { StateSerializer } from '../src/core/StateSerializer';
import { AppState, SyncStatus } from '../src/types';

describe('StateSerializer', () => {
  let serializer: StateSerializer;

  beforeEach(() => {
    serializer = new StateSerializer();
  });

  const createMockState = (): AppState => ({
    version: 1,
    timestamp: Date.now(),
    data: { test: 'value', nested: { key: 123 } },
    metadata: {
      lastModified: Date.now(),
      modifiedBy: 'test-device',
      syncStatus: SyncStatus.SYNCED
    }
  });

  describe('serialization', () => {
    it('should serialize state to string', () => {
      const state = createMockState();
      const serialized = serializer.serialize(state);
      expect(typeof serialized).toBe('string');
      expect(serialized).toContain('test');
    });

    it('should deserialize string to state', () => {
      const state = createMockState();
      const serialized = serializer.serialize(state);
      const deserialized = serializer.deserialize(serialized);
      
      expect(deserialized.version).toBe(state.version);
      expect(deserialized.data).toEqual(state.data);
    });

    it('should throw on invalid JSON', () => {
      expect(() => serializer.deserialize('invalid json')).toThrow();
    });
  });

  describe('cloning', () => {
    it('should create deep clone', () => {
      const state = createMockState();
      const clone = serializer.clone(state);
      
      expect(clone).toEqual(state);
      expect(clone).not.toBe(state);
      expect(clone.data).not.toBe(state.data);
    });

    it('should not affect original when modifying clone', () => {
      const state = createMockState();
      const clone = serializer.clone(state);
      
      (clone.data as { test: string }).test = 'modified';
      
      expect((state.data as { test: string }).test).toBe('value');
    });
  });

  describe('blob conversion', () => {
    it('should convert state to blob', () => {
      const state = createMockState();
      const blob = serializer.toBlob(state);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/json');
    });

    it('should convert blob back to state', async () => {
      const state = createMockState();
      const blob = serializer.toBlob(state);
      const restored = await serializer.fromBlob(blob);
      
      expect(restored).toEqual(state);
    });
  });

  describe('size calculation', () => {
    it('should calculate state size', () => {
      const state = createMockState();
      const size = serializer.getSize(state);
      
      expect(typeof size).toBe('number');
      expect(size).toBeGreaterThan(0);
    });

    it('should complete serialization in under 100ms', () => {
      const state = createMockState();
      
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        serializer.serialize(state);
      }
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(100);
    });
  });
});
