import { AppState } from '../types';

export interface FingerprintOptions {
  includeMetadata?: boolean;
  includeTimestamp?: boolean;
  algorithm?: 'simple' | 'full' | 'deep';
}

export class StateFingerprint {
  generate(state: AppState, options: FingerprintOptions = {}): string {
    const opts: Required<FingerprintOptions> = {
      includeMetadata: false,
      includeTimestamp: false,
      algorithm: 'simple',
      ...options,
    };

    switch (opts.algorithm) {
      case 'full':
        return this.generateFull(state, opts);
      case 'deep':
        return this.generateDeep(state, opts);
      case 'simple':
      default:
        return this.generateSimple(state);
    }
  }

  private generateSimple(state: AppState): string {
    const data = JSON.stringify(state.data);
    return this.hashString(data);
  }

  private generateFull(state: AppState, options: FingerprintOptions): string {
    const toHash: Record<string, unknown> = {
      data: state.data,
    };

    if (options.includeMetadata) {
      toHash.metadata = state.metadata;
    }

    if (options.includeTimestamp) {
      toHash.timestamp = state.timestamp;
    }

    const canonical = this.canonicalize(toHash);
    return this.hashString(JSON.stringify(canonical));
  }

  private generateDeep(state: AppState, options: FingerprintOptions): string {
    const full = this.generateFull(state, options);
    return this.hashString(full + state.version.toString());
  }

  compare(state1: AppState, state2: AppState, options?: FingerprintOptions): boolean {
    return this.generate(state1, options) === this.generate(state2, options);
  }

  hasChanged(state: AppState, previousFingerprint: string, options?: FingerprintOptions): boolean {
    return this.generate(state, options) !== previousFingerprint;
  }

  private hashString(str: string): string {
    let hash = 0;

    if (str.length === 0) return hash.toString(16).padStart(8, '0');

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private canonicalize(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.canonicalize(item));
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      sorted[key] = this.canonicalize(
        (obj as Record<string, unknown>)[key]
      );
    }

    return sorted;
  }

  generateSegmented(state: AppState): Record<string, string> {
    const segments: Record<string, string> = {};

    for (const [key, value] of Object.entries(state.data)) {
      segments[key] = this.hashString(JSON.stringify(value));
    }

    return segments;
  }

  compareSegments(
    state: AppState,
    previousSegments: Record<string, string>
  ): { changed: string[]; unchanged: string[]; added: string[]; removed: string[] } {
    const current = this.generateSegmented(state);
    const changed: string[] = [];
    const unchanged: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];

    for (const key of Object.keys(current)) {
      if (!(key in previousSegments)) {
        added.push(key);
      } else if (current[key] !== previousSegments[key]) {
        changed.push(key);
      } else {
        unchanged.push(key);
      }
    }

    for (const key of Object.keys(previousSegments)) {
      if (!(key in current)) {
        removed.push(key);
      }
    }

    return { changed, unchanged, added, removed };
  }
}
