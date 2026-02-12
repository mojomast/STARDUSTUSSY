import { StateFingerprint } from '../../packages/client-state-manager/src/core/StateFingerprint';

describe('StateFingerprint', () => {
  let fingerprint: StateFingerprint;

  beforeEach(() => {
    fingerprint = new StateFingerprint();
  });

  describe('Hash Generation', () => {
    test('should generate consistent hashes for same data', () => {
      const data = { user: 'John', count: 42 };
      
      const hash1 = fingerprint.generate(data);
      const hash2 = fingerprint.generate(data);

      expect(hash1).toBe(hash2);
    });

    test('should generate different hashes for different data', () => {
      const data1 = { user: 'John', count: 42 };
      const data2 = { user: 'Jane', count: 42 };

      const hash1 = fingerprint.generate(data1);
      const hash2 = fingerprint.generate(data2);

      expect(hash1).not.toBe(hash2);
    });

    test('should generate hash of correct length', () => {
      const data = { test: true };
      const hash = fingerprint.generate(data);

      expect(hash).toHaveLength(64); // SHA-256 hex length
    });

    test('should handle nested objects', () => {
      const data = {
        user: {
          profile: {
            name: 'John',
            settings: { theme: 'dark' },
          },
        },
      };

      const hash = fingerprint.generate(data);
      expect(hash).toHaveLength(64);
      expect(typeof hash).toBe('string');
    });

    test('should handle arrays', () => {
      const data = {
        items: [1, 2, 3, { nested: true }],
        tags: ['a', 'b', 'c'],
      };

      const hash = fingerprint.generate(data);
      expect(hash).toHaveLength(64);
    });
  });

  describe('Hash Comparison', () => {
    test('should detect matching hashes', () => {
      const data = { value: 123 };
      const hash = fingerprint.generate(data);

      expect(fingerprint.matches(data, hash)).toBe(true);
    });

    test('should detect non-matching hashes', () => {
      const data1 = { value: 123 };
      const data2 = { value: 456 };
      const hash = fingerprint.generate(data1);

      expect(fingerprint.matches(data2, hash)).toBe(false);
    });
  });

  describe('Differential Hashing', () => {
    test('should generate partial hash for path', () => {
      const data = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };

      const partialHash = fingerprint.generateForPath(data, 'user');
      expect(partialHash).toHaveLength(64);
    });

    test('should detect changes at specific paths', () => {
      const data1 = {
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      };

      const data2 = {
        user: { name: 'John', age: 31 },
        settings: { theme: 'dark' },
      };

      const hash1 = fingerprint.generateForPath(data1, 'user');
      const hash2 = fingerprint.generateForPath(data2, 'user');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Incremental Updates', () => {
    test('should update hash incrementally', () => {
      const baseData = { a: 1, b: 2 };
      const baseHash = fingerprint.generate(baseData);

      const newHash = fingerprint.update(baseHash, { c: 3 });

      expect(newHash).toHaveLength(64);
      expect(newHash).not.toBe(baseHash);
    });
  });
});
