import {createSlice, PayloadAction} from '@reduxjs/toolkit';
import {SyncStatus} from '@types/index';

interface SyncState extends SyncStatus {
  isBatteryOptimized: boolean;
  syncErrors: string[];
}

const initialState: SyncState = {
  isOnline: true,
  isSyncing: false,
  lastSyncTime: null,
  pendingChanges: 0,
  isBatteryOptimized: false,
  syncErrors: [],
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    setSyncing: (state, action: PayloadAction<boolean>) => {
      state.isSyncing = action.payload;
    },
    setLastSyncTime: (state, action: PayloadAction<Date>) => {
      state.lastSyncTime = action.payload;
    },
    setPendingChanges: (state, action: PayloadAction<number>) => {
      state.pendingChanges = action.payload;
    },
    setBatteryOptimized: (state, action: PayloadAction<boolean>) => {
      state.isBatteryOptimized = action.payload;
    },
    addSyncError: (state, action: PayloadAction<string>) => {
      state.syncErrors.push(action.payload);
      if (state.syncErrors.length > 10) {
        state.syncErrors.shift();
      }
    },
    clearSyncErrors: state => {
      state.syncErrors = [];
    },
    incrementPendingChanges: state => {
      state.pendingChanges += 1;
    },
    decrementPendingChanges: state => {
      state.pendingChanges = Math.max(0, state.pendingChanges - 1);
    },
  },
});

export const {
  setOnlineStatus,
  setSyncing,
  setLastSyncTime,
  setPendingChanges,
  setBatteryOptimized,
  addSyncError,
  clearSyncErrors,
  incrementPendingChanges,
  decrementPendingChanges,
} = syncSlice.actions;
export default syncSlice.reducer;
