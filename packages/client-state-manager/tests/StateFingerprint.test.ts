import { StateFingerprint } from '../src/core/StateFingerprint';
import { AppState, SyncStatus } from '../src/types';

describe('StateFingerprint', () => {
  let fingerprint: StateFingerprint;

  beforeEach(() => {
    fingerprint = new StateFingerprint();
  });

  const createMockState = (data: Record<string, unknown> = {}): AppState => ({
    version: 1,
    timestamp: Date.now(),
    data,
    metadata: {
      lastModified: Date.now(),
      modifiedBy: 'test-device',
      syncStatus: SyncStatus.SYNCED
    }
  });

  describe('fingerprint generation', () => {
    it('should generate fingerprint string', () => {
      const state = createMockState({ test: 'value' });
      const fp = fingerprint.generate(state);
      
      expect(typeof fp).toBe('string');
      expect(fp.length).toBe(8);
    });

    it('should generate same fingerprint for identical data', () => {
      const state1 = createMockState({ a: 1, b: 2 });
      const state2 = createMockState({ a: 1, b: 2 });
      
      expect(fingerprint.generate(state1)).toBe(fingerprint.generate(state2));
    });

    it('should generate different fingerprint for different data', () => {
      const state1 = createMockState({ a: 1 });
      const state2 = createMockState({ a: 2 });
      
      expect(fingerprint.generate(state1)).not.toBe(fingerprint.generate(state2));
    });
  });

  describe('comparison', () => {
    it('should return true for identical states', () => {
      const state1 = createMockState({ x: 'y' });
      const state2 = createMockState({ x: 'y' });
      
      expect(fingerprint.compare(state1, state2)).toBe(true);
    });

    it('should return false for different states', () => {
      const state1 = createMockState({ x: 'y' });
      const state2 = createMockState({ x: 'z' });
      
      expect(fingerprint.compare(state1, state2)).toBe(false);
    });
  });

  describe('canonical fingerprints', () => {
    it('should generate same fingerprint regardless of key order', () => {
      const state1 = createMockState({ a: 1, b: 2, c: 3 });
      const state2 = createMockState({ c: 3, a: 1, b: 2 });
      
      expect(fingerprint.generateFull(state1)).toBe(fingerprint.generateFull(state2));
    });

    it('should handle nested objects', () => {
      const state1 = createMockState({ nested: { x: 1, y: 2 } });
      const state2 = createMockState({ nested: { y: 2, x: 1 } });
      
      expect(fingerprint.generateFull(state1)).toBe(fingerprint.generateFull(state2));
    });

    it('should handle arrays', () => {
      const state1 = createMockState({ items: [1, 2, 3] });
      const state2 = createMockState({ items: [1, 2, 3] });
      
      expect(fingerprint.compare(state1, state2)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty state', () => {
      const state = createMockState({});
      const fp = fingerprint.generate(state);
      
      expect(typeof fp).toBe('string');
      expect(fp).toBeDefined();
    });

    it('should handle null values', () => {
      const state = createMockState({ value: null });
      const fp = fingerprint.generate(state);
      
      expect(typeof fp).toBe('string');
    });

    it('should handle deeply nested objects', () => {
      const state = createMockState({
        level1: {
          level2: {
            level3: {
              value: 'deep'
            }
          }
        }
      });
      
      const fp = fingerprint.generate(state);
      expect(typeof fp).toBe('string');
    });
  });
});
