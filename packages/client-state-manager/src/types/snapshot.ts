export interface StateSnapshot {
  id: string;
  timestamp: number;
  version: number;
  data: unknown;
  checksum: string;
  deviceId: string;
  sessionId: string;
}

export interface SnapshotMetadata {
  previousSnapshotId?: string;
  compressed?: boolean;
  compressionAlgorithm?: string;
}
