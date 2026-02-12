import {createSlice, createAsyncThunk, PayloadAction} from '@reduxjs/toolkit';
import {Session} from '@types/index';
import * as sessionService from '@services/session';

interface SessionState {
  currentSession: Session | null;
  activeSession: Session | null;
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
}

const initialState: SessionState = {
  currentSession: null,
  activeSession: null,
  sessions: [],
  isLoading: false,
  error: null,
};

export const fetchSessions = createAsyncThunk(
  'session/fetchAll',
  async (_, {rejectWithValue}) => {
    try {
      const sessions = await sessionService.getSessions();
      return sessions;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const createSession = createAsyncThunk(
  'session/create',
  async (_, {rejectWithValue}) => {
    try {
      const session = await sessionService.createSession();
      return session;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const terminateSession = createAsyncThunk(
  'session/terminate',
  async (sessionId: string, {rejectWithValue}) => {
    try {
      await sessionService.terminateSession(sessionId);
      return sessionId;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const acceptHandoff = createAsyncThunk(
  'session/acceptHandoff',
  async ({sessionId}: {sessionId: string}, {rejectWithValue}) => {
    try {
      // Call API to accept handoff
      const session = await sessionService.acceptHandoff(sessionId);
      return session;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const rejectHandoff = createAsyncThunk(
  'session/rejectHandoff',
  async ({sessionId}: {sessionId: string}, {rejectWithValue}) => {
    try {
      await sessionService.rejectHandoff(sessionId);
      return sessionId;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setCurrentSession: (state, action: PayloadAction<Session>) => {
      state.currentSession = action.payload;
    },
    clearError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchSessions.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSessions.fulfilled, (state, action) => {
        state.isLoading = false;
        state.sessions = action.payload;
      })
      .addCase(fetchSessions.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(createSession.fulfilled, (state, action) => {
        state.currentSession = action.payload;
        state.sessions.unshift(action.payload);
      })
      .addCase(terminateSession.fulfilled, (state, action) => {
        state.sessions = state.sessions.filter(s => s.id !== action.payload);
        if (state.currentSession?.id === action.payload) {
          state.currentSession = null;
        }
      })
      .addCase(acceptHandoff.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(acceptHandoff.fulfilled, (state, action) => {
        state.isLoading = false;
        state.activeSession = action.payload;
        state.sessions.unshift(action.payload);
      })
      .addCase(acceptHandoff.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(rejectHandoff.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(rejectHandoff.fulfilled, state => {
        state.isLoading = false;
      })
      .addCase(rejectHandoff.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {setCurrentSession, clearError} = sessionSlice.actions;
export default sessionSlice.reducer;
