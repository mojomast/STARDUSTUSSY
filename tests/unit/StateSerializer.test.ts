import { StateSerializer } from '../../packages/client-state-manager/src/core/StateSerializer';
import { CompressionType } from '../../packages/client-state-manager/src/types/snapshot';

describe('StateSerializer', () => {
  let serializer: StateSerializer;

  beforeEach(() => {
    serializer = new StateSerializer();
  });

  describe('JSON Serialization', () => {
    test('should serialize state to JSON', () => {
      const state = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };

      const serialized = serializer.serialize(state);

      expect(typeof serialized).toBe('string');
      expect(JSON.parse(serialized)).toEqual(state);
    });

    test('should deserialize JSON to state', () => {
      const json = '{"user":{"name":"Jane","age":25},"count":5}';

      const state = serializer.deserialize(json);

      expect(state).toEqual({
        user: { name: 'Jane', age: 25 },
        count: 5,
      });
    });

    test('should handle circular references gracefully', () => {
      const obj: Record<string, unknown> = { name: 'test' };
      obj.self = obj; // Circular reference

      expect(() => serializer.serialize(obj)).toThrow();
    });
  });

  describe('Compression', () => {
    test('should compress state data', () => {
      const state = {
        largeArray: Array(1000).fill({ data: 'test value that is somewhat long' }),
      };

      const uncompressed = serializer.serialize(state, CompressionType.NONE);
      const compressed = serializer.serialize(state, CompressionType.GZIP);

      expect(compressed.length).toBeLessThan(uncompressed.length);
    });

    test('should decompress state data', () => {
      const originalState = {
        user: { name: 'John', preferences: { theme: 'dark', fontSize: 14 } },
        data: Array(100).fill({ id: 1, value: 'test' }),
      };

      const compressed = serializer.serialize(originalState, CompressionType.GZIP);
      const decompressed = serializer.deserialize(compressed, CompressionType.GZIP);

      expect(decompressed).toEqual(originalState);
    });

    test('should handle empty state', () => {
      const compressed = serializer.serialize({}, CompressionType.GZIP);
      const decompressed = serializer.deserialize(compressed, CompressionType.GZIP);

      expect(decompressed).toEqual({});
    });
  });

  describe('Schema Validation', () => {
    test('should validate state against schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const validState = { name: 'John', age: 30 };
      const invalidState = { age: 30 };

      expect(serializer.validate(validState, schema).valid).toBe(true);
      expect(serializer.validate(invalidState, schema).valid).toBe(false);
    });

    test('should provide validation errors', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      };

      const invalidState = { email: 'not-an-email' };
      const result = serializer.validate(invalidState, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Versioning', () => {
    test('should include version in serialized data', () => {
      const state = { value: 123 };
      const version = '1.0.0';

      const serialized = serializer.serializeWithVersion(state, version);
      const parsed = JSON.parse(serialized);

      expect(parsed._version).toBe(version);
      expect(parsed._data).toEqual(state);
    });

    test('should extract version from serialized data', () => {
      const serialized = JSON.stringify({
        _version: '2.0.0',
        _data: { updated: true },
      });

      const result = serializer.deserializeWithVersion(serialized);

      expect(result.version).toBe('2.0.0');
      expect(result.data).toEqual({ updated: true });
    });
  });

  describe('Delta Encoding', () => {
    test('should encode delta between states', () => {
      const baseState = { a: 1, b: 2, c: 3 };
      const newState = { a: 1, b: 20, d: 4 };

      const delta = serializer.encodeDelta(baseState, newState);

      expect(delta).toContainEqual({ op: 'replace', path: '/b', value: 20 });
      expect(delta).toContainEqual({ op: 'remove', path: '/c' });
      expect(delta).toContainEqual({ op: 'add', path: '/d', value: 4 });
    });

    test('should apply delta to base state', () => {
      const baseState = { a: 1, b: 2, c: 3 };
      const delta = [
        { op: 'replace', path: '/b', value: 20 },
        { op: 'remove', path: '/c' },
        { op: 'add', path: '/d', value: 4 },
      ];

      const result = serializer.applyDelta(baseState, delta);

      expect(result).toEqual({ a: 1, b: 20, d: 4 });
    });
  });
});
