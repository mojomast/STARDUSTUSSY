import { AppState, StateSnapshot } from '../types';

interface CompressionEntry {
  original: string;
  compressed: string;
}

interface SerializationMetrics {
  totalCalls: number;
  totalDuration: number;
  avgDuration: number;
  maxDuration: number;
  slowCalls: number;
}

export class StateSerializer {
  private compressionCache = new Map<string, CompressionEntry>();
  private readonly MAX_CACHE_SIZE = 100;
  private readonly CACHE_TTL = 30000;
  private cacheTimestamps = new Map<string, number>();
  private metrics: SerializationMetrics = {
    totalCalls: 0,
    totalDuration: 0,
    avgDuration: 0,
    maxDuration: 0,
    slowCalls: 0,
  };
  private readonly SLOW_THRESHOLD_MS = 10;

  serialize(state: AppState | StateSnapshot): string {
    const start = performance.now();
    const result = JSON.stringify(state);
    const duration = performance.now() - start;
    
    this.trackMetrics(duration);
    
    if (duration > this.SLOW_THRESHOLD_MS) {
      console.warn(`[StateSerializer] Slow serialization: ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }

  private trackMetrics(duration: number): void {
    this.metrics.totalCalls++;
    this.metrics.totalDuration += duration;
    this.metrics.avgDuration = this.metrics.totalDuration / this.metrics.totalCalls;
    this.metrics.maxDuration = Math.max(this.metrics.maxDuration, duration);
    
    if (duration > this.SLOW_THRESHOLD_MS) {
      this.metrics.slowCalls++;
    }
  }

  getMetrics(): SerializationMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalCalls: 0,
      totalDuration: 0,
      avgDuration: 0,
      maxDuration: 0,
      slowCalls: 0,
    };
  }

  serializeFast(state: AppState | StateSnapshot): string {
    const keys = Object.keys(state);
    let result = '{';
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = (state as Record<string, unknown>)[key];
      
      if (i > 0) result += ',';
      result += `"${key}":${this.fastStringify(value)}`;
    }
    
    result += '}';
    return result;
  }

  private fastStringify(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'null';
    if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      const items = value.map(v => this.fastStringify(v));
      return `[${items.join(',')}]`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      const pairs = keys.map(k => `"${k}":${this.fastStringify((value as Record<string, unknown>)[k])}`);
      return `{${pairs.join(',')}}`;
    }
    return 'null';
  }

  deserialize(serialized: string): AppState {
    try {
      return JSON.parse(serialized) as AppState;
    } catch (error) {
      throw new Error(`Failed to deserialize state: ${error}`);
    }
  }

  clone<T>(obj: T): T {
    const start = performance.now();
    
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      const result = new Array((obj as unknown[]).length);
      for (let i = 0; i < (obj as unknown[]).length; i++) {
        result[i] = this.clone((obj as unknown[])[i]);
      }
      return result as T;
    }

    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[key] = this.clone((obj as Record<string, unknown>)[key]);
    }

    const duration = performance.now() - start;
    if (duration > 10) {
      console.warn(`[StateSerializer] Slow clone: ${duration.toFixed(2)}ms`);
    }

    return result as T;
  }

  shallowClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return [...(obj as unknown[])] as T;
    }

    return { ...(obj as Record<string, unknown>) } as T;
  }

  toBlob(state: AppState): Blob {
    const serialized = this.serialize(state);
    return new Blob([serialized], { type: 'application/json' });
  }

  async fromBlob(blob: Blob): Promise<AppState> {
    const text = await blob.text();
    return this.deserialize(text);
  }

  getSize(state: AppState): number {
    return new Blob([this.serialize(state)]).size;
  }

  getSizeOptimized(state: AppState): number {
    let size = 0;
    const serialized = this.serialize(state);
    
    for (let i = 0; i < serialized.length; i++) {
      const code = serialized.charCodeAt(i);
      size += code <= 0x007f ? 1 : code <= 0x07ff ? 2 : 3;
    }
    
    return size;
  }

  toBase64(state: AppState): string {
    const serialized = this.serialize(state);
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(serialized).toString('base64');
    }
    return btoa(serialized);
  }

  fromBase64(base64: string): AppState {
    let serialized: string;
    if (typeof Buffer !== 'undefined') {
      serialized = Buffer.from(base64, 'base64').toString('utf-8');
    } else {
      serialized = atob(base64);
    }
    return this.deserialize(serialized);
  }

  toCompressed(state: AppState): string {
    const serialized = this.serialize(state);
    const cacheKey = this.computeChecksum(state);
    
    const cached = this.compressionCache.get(cacheKey);
    if (cached && cached.original === serialized) {
      return cached.compressed;
    }

    const compressed = this.compressLZW(serialized);
    
    if (this.compressionCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.compressionCache.keys().next().value;
      this.compressionCache.delete(oldestKey);
      this.cacheTimestamps.delete(oldestKey);
    }

    this.compressionCache.set(cacheKey, { original: serialized, compressed });
    this.cacheTimestamps.set(cacheKey, Date.now());

    return compressed;
  }

  fromCompressed(compressed: string): AppState {
    const serialized = this.decompressLZW(compressed);
    return this.deserialize(serialized);
  }

  private compressLZW(input: string): string {
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

    return this.encodeNumbers(result);
  }

  private decompressLZW(compressed: string): string {
    const codes = this.decodeNumbers(compressed);
    const dict: string[] = [];
    
    for (let i = 0; i < 256; i++) {
      dict[i] = String.fromCharCode(i);
    }

    let dictSize = 256;
    let w = dict[codes[0]];
    const result = [w];

    for (let i = 1; i < codes.length; i++) {
      const k = codes[i];
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

  private encodeNumbers(numbers: number[]): string {
    const chars: string[] = [];
    for (const num of numbers) {
      chars.push(String.fromCharCode((num >> 8) & 0xff));
      chars.push(String.fromCharCode(num & 0xff));
    }
    return btoa(chars.join(''));
  }

  private decodeNumbers(encoded: string): number[] {
    const chars = atob(encoded);
    const numbers: number[] = [];
    for (let i = 0; i < chars.length; i += 2) {
      numbers.push((chars.charCodeAt(i) << 8) | chars.charCodeAt(i + 1));
    }
    return numbers;
  }

  validateChecksum(state: AppState, checksum: string): boolean {
    const computed = this.computeChecksum(state);
    return computed === checksum;
  }

  computeChecksum(state: AppState): string {
    const canonical = this.canonicalize(state);
    return this.fnv1aHash(JSON.stringify(canonical));
  }

  private canonicalize(state: unknown): unknown {
    if (state === null || typeof state !== 'object') {
      return state;
    }

    if (Array.isArray(state)) {
      return state.map((item) => this.canonicalize(item));
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(state as Record<string, unknown>).sort();

    for (const key of keys) {
      sorted[key] = this.canonicalize(
        (state as Record<string, unknown>)[key]
      );
    }

    return sorted;
  }

  private fnv1aHash(str: string): string {
    let hash = 0x811c9dc5;
    
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > this.CACHE_TTL) {
        this.compressionCache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.compressionCache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }
}
