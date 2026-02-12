import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { HandoffState, HandoffRequest } from '../../types/index.ts';

const initialState: HandoffState = {
  activeHandoff: null,
  handoffHistory: [],
  qrCodeData: null,
  isScanning: false,
  isLoading: false,
  error: null,
};

export const initiateHandoff = createAsyncThunk(
  'handoff/initiateHandoff',
  async ({ targetDeviceId, sessionId }: { targetDeviceId: string; sessionId: string }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/handoff/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify({ targetDeviceId, sessionId }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to initiate handoff');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const acceptHandoff = createAsyncThunk(
  'handoff/acceptHandoff',
  async (handoffId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/handoff/${handoffId}/accept`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to accept handoff');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const cancelHandoff = createAsyncThunk(
  'handoff/cancelHandoff',
  async (handoffId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/handoff/${handoffId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to cancel handoff');
      }

      return handoffId;
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const generateQRCode = createAsyncThunk(
  'handoff/generateQRCode',
  async (sessionId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/handoff/qr?sessionId=${sessionId}`, {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to generate QR code');
      }

      const data = await response.json();
      return data.qrData;
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const scanQRCode = createAsyncThunk(
  'handoff/scanQRCode',
  async (qrData: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/handoff/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify({ qrData }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to scan QR code');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const renameDevice = createAsyncThunk(
  'handoff/renameDevice',
  async ({ deviceId, newName }: { deviceId: string; newName: string }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/devices/${deviceId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify({ name: newName }),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to rename device');
      }

      return { deviceId, newName };
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const disconnectDevice = createAsyncThunk(
  'handoff/disconnectDevice',
  async (deviceId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/devices/${deviceId}/disconnect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to disconnect device');
      }

      return deviceId;
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const fetchHandoffHistory = createAsyncThunk(
  'handoff/fetchHandoffHistory',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/handoff/history', {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch handoff history');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

const handoffSlice = createSlice({
  name: 'handoff',
  initialState,
  reducers: {
    setActiveHandoff: (state, action: PayloadAction<HandoffRequest | null>) => {
      state.activeHandoff = action.payload;
    },
    updateHandoffProgress: (state, action: PayloadAction<number>) => {
      if (state.activeHandoff) {
        state.activeHandoff.progress = action.payload;
      }
    },
    setScanning: (state, action: PayloadAction<boolean>) => {
      state.isScanning = action.payload;
    },
    clearQRCode: (state) => {
      state.qrCodeData = null;
    },
    clearHandoffError: (state) => {
      state.error = null;
    },
    addHandoffToHistory: (state, action: PayloadAction<HandoffRequest>) => {
      state.handoffHistory.unshift(action.payload);
      if (state.handoffHistory.length > 50) {
        state.handoffHistory.pop();
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initiateHandoff.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(initiateHandoff.fulfilled, (state, action) => {
        state.isLoading = false;
        state.activeHandoff = action.payload;
      })
      .addCase(initiateHandoff.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(acceptHandoff.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(acceptHandoff.fulfilled, (state) => {
        state.isLoading = false;
        if (state.activeHandoff) {
          state.activeHandoff.status = 'in_progress';
        }
      })
      .addCase(acceptHandoff.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(cancelHandoff.fulfilled, (state, action) => {
        if (state.activeHandoff?.id === action.payload) {
          state.activeHandoff.status = 'cancelled';
        }
      })
      .addCase(generateQRCode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(generateQRCode.fulfilled, (state, action) => {
        state.isLoading = false;
        state.qrCodeData = action.payload;
      })
      .addCase(generateQRCode.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(scanQRCode.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.isScanning = true;
      })
      .addCase(scanQRCode.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isScanning = false;
        state.activeHandoff = action.payload;
      })
      .addCase(scanQRCode.rejected, (state, action) => {
        state.isLoading = false;
        state.isScanning = false;
        state.error = action.payload as string;
      })
      .addCase(renameDevice.fulfilled, () => {
        // Device name update handled by session slice or refetch
      })
      .addCase(disconnectDevice.fulfilled, () => {
        // Device disconnection handled by session slice or refetch
      })
      .addCase(fetchHandoffHistory.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchHandoffHistory.fulfilled, (state, action) => {
        state.isLoading = false;
        state.handoffHistory = action.payload;
      })
      .addCase(fetchHandoffHistory.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setActiveHandoff,
  updateHandoffProgress,
  setScanning,
  clearQRCode,
  clearHandoffError,
  addHandoffToHistory,
} = handoffSlice.actions;

export default handoffSlice.reducer;
