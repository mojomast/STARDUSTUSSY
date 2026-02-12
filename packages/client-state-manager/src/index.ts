/**
 * HarmonyFlow Client State Manager
 * 
 * A high-performance state synchronization library for the HarmonyFlow wellness platform.
 * 
 * @module @harmonyflow/client-state-manager
 * @version 1.0.0
 * @license MIT
 */

// Type exports
export * from './types';

// Handoff exports
export * from './handoff';

// Core class exports
export { StateManager } from './core/StateManager';
export { WebSocketClient } from './core/WebSocketClient';
export { StateSerializer } from './core/StateSerializer';
export { StateFingerprint } from './core/StateFingerprint';
export { DeltaCalculator } from './core/DeltaCalculator';
export { TokenManager } from './core/TokenManager';

// Utility exports
export * from './utils';

// Redux adapter exports
export type {
  ReduxAdapterOptions,
  StateSyncAction,
} from './adapters/redux';

export {
  createReduxMiddleware,
  createReduxEnhancer,
  createStateSyncReducer,
} from './adapters/redux';

// MobX adapter exports
export type {
  MobXAdapterOptions,
} from './adapters/mobx';

export {
  createMobXAdapter,
  StateSyncStore,
} from './adapters/mobx';

// Re-export core types for convenience
export type {
  StateManagerConfig,
  SnapshotOptions,
  RestoreOptions,
  PerformanceMetrics,
} from './core/StateManager';

export type { 
  WebSocketConnectionState 
} from './core/WebSocketClient';
