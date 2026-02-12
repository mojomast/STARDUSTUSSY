export type DeltaOperationType = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

export interface DeltaOperation {
  op: DeltaOperationType;
  path: string;
  value?: unknown;
  from?: string;
}

export interface StateDelta {
  baseVersion: number;
  targetVersion: number;
  operations: DeltaOperation[];
  checksum?: string;
  timestamp: number;
  compressed?: boolean;
}

export interface DeltaResult {
  delta: StateDelta;
  hasChanges: boolean;
}

export interface DeltaCompressionOptions {
  compress?: boolean;
  threshold?: number;
  maxOperations?: number;
}
