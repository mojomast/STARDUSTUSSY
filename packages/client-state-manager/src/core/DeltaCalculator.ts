import { StateDelta, DeltaOperation, DeltaResult, StateChange, DeltaCompressionOptions } from '../types';

interface DeltaCacheEntry {
  operations: DeltaOperation[];
  timestamp: number;
  size: number;
}

export class DeltaCalculator {
  private deltaCache = new Map<string, DeltaCacheEntry>();
  private readonly MAX_CACHE_SIZE = 50;
  private readonly CACHE_TTL = 60000;
  private operationBuffer: DeltaOperation[] = [];
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BUFFER_TIMEOUT = 50;

  calculateDelta(
    oldState: Record<string, unknown>,
    newState: Record<string, unknown>,
    baseVersion: number,
    targetVersion: number,
    options: DeltaCompressionOptions = {}
  ): DeltaResult {
    const start = performance.now();
    const cacheKey = `${baseVersion}-${targetVersion}`;
    
    const cached = this.deltaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return {
        delta: {
          baseVersion,
          targetVersion,
          operations: cached.operations,
          timestamp: Date.now(),
          compressed: options.compress ?? false,
        },
        hasChanges: cached.operations.length > 0,
      };
    }

    const operations: DeltaOperation[] = [];

    if (options.compress) {
      this.compareValuesCompressed(oldState, newState, '', operations);
    } else {
      this.compareValues(oldState, newState, '', operations);
    }

    const optimized = this.optimizeOperations(operations);

    if (this.deltaCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.deltaCache.keys().next().value;
      this.deltaCache.delete(oldestKey);
    }

    this.deltaCache.set(cacheKey, {
      operations: optimized,
      timestamp: Date.now(),
      size: JSON.stringify(optimized).length,
    });

    const duration = performance.now() - start;
    if (duration > 20) {
      console.warn(`[DeltaCalculator] Slow delta calculation: ${duration.toFixed(2)}ms`);
    }

