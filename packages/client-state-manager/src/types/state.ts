export interface AppState {
  version: number;
  timestamp: number;
  data: StateData;
  metadata: StateMetadata;
}

export interface StateData {
  [key: string]: unknown;
}

export interface StateMetadata {
  lastModified: number;
  modifiedBy: string;
  syncStatus: SyncStatus;
  conflictResolution?: ConflictResolution;
}

export enum SyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending',
  CONFLICT = 'conflict',
  ERROR = 'error',
}

export interface ConflictResolution {
  strategy: 'server-wins' | 'client-wins' | 'manual';
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface StateChange {
  path: string;
  previousValue: unknown;
  newValue: unknown;
  timestamp: number;
}

export type StateChangeListener = (changes: StateChange[]) => void;
