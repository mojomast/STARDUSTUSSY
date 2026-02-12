import { StateManager } from '../core/StateManager';
import type { StateChange } from '../types';

export interface ReduxAdapterOptions {
  stateManager: StateManager;
  selectState?: (state: unknown) => unknown;
  actionType?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = (x: StateChange) => x;

export interface StateSyncAction {
  type: string;
  payload: {
    path: string;
    value: unknown;
    changes: StateChange[];
  };
}

export function createReduxMiddleware(options: ReduxAdapterOptions) {
  const { stateManager, actionType = '@@STATE_SYNC/UPDATE' } = options;

  return (store: unknown) => (next: (action: unknown) => unknown) => (action: unknown) => {
    const result = next(action);
    
    if (
      typeof action === 'object' &&
      action !== null &&
      (action as StateSyncAction).type !== actionType
    ) {
      const typedAction = action as { type: string; payload?: unknown };
      
      if (typedAction.type.startsWith('@@')) {
        return result;
      }
    }

    return result;
  };
}

export function createReduxEnhancer(options: ReduxAdapterOptions) {
  const { stateManager, selectState = (s) => s } = options;

  return (createStore: unknown) => (reducer: unknown, preloadedState: unknown) => {
    const store = (createStore as Function)(reducer, preloadedState);
    
    const unsubscribe = stateManager.subscribe((changes) => {
      changes.forEach((change) => {
        store.dispatch({
          type: '@@STATE_SYNC/UPDATE',
          payload: {
            path: change.path,
            value: change.newValue,
            changes: [change],
          },
        });
      });
    });

    const originalDispatch = store.dispatch.bind(store);
    store.dispatch = (action: unknown) => {
      const result = originalDispatch(action);
      
      if (
        typeof action === 'object' &&
        action !== null &&
        (action as StateSyncAction).type?.startsWith('@@')
      ) {
        return result;
      }

      const currentState = selectState(store.getState());
      
      if (
        typeof currentState === 'object' &&
        currentState !== null
      ) {
        syncReduxToStateManager(
          stateManager,
          currentState as Record<string, unknown>
        );
      }

      return result;
    };

    const originalReplaceReducer = store.replaceReducer.bind(store);
    store.replaceReducer = (nextReducer: unknown) => {
      originalReplaceReducer(nextReducer);
    };

    (store as Record<string, unknown>).destroyStateSync = () => {
      unsubscribe();
    };

    return store;
  };
}

function syncReduxToStateManager(
  stateManager: StateManager,
  state: Record<string, unknown>
): void {
  const currentState = stateManager.getStateData();
  
  const updates: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(state)) {
    if (JSON.stringify(currentState[key]) !== JSON.stringify(value)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length > 0) {
    stateManager.batchUpdate(updates);
  }
}

export function createStateSyncReducer(
  rootReducer: (state: unknown, action: unknown) => unknown
) {
  return (state: unknown, action: unknown) => {
    if (
      typeof action === 'object' &&
      action !== null &&
      (action as StateSyncAction).type === '@@STATE_SYNC/UPDATE'
    ) {
      const syncAction = action as StateSyncAction;
      const { path, value } = syncAction.payload;
      
      return setValueAtPath(state, path, value);
    }

    return rootReducer(state, action);
  };
}

function setValueAtPath(state: unknown, path: string, value: unknown): unknown {
  if (typeof state !== 'object' || state === null) {
    return state;
  }

  const keys = path.split('.');
  const result = Array.isArray(state) ? [...state] : { ...state };
  let current: Record<string, unknown> = result as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const next = (current as Record<string, unknown>)[key];
    
    if (typeof next === 'object' && next !== null) {
      (current as Record<string, unknown>)[key] = Array.isArray(next)
        ? [...next]
        : { ...next };
      current = (current as Record<string, unknown>)[key] as Record<string, unknown>;
    }
  }

  (current as Record<string, unknown>)[keys[keys.length - 1]] = value;
  return result;
}
