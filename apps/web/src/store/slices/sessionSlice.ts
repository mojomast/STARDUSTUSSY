import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { SessionState, SessionData, Device, ConnectionStatus, AppState } from '../../types/index.ts';

const initialState: SessionState = {
  currentSession: null,
  devices: [],
  connectionStatus: {
    connected: false,
    connecting: false,
    error: null,
    deviceId: null,
  },
  isLoading: false,
  error: null,
};

export const createSession = createAsyncThunk(
  'session/createSession',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to create session');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const fetchSession = createAsyncThunk(
  'session/fetchSession',
  async (sessionId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch session');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setConnectionStatus: (state, action: PayloadAction<Partial<ConnectionStatus>>) => {
      state.connectionStatus = { ...state.connectionStatus, ...action.payload };
    },
    updateSessionState: (state, action: PayloadAction<AppState>) => {
      if (state.currentSession) {
        state.currentSession.state = { ...state.currentSession.state, ...action.payload };
      }
    },
    setCurrentSession: (state, action: PayloadAction<SessionData | null>) => {
      state.currentSession = action.payload;
    },
    setDevices: (state, action: PayloadAction<Device[]>) => {
      state.devices = action.payload;
    },
    addDevice: (state, action: PayloadAction<Device>) => {
      const exists = state.devices.find((d: Device) => d.id === action.payload.id);
      if (!exists) {
        state.devices.push(action.payload);
      }
    },
    removeDevice: (state, action: PayloadAction<string>) => {
      state.devices = state.devices.filter((d: Device) => d.id !== action.payload);
    },
    clearSessionError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createSession.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createSession.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentSession = action.payload;
      })
      .addCase(createSession.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchSession.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSession.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentSession = action.payload;
      })
      .addCase(fetchSession.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setConnectionStatus,
  updateSessionState,
  setCurrentSession,
  setDevices,
  addDevice,
  removeDevice,
  clearSessionError,
} = sessionSlice.actions;

export default sessionSlice.reducer;
