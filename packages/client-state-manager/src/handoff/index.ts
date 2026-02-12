/**
 * Handoff Module - Cross-Device Session Handoff
 * Week 3 Implementation
 */

export { HandoffManager } from './HandoffManager';
export { SessionUUIDManager } from './SessionUUIDManager';
export { SnapshotReplayEngine } from './SnapshotReplayEngine';
export { DeviceHandoffProtocol } from './DeviceHandoffProtocol';
export { MultiDeviceSyncManager } from './MultiDeviceSyncManager';

export type {
  HandoffManagerConfig,
  HandoffManagerEvent,
  HandoffManagerEventType,
} from './HandoffManager';

export type {
  SessionUUIDManagerConfig,
} from './SessionUUIDManager';

export type {
  SnapshotReplayEngineConfig,
} from './SnapshotReplayEngine';

export type {
  DeviceHandoffProtocolConfig,
  HandoffEvent,
  HandoffEventType,
} from './DeviceHandoffProtocol';

export type {
  MultiDeviceSyncManagerConfig,
  PresenceEvent,
  PresenceEventType,
} from './MultiDeviceSyncManager';
