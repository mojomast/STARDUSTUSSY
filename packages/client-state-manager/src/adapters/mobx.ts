// MobX is an optional peer dependency
// @ts-ignore - mobx is optional
type Observable = any;
type Action = any;
type Autorun = any;

declare const makeObservable: any;
declare const observable: any;
declare const action: any;
declare const autorun: any;

import { StateManager } from '../core/StateManager';

export interface MobXAdapterOptions {
  stateManager: StateManager;
  syncToMobX?: boolean;
  syncFromMobX?: boolean;
}

export class StateSyncStore {
  stateManager: StateManager;
  data: Record<string, unknown> = {};
  version = 0;
  isSyncing = false;
  private disposers: (() => void)[] = [];

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    
    makeObservable(this, {
      data: observable,
      version: observable,
      isSyncing: observable,
      setData: action,
      updateFromStateManager: action,
    });

    this.initialize();
  }

  private initialize(): void {
    this.updateFromStateManager();
    
    const unsubscribe = this.stateManager.subscribe(() => {
      this.updateFromStateManager();
    });
    
    this.disposers.push(unsubscribe);

    const disposer = autorun(() => {
      if (!this.isSyncing) {
        this.syncToStateManager();
      }
    });
    
    this.disposers.push(disposer);
  }

  setData(path: string, value: unknown): void {
    this.isSyncing = true;
    this.stateManager.setState(path, value);
    this.isSyncing = false;
  }

  batchUpdate(updates: Record<string, unknown>): void {
    this.isSyncing = true;
    this.stateManager.batchUpdate(updates);
    this.isSyncing = false;
  }

  private updateFromStateManager(): void {
    if (this.isSyncing) return;
    
    this.data = this.stateManager.getStateData();
    this.version = this.stateManager.getVersion();
  }

  private syncToStateManager(): void {
    const currentState = this.stateManager.getStateData();
    const updates: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(this.data)) {
      if (JSON.stringify(currentState[key]) !== JSON.stringify(value)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length > 0) {
      this.isSyncing = true;
      this.stateManager.batchUpdate(updates);
      this.isSyncing = false;
    }
  }

  destroy(): void {
    this.disposers.forEach((disposer) => disposer());
    this.disposers = [];
  }
}

export function createMobXAdapter(options: MobXAdapterOptions) {
  const { stateManager, syncToMobX = true, syncFromMobX = true } = options;

  const store = new StateSyncStore(stateManager);

  return {
    store,
    
    observePath<T>(path: string): { get: () => T; set: (value: T) => void } {
      return {
        get: () => getValueAtPath(store.data, path) as T,
        set: (value: T) => store.setData(path, value),
      };
    },

    destroy: () => store.destroy(),
  };
}

function getValueAtPath(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