    return {
      delta: {
        baseVersion,
        targetVersion,
        operations: optimized,
        timestamp: Date.now(),
        compressed: options.compress ?? false,
      },
      hasChanges: optimized.length > 0,
    };
  }

  private compareValues(
    oldVal: unknown,
    newVal: unknown,
    path: string,
    operations: DeltaOperation[]
  ): void {
    if (this.isEqual(oldVal, newVal)) return;

    if (oldVal === undefined || oldVal === null) {
      operations.push({
        op: 'add',
        path: path || '/',
        value: newVal,
      });
      return;
    }

    if (newVal === undefined || newVal === null) {
      operations.push({
        op: 'remove',
        path: path || '/',
      });
      return;
    }

    if (
      typeof oldVal !== 'object' ||
      typeof newVal !== 'object' ||
      Array.isArray(oldVal) !== Array.isArray(newVal)
    ) {
      operations.push({
        op: 'replace',
        path: path || '/',
        value: newVal,
      });
      return;
    }

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      this.compareArraysOptimized(oldVal, newVal, path, operations);
    } else {
      this.compareObjects(
        oldVal as Record<string, unknown>,
        newVal as Record<string, unknown>,
        path,
        operations
      );
    }
  }

  private compareValuesCompressed(
    oldVal: unknown,
    newVal: unknown,
    path: string,
    operations: DeltaOperation[]
  ): void {
    if (this.isEqual(oldVal, newVal)) return;

    const newValSize = this.estimateSize(newVal);
    const oldValSize = this.estimateSize(oldVal);

    if (newValSize > 1000 && oldValSize > 1000) {
      const similarity = this.calculateSimilarity(oldVal, newVal);
      if (similarity < 0.5) {
        operations.push({
          op: 'replace',
          path: path || '/',
          value: this.compressValue(newVal),
        });
        return;
      }
    }

    this.compareValues(oldVal, newVal, path, operations);
  }

  private compareObjects(
    oldObj: Record<string, unknown>,
    newObj: Record<string, unknown>,
    basePath: string,
    operations: DeltaOperation[]
  ): void {
    const oldKeys = Object.keys(oldObj);
    const newKeys = Object.keys(newObj);

    for (const key of oldKeys) {
      if (!(key in newObj)) {
        operations.push({
          op: 'remove',
          path: this.buildPath(basePath, key),
        });
      }
    }

    for (const key of newKeys) {
      const oldVal = oldObj[key];
      const newVal = newObj[key];
      const currentPath = this.buildPath(basePath, key);

      if (!(key in oldObj)) {
        operations.push({
          op: 'add',
          path: currentPath,
          value: newVal,
        });
      } else if (!this.isEqual(oldVal, newVal)) {
        this.compareValues(oldVal, newVal, currentPath, operations);
      }
    }
  }

  private compareArraysOptimized(
    oldArr: unknown[],
    newArr: unknown[],
    basePath: string,
    operations: DeltaOperation[]
  ): void {
    const maxLen = Math.max(oldArr.length, newArr.length);
    let startDiff = 0;
    let endDiff = 0;

    while (startDiff < oldArr.length && startDiff < newArr.length && 
           this.isEqual(oldArr[startDiff], newArr[startDiff])) {
      startDiff++;
    }

    while (endDiff < oldArr.length - startDiff && endDiff < newArr.length - startDiff &&
           this.isEqual(oldArr[oldArr.length - 1 - endDiff], newArr[newArr.length - 1 - endDiff])) {
      endDiff++;
    }

    if (startDiff === 0 && endDiff === 0 && oldArr.length !== newArr.length) {
      operations.push({
        op: 'replace',
        path: basePath || '/',
        value: newArr,
      });
      return;
    }

    for (let i = startDiff; i < newArr.length - endDiff; i++) {
      if (i < oldArr.length - endDiff) {
        const currentPath = this.buildPath(basePath, i.toString());
        if (!this.isEqual(oldArr[i], newArr[i])) {
          this.compareValues(oldArr[i], newArr[i], currentPath, operations);
        }
      } else {
        operations.push({
          op: 'add',
          path: this.buildPath(basePath, i.toString()),
          value: newArr[i],
        });
      }
    }

    for (let i = oldArr.length - endDiff; i > startDiff && i <= oldArr.length; i--) {
      operations.push({
        op: 'remove',
        path: this.buildPath(basePath, (newArr.length - endDiff + (i - startDiff)).toString()),
      });
    }
  }

  private optimizeOperations(operations: DeltaOperation[]): DeltaOperation[] {
    if (operations.length <= 1) return operations;

    const optimized: DeltaOperation[] = [];
    const pathMap = new Map<string, DeltaOperation[]>();

    for (const op of operations) {
      const basePath = op.path.split('/').slice(0, -1).join('/') || '/';
      if (!pathMap.has(basePath)) {
        pathMap.set(basePath, []);
      }
      pathMap.get(basePath)!.push(op);
    }

    for (const [basePath, ops] of pathMap) {
      if (ops.length > 3) {
        const parentOps = ops.filter(o => o.path === basePath);
        if (parentOps.length === 0) {
          const merged: DeltaOperation = {
            op: 'replace',
            path: basePath,
            value: this.reconstructValue(ops),
          };
          optimized.push(merged);
          continue;
        }
      }
      optimized.push(...ops);
    }

    return optimized;
  }

  private reconstructValue(operations: DeltaOperation[]): unknown {
    const result: Record<string, unknown> = {};
    
    for (const op of operations) {
      const key = op.path.split('/').pop() || '';
      if (op.op === 'add' || op.op === 'replace') {
        result[key] = op.value;
      }
    }
    
    return result;
  }

  applyDelta(
    state: Record<string, unknown>,
    delta: StateDelta
  ): StateChange[] {
    const start = performance.now();
    const changes: StateChange[] = [];

    const operations = delta.compressed 
      ? delta.operations.map(op => this.decompressOperation(op))
      : delta.operations;

    for (const op of operations) {
      try {
        const change = this.applyOperation(state, op);
        if (change) {
          changes.push(change);
        }
      } catch (error) {
        console.error('Failed to apply delta operation:', op, error);
      }
    }

    const duration = performance.now() - start;
    if (duration > 20) {
      console.warn(`[DeltaCalculator] Slow delta apply: ${duration.toFixed(2)}ms`);
    }

    return changes;
  }

  bufferOperation(operation: DeltaOperation): void {
    this.operationBuffer.push(operation);

    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
    }

    this.bufferTimer = setTimeout(() => {
      this.flushOperationBuffer();
    }, this.BUFFER_TIMEOUT);
  }

  flushOperationBuffer(): DeltaOperation[] {
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }

    const ops = [...this.operationBuffer];
    this.operationBuffer = [];
    return ops;
  }

  private applyOperation(
    state: Record<string, unknown>,
    op: DeltaOperation
  ): StateChange | null {
    const keys = this.parsePath(op.path);
    const now = Date.now();

    if (keys.length === 0) {
      switch (op.op) {
        case 'add':
        case 'replace':
          const oldRoot = { ...state };
          Object.assign(state, op.value as Record<string, unknown>);
          return {
            path: 'root',
            previousValue: oldRoot,
            newValue: { ...state },
            timestamp: now,
          };
        case 'remove':
          const removed = { ...state };
          for (const key of Object.keys(state)) {
            delete (state as Record<string, unknown>)[key];
          }
          return {
            path: 'root',
            previousValue: removed,
            newValue: {},
            timestamp: now,
          };
        default:
          return null;
      }
    }

    const targetKey = keys[keys.length - 1];
    let target = state;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    }

    const oldValue = target[targetKey];

    switch (op.op) {
      case 'add':
      case 'replace':
        target[targetKey] = op.value;
        return {
          path: keys.join('.'),
          previousValue: oldValue,
          newValue: op.value,
          timestamp: now,
        };
      case 'remove':
        delete target[targetKey];
        return {
          path: keys.join('.'),
          previousValue: oldValue,
          newValue: undefined,
          timestamp: now,
        };
      case 'move':
        if (op.from) {
          const fromKeys = this.parsePath(op.from);
          let fromTarget = state;
          for (let i = 0; i < fromKeys.length - 1; i++) {
            fromTarget = fromTarget[fromKeys[i]] as Record<string, unknown>;
          }
          const value = fromTarget[fromKeys[fromKeys.length - 1]];
          delete fromTarget[fromKeys[fromKeys.length - 1]];
          target[targetKey] = value;
          return {
            path: keys.join('.'),
            previousValue: undefined,
            newValue: value,
            timestamp: now,
          };
        }
        return null;
      case 'copy':
        if (op.from) {
          const fromKeys = this.parsePath(op.from);
          let fromTarget = state;
          for (let i = 0; i < fromKeys.length - 1; i++) {
            fromTarget = fromTarget[fromKeys[i]] as Record<string, unknown>;
          }
          target[targetKey] = fromTarget[fromKeys[fromKeys.length - 1]];
          return {
            path: keys.join('.'),
            previousValue: oldValue,
            newValue: target[targetKey],
            timestamp: now,
          };
        }
        return null;
      case 'test':
        if (!this.isEqual(target[targetKey], op.value)) {
          throw new Error(
            `Test operation failed at ${op.path}: expected ${JSON.stringify(
              op.value
            )}, got ${JSON.stringify(target[targetKey])}`
          );
        }
        return null;
      default:
        return null;
    }
  }

  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
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

  private buildPath(base: string, key: string): string {
    if (!base) return `/${key}`;
    if (base.startsWith('/')) return `${base}/${key}`;
    return `${base}/${key}`;
  }

  private parsePath(path: string): string[] {
    if (!path || path === '/') return [];
    return path
      .replace(/^\//, '')
      .split('/')
      .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  }

  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') return value.length;
    if (typeof value === 'number' || typeof value === 'boolean') return 8;
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this.estimateSize(item), 0);
    }
    if (typeof value === 'object') {
      return Object.keys(value).reduce((sum, key) => {
        return sum + key.length + this.estimateSize((value as Record<string, unknown>)[key]);
      }, 0);
    }
    return 0;
  }

  private calculateSimilarity(a: unknown, b: unknown): number {
    if (this.isEqual(a, b)) return 1;
    if (typeof a !== 'object' || typeof b !== 'object') return 0;
    if (a === null || b === null) return 0;

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    const commonKeys = aKeys.filter(k => bKeys.includes(k));
    
    return (2 * commonKeys.length) / (aKeys.length + bKeys.length);
  }

  private compressValue(value: unknown): unknown {
    if (typeof value === 'string' && value.length > 100) {
      return { __compressed: true, type: 'string', data: this.lzwCompress(value) };
    }
    return value;
  }

  private decompressOperation(op: DeltaOperation): DeltaOperation {
    if (op.value && typeof op.value === 'object' && (op.value as Record<string, unknown>).__compressed) {
      return {
        ...op,
        value: this.lzwDecompress((op.value as Record<string, unknown>).data as string),
      };
    }
    return op;
  }

  private lzwCompress(input: string): string {
    const dict: Map<string, number> = new Map();
    let dictSize = 256;
    
    for (let i = 0; i < 256; i++) {
      dict.set(String.fromCharCode(i), i);
    }

    let w = '';
    const result: number[] = [];

    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      const wc = w + c;
      
      if (dict.has(wc)) {
        w = wc;
      } else {
        result.push(dict.get(w)!);
        dict.set(wc, dictSize++);
        w = c;
      }
    }

    if (w !== '') {
      result.push(dict.get(w)!);
    }

    return btoa(String.fromCharCode(...result));
  }

  private lzwDecompress(compressed: string): string {
    const input = atob(compressed);
    const dict: string[] = [];
    
    for (let i = 0; i < 256; i++) {
      dict[i] = String.fromCharCode(i);
    }

    let dictSize = 256;
    let w = dict[input.charCodeAt(0)];
    const result = [w];

    for (let i = 1; i < input.length; i++) {
      const k = input.charCodeAt(i);
      let entry: string;

      if (k in dict) {
        entry = dict[k];
      } else if (k === dictSize) {
        entry = w + w[0];
      } else {
        throw new Error('Invalid compressed data');
      }

      result.push(entry);
      dict[dictSize++] = w + entry[0];
      w = entry;
    }

    return result.join('');
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.deltaCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.deltaCache.delete(key);
      }
    }
  }

  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.deltaCache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: 0,
    };
  }
}
