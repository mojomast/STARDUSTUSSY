import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { SessionContinuityState, RecentSession, AppState } from '../../types/index.ts';

const initialState: SessionContinuityState = {
  recentSessions: [],
  pendingResume: null,
  showResumePrompt: false,
  isRestoring: false,
  restorationProgress: 0,
  conflictData: null,
  showConflictDialog: false,
};

export const fetchRecentSessions = createAsyncThunk(
  'sessionContinuity/fetchRecentSessions',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/sessions/recent', {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch recent sessions');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const resumeSession = createAsyncThunk(
  'sessionContinuity/resumeSession',
  async (sessionId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/sessions/${sessionId}/resume`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to resume session');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const checkForActiveSession = createAsyncThunk(
  'sessionContinuity/checkForActiveSession',
  async (_, { getState }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/sessions/active', {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      return null;
    }
  }
);

export const resolveConflict = createAsyncThunk(
  'sessionContinuity/resolveConflict',
  async (
    { sessionId, resolution, mergedState }: { sessionId: string; resolution: 'local' | 'remote' | 'merge'; mergedState?: AppState },
    { getState, rejectWithValue }
  ) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/sessions/${sessionId}/resolve-conflict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify({ resolution, mergedState }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to resolve conflict');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

const sessionContinuitySlice = createSlice({
  name: 'sessionContinuity',
  initialState,
  reducers: {
    setPendingResume: (state, action: PayloadAction<RecentSession | null>) => {
      state.pendingResume = action.payload;
      state.showResumePrompt = action.payload !== null;
    },
    setShowResumePrompt: (state, action: PayloadAction<boolean>) => {
      state.showResumePrompt = action.payload;
    },
    setRestorationProgress: (state, action: PayloadAction<number>) => {
      state.restorationProgress = action.payload;
    },
    setConflictData: (state, action: PayloadAction<SessionContinuityState['conflictData']>) => {
      state.conflictData = action.payload;
      state.showConflictDialog = action.payload !== null;
    },
    setShowConflictDialog: (state, action: PayloadAction<boolean>) => {
      state.showConflictDialog = action.payload;
    },
    dismissResumePrompt: (state) => {
      state.showResumePrompt = false;
      state.pendingResume = null;
    },
    clearConflict: (state) => {
      state.conflictData = null;
      state.showConflictDialog = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRecentSessions.pending, (state) => {
        state.isRestoring = true;
      })
      .addCase(fetchRecentSessions.fulfilled, (state, action) => {
        state.isRestoring = false;
        state.recentSessions = action.payload;
      })
      .addCase(fetchRecentSessions.rejected, (state) => {
        state.isRestoring = false;
      })
      .addCase(resumeSession.pending, (state) => {
        state.isRestoring = true;
        state.restorationProgress = 0;
      })
      .addCase(resumeSession.fulfilled, (state) => {
        state.isRestoring = false;
        state.restorationProgress = 100;
        state.showResumePrompt = false;
        state.pendingResume = null;
      })
      .addCase(resumeSession.rejected, (state) => {
        state.isRestoring = false;
        state.restorationProgress = 0;
      })
      .addCase(checkForActiveSession.fulfilled, (state, action) => {
        if (action.payload) {
          state.pendingResume = action.payload;
          state.showResumePrompt = true;
        }
      })
      .addCase(resolveConflict.pending, (state) => {
        state.isRestoring = true;
      })
      .addCase(resolveConflict.fulfilled, (state) => {
        state.isRestoring = false;
        state.showConflictDialog = false;
        state.conflictData = null;
      })
      .addCase(resolveConflict.rejected, (state) => {
        state.isRestoring = false;
      });
  },
});

export const {
  setPendingResume,
  setShowResumePrompt,
  setRestorationProgress,
  setConflictData,
  setShowConflictDialog,
  dismissResumePrompt,
  clearConflict,
} = sessionContinuitySlice.actions;

export default sessionContinuitySlice.reducer;
