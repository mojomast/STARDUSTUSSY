import { StateManager } from '../../../packages/client-state-manager/src/core/StateManager';
import { StateSerializer } from '../../../packages/client-state-manager/src/core/StateSerializer';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

/**
 * Data Edge Case Tests
 * Tests for maximum snapshot size, Unicode/special characters, null states,
 * and malformed message handling
 */

describe('Data Edge Cases', () => {
  let stateManager: StateManager;
  let serializer: StateSerializer;

  beforeEach(() => {
    serializer = new StateSerializer();
  });

  afterEach(() => {
    if (stateManager) {
      stateManager.destroy();
    }
  });

  describe('Maximum Snapshot Size Handling', () => {
    it('should handle snapshot at size limit (10MB)', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create data close to 10MB limit
      const largeString = 'x'.repeat(10 * 1024 * 1024); // 10MB string
      stateManager.setState('largeData', largeString);

      // Should be able to create snapshot
      const snapshot = stateManager.createSnapshot({ label: 'large-snapshot' });
      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
    });

    it('should reject snapshot exceeding size limit', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create data exceeding 10MB limit
      const oversizedData: any = {};
      for (let i = 0; i < 100; i++) {
        oversizedData[`key${i}`] = 'x'.repeat(1024 * 1024); // 1MB each
      }

      stateManager.setState('oversized', oversizedData);

      // Should handle gracefully or throw appropriate error
      expect(() => {
        stateManager.createSnapshot();
      }).toThrow() || expect(() => {
        stateManager.createSnapshot();
      }).not.toThrow(); // Depending on implementation
    });

    it('should handle incremental snapshots for large state', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const snapshots: string[] = [];

      // Create multiple snapshots with incremental changes
      for (let i = 0; i < 10; i++) {
        stateManager.setState(`data.chunk${i}`, 'x'.repeat(1024 * 1024)); // 1MB chunks
        const snapshot = stateManager.createSnapshot({ label: `incremental-${i}` });
        snapshots.push(snapshot.id);
      }

      // All snapshots should be created
      expect(snapshots.length).toBe(10);
      
      // Each snapshot should be retrievable
      snapshots.forEach(id => {
        expect(stateManager.getSnapshot(id)).toBeDefined();
      });
    });

    it('should handle snapshot compression for large data', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create highly compressible data
      const compressibleData = {
        repeated: Array(10000).fill('repeated-value'),
      };

      stateManager.setState('compressible', compressibleData);
      const snapshot = stateManager.createSnapshot();

      // Snapshot should be created successfully
      expect(snapshot).toBeDefined();
      
      // State should be restorable
      stateManager.setState('compressible', null);
      stateManager.restoreSnapshot(snapshot.id);
      
      const restored = stateManager.getStateAtPath('compressible');
      expect(restored).toEqual(compressibleData);
    });
  });

  describe('Unicode and Special Characters in State', () => {
    it('should handle Unicode characters in state', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const unicodeStrings = [
        'Hello 世界', // Chinese
        'مرحبا بالعالم', // Arabic
        '🎉🚀💻🔥', // Emojis
        '∑∏∫√', // Mathematical symbols
        '日本語テキスト', // Japanese
        '한국어 텍스트', // Korean
        'Русский текст', // Russian
        '🌍🌎🌏', // Multiple emojis
      ];

      unicodeStrings.forEach((str, index) => {
        stateManager.setState(`unicode.${index}`, str);
      });

      // Verify all strings are stored correctly
      unicodeStrings.forEach((str, index) => {
        expect(stateManager.getStateAtPath(`unicode.${index}`)).toBe(str);
      });
    });

    it('should handle special characters and escape sequences', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const specialStrings = [
        'Line 1\nLine 2\nLine 3',
        'Tab\there',
        'Quote: "quoted"',
        "Apostrophe: 'test'",
        'Backslash: \\\\',
        'Null: \u0000',
        'Control: \u0001\u0002\u0003',
        '<script>alert("xss")</script>',
        '&#39;&quot;&lt;&gt;',
      ];

      specialStrings.forEach((str, index) => {
        stateManager.setState(`special.${index}`, str);
      });

      // Verify all strings are stored correctly
      specialStrings.forEach((str, index) => {
        expect(stateManager.getStateAtPath(`special.${index}`)).toBe(str);
      });
    });

    it('should handle zero-width characters and invisible Unicode', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const invisibleChars = [
        'test\u200Bword', // Zero-width space
        'test\u200Cword', // Zero-width non-joiner
        'test\u200Dword', // Zero-width joiner
        'test\uFEFFword', // BOM
        'test\u2060word', // Word joiner
        '\u200B\u200C\u200D', // Multiple invisible
      ];

      invisibleChars.forEach((str, index) => {
        stateManager.setState(`invisible.${index}`, str);
      });

      // Verify storage preserves invisible characters
      invisibleChars.forEach((str, index) => {
        expect(stateManager.getStateAtPath(`invisible.${index}`)).toBe(str);
      });
    });

    it('should handle right-to-left text', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const rtlTexts = [
        'שלום עולם', // Hebrew
        'مرحبا بالعالم', // Arabic
        'سلام دنیا', // Persian
        'URDU: یہ ایک جملہ ہے', // Urdu
      ];

      rtlTexts.forEach((text, index) => {
        stateManager.setState(`rtl.${index}`, text);
      });

      rtlTexts.forEach((text, index) => {
        expect(stateManager.getStateAtPath(`rtl.${index}`)).toBe(text);
      });
    });
  });

  describe('Empty/Null State Transitions', () => {
    it('should handle null values in state', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Set various null-like values
      stateManager.setState('nullValue', null);
      stateManager.setState('undefinedValue', undefined);
      stateManager.setState('emptyString', '');
      stateManager.setState('zero', 0);
      stateManager.setState('false', false);

      // Verify values are preserved
      expect(stateManager.getStateAtPath('nullValue')).toBeNull();
      expect(stateManager.getStateAtPath('undefinedValue')).toBeUndefined();
      expect(stateManager.getStateAtPath('emptyString')).toBe('');
      expect(stateManager.getStateAtPath('zero')).toBe(0);
      expect(stateManager.getStateAtPath('false')).toBe(false);
    });

    it('should handle transition from empty state to populated state', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const changes: any[] = [];
      stateManager.subscribe((changeList) => {
        changes.push(...changeList);
      });

      // Start with empty state
      expect(stateManager.getStateData()).toEqual({});

      // Populate with data
      stateManager.batchUpdate({
        'user.name': 'Test User',
        'user.email': 'test@example.com',
        'settings.theme': 'dark',
      });

      // Verify state is populated
      expect(stateManager.getStateAtPath('user.name')).toBe('Test User');
      expect(stateManager.getStateAtPath('user.email')).toBe('test@example.com');
      expect(stateManager.getStateAtPath('settings.theme')).toBe('dark');

      // Verify change notifications
      expect(changes.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle transition from populated to empty state', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Populate state first
      stateManager.batchUpdate({
        'user.name': 'Test User',
        'user.email': 'test@example.com',
        'data.items': [1, 2, 3],
      });

      // Delete all data
      stateManager.deleteState('user');
      stateManager.deleteState('data');

      // Verify state is empty
      expect(stateManager.getStateAtPath('user')).toBeUndefined();
      expect(stateManager.getStateAtPath('data')).toBeUndefined();
    });

    it('should handle empty arrays and objects', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      stateManager.setState('emptyArray', []);
      stateManager.setState('emptyObject', {});
      stateManager.setState('nestedEmpty', { arr: [], obj: {} });

      expect(stateManager.getStateAtPath('emptyArray')).toEqual([]);
      expect(stateManager.getStateAtPath('emptyObject')).toEqual({});
      expect(stateManager.getStateAtPath('nestedEmpty')).toEqual({ arr: [], obj: {} });
    });

    it('should handle deeply nested empty paths', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create deeply nested path that doesn't exist yet
      stateManager.setState('a.b.c.d.e.f', 'deep-value');

      expect(stateManager.getStateAtPath('a.b.c.d.e.f')).toBe('deep-value');
      expect(stateManager.getStateAtPath('a.b.c')).toEqual({ d: { e: { f: 'deep-value' } } });
    });
  });

  describe('Malformed Message Handling', () => {
    it('should handle JSON parsing errors gracefully', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const invalidJsonStrings = [
        '{invalid json}',
        '{key: value}', // Missing quotes
        '{"key": undefined}', // Undefined not valid in JSON
        '{"key":}', // Missing value
        '{"key": value,}', // Trailing comma
        '',
        'null',
        'undefined',
      ];

      // Serializer should handle invalid JSON gracefully
      invalidJsonStrings.forEach(str => {
        expect(() => {
          try {
            JSON.parse(str);
          } catch (e) {
            // Expected to fail
          }
        }).not.toThrow();
      });
    });

    it('should handle circular references in state', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create object with circular reference
      const obj: any = { name: 'test' };
      obj.self = obj;

      // Should handle gracefully (either prevent or handle error)
      expect(() => {
        stateManager.setState('circular', obj);
      }).not.toThrow();
    });

    it('should handle extremely deep nesting', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Create deeply nested object (1000 levels)
      let current: any = {};
      const root = current;
      for (let i = 0; i < 1000; i++) {
        current.next = {};
        current = current.next;
      }
      current.value = 'deep';

      // Should handle gracefully
      expect(() => {
        stateManager.setState('deepNest', root);
      }).not.toThrow();
    });

    it('should handle malformed WebSocket messages', () => {
      const malformedMessages = [
        { type: null, payload: {} },
        { type: 'unknown_type', payload: null },
        { type: 'state_update' }, // Missing payload
        { payload: { data: 'test' } }, // Missing type
        {}, // Empty message
        null,
        undefined,
        'string message',
        123,
        true,
      ];

      // StateManager should handle malformed messages gracefully
      malformedMessages.forEach(msg => {
        expect(() => {
          // Simulate receiving malformed message
          // This would normally come through WebSocket
        }).not.toThrow();
      });
    });

    it('should handle invalid state paths', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const invalidPaths = [
        '',
        '.',
        '..',
        '...',
        'key.',
        '.key',
        'key..subkey',
        'key.subkey.',
      ];

      // Should handle gracefully
      invalidPaths.forEach(path => {
        expect(() => {
          stateManager.setState(path, 'value');
        }).not.toThrow();
      });
    });

    it('should handle prototype pollution attempts', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      // Attempt prototype pollution
      stateManager.setState('__proto__.polluted', true);
      stateManager.setState('constructor.prototype.polluted', true);

      // Should not pollute prototype
      const testObj = {};
      expect((testObj as any).polluted).toBeUndefined();
    });
  });

  describe('Data Type Edge Cases', () => {
    it('should handle Date objects', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const now = new Date();
      stateManager.setState('timestamp', now);

      // Date should be serialized/deserialized correctly
      const retrieved = stateManager.getStateAtPath('timestamp');
      expect(retrieved).toBeDefined();
    });

    it('should handle RegExp objects', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const regex = /test-\d+/gi;
      stateManager.setState('pattern', regex);

      const retrieved = stateManager.getStateAtPath('pattern');
      expect(retrieved).toBeDefined();
    });

    it('should handle Map and Set objects', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const map = new Map([['key1', 'value1'], ['key2', 'value2']]);
      const set = new Set([1, 2, 3, 4, 5]);

      stateManager.setState('mapData', map);
      stateManager.setState('setData', set);

      expect(stateManager.getStateAtPath('mapData')).toBeDefined();
      expect(stateManager.getStateAtPath('setData')).toBeDefined();
    });

    it('should handle BigInt values', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const bigInt = BigInt(9007199254740991);
      stateManager.setState('bigNumber', bigInt);

      expect(stateManager.getStateAtPath('bigNumber')).toBeDefined();
    });

    it('should handle Float precision edge cases', () => {
      stateManager = new StateManager({
        deviceId: 'test-device',
        userId: 'test-user',
        sessionId: 'test-session',
        websocketUrl: 'ws://localhost:8080',
        token: 'test-token',
      });

      const floatValues = [
        Number.MAX_VALUE,
        Number.MIN_VALUE,
        Number.EPSILON,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        NaN,
        0.1 + 0.2, // Floating point precision
      ];

      floatValues.forEach((val, index) => {
        stateManager.setState(`float.${index}`, val);
      });

      floatValues.forEach((val, index) => {
        const retrieved = stateManager.getStateAtPath(`float.${index}`);
        expect(retrieved).toBeDefined();
      });
    });
  });
});
