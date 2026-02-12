import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  AdminDashboardState,
  ActiveSessionMetrics,
  ReconnectionMetrics,
  SnapshotMetrics,
  Alert,
  TimeRange,
  ExportData,
} from '../../types/index.ts';

const initialState: AdminDashboardState = {
  activeSessions: {
    totalSessions: 0,
    activeDevices: 0,
    avgDevicesPerSession: 0,
    geographicDistribution: [],
  },
  reconnectionMetrics: {
    successRate: 0,
    failureRate: 0,
    avgReconnectionTime: 0,
    backoffDistribution: [],
  },
  snapshotMetrics: {
    snapshotsPerHour: [],
    snapshotsPerDay: [],
    storageUsage: 0,
    storageLimit: 0,
    ttlExpiringToday: 0,
    ttlExpiringThisWeek: 0,
  },
  alerts: [],
  timeRange: '24h',
  isLoading: false,
  lastUpdated: null,
  error: null,
};

export const fetchDashboardMetrics = createAsyncThunk(
  'adminDashboard/fetchMetrics',
  async (timeRange: TimeRange, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/admin/metrics?timeRange=${timeRange}`, {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch metrics');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const fetchActiveSessions = createAsyncThunk(
  'adminDashboard/fetchActiveSessions',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/admin/sessions/active', {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch active sessions');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const fetchReconnectionMetrics = createAsyncThunk(
  'adminDashboard/fetchReconnectionMetrics',
  async (timeRange: TimeRange, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/admin/metrics/reconnections?timeRange=${timeRange}`, {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch reconnection metrics');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const fetchSnapshotMetrics = createAsyncThunk(
  'adminDashboard/fetchSnapshotMetrics',
  async (timeRange: TimeRange, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/admin/metrics/snapshots?timeRange=${timeRange}`, {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch snapshot metrics');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const fetchAlerts = createAsyncThunk(
  'adminDashboard/fetchAlerts',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/admin/alerts', {
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to fetch alerts');
      }

      return await response.json();
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const resolveAlert = createAsyncThunk(
  'adminDashboard/resolveAlert',
  async (alertId: string, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch(`/api/admin/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.auth.token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to resolve alert');
      }

      return alertId;
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

export const exportData = createAsyncThunk(
  'adminDashboard/exportData',
  async (exportConfig: ExportData, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: { token: string } };
      const response = await fetch('/api/admin/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.auth.token}`,
        },
        body: JSON.stringify(exportConfig),
      });

      if (!response.ok) {
        const error = await response.json();
        return rejectWithValue(error.message || 'Failed to export data');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `syncbridge-export-${exportConfig.timeRange}.${exportConfig.format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return true;
    } catch (error) {
      return rejectWithValue('Network error');
    }
  }
);

const adminDashboardSlice = createSlice({
  name: 'adminDashboard',
  initialState,
  reducers: {
    setTimeRange: (state, action: PayloadAction<TimeRange>) => {
      state.timeRange = action.payload;
    },
    updateActiveSessions: (state, action: PayloadAction<Partial<ActiveSessionMetrics>>) => {
      state.activeSessions = { ...state.activeSessions, ...action.payload };
    },
    updateReconnectionMetrics: (state, action: PayloadAction<Partial<ReconnectionMetrics>>) => {
      state.reconnectionMetrics = { ...state.reconnectionMetrics, ...action.payload };
    },
    updateSnapshotMetrics: (state, action: PayloadAction<Partial<SnapshotMetrics>>) => {
      state.snapshotMetrics = { ...state.snapshotMetrics, ...action.payload };
    },
    addAlert: (state, action: PayloadAction<Alert>) => {
      state.alerts.unshift(action.payload);
      if (state.alerts.length > 100) {
        state.alerts.pop();
      }
    },
    removeAlert: (state, action: PayloadAction<string>) => {
      state.alerts = state.alerts.filter((alert) => alert.id !== action.payload);
    },
    clearDashboardError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboardMetrics.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDashboardMetrics.fulfilled, (state, action) => {
        state.isLoading = false;
        state.activeSessions = action.payload.activeSessions;
        state.reconnectionMetrics = action.payload.reconnectionMetrics;
        state.snapshotMetrics = action.payload.snapshotMetrics;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchDashboardMetrics.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchActiveSessions.fulfilled, (state, action) => {
        state.activeSessions = action.payload;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchReconnectionMetrics.fulfilled, (state, action) => {
        state.reconnectionMetrics = action.payload;
      })
      .addCase(fetchSnapshotMetrics.fulfilled, (state, action) => {
        state.snapshotMetrics = action.payload;
      })
      .addCase(fetchAlerts.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.alerts = action.payload;
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(resolveAlert.fulfilled, (state, action) => {
        const alert = state.alerts.find((a) => a.id === action.payload);
        if (alert) {
          alert.resolved = true;
        }
      });
  },
});

export const {
  setTimeRange,
  updateActiveSessions,
  updateReconnectionMetrics,
  updateSnapshotMetrics,
  addAlert,
  removeAlert,
  clearDashboardError,
} = adminDashboardSlice.actions;

export default adminDashboardSlice.reducer;
