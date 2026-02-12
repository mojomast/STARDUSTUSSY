import {createSlice, createAsyncThunk, PayloadAction} from '@reduxjs/toolkit';
import {Device} from '@types/index';
import * as deviceService from '@services/device';

interface DeviceState {
  devices: Device[];
  currentDevice: Device | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: DeviceState = {
  devices: [],
  currentDevice: null,
  isLoading: false,
  error: null,
};

export const fetchDevices = createAsyncThunk(
  'device/fetchAll',
  async (_, {rejectWithValue}) => {
    try {
      const devices = await deviceService.getDevices();
      return devices;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

export const registerDevice = createAsyncThunk(
  'device/register',
  async (_, {rejectWithValue}) => {
    try {
      const device = await deviceService.registerDevice();
      return device;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

const deviceSlice = createSlice({
  name: 'device',
  initialState,
  reducers: {
    setCurrentDevice: (state, action: PayloadAction<Device>) => {
      state.currentDevice = action.payload;
    },
    updateDeviceStatus: (
      state,
      action: PayloadAction<{deviceId: string; isActive: boolean}>,
    ) => {
      const device = state.devices.find(d => d.id === action.payload.deviceId);
      if (device) {
        device.isActive = action.payload.isActive;
        device.lastSeen = new Date();
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchDevices.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDevices.fulfilled, (state, action) => {
        state.isLoading = false;
        state.devices = action.payload;
      })
      .addCase(fetchDevices.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(registerDevice.fulfilled, (state, action) => {
        state.currentDevice = action.payload;
        state.devices.push(action.payload);
      });
  },
});

export const {setCurrentDevice, updateDeviceStatus} = deviceSlice.actions;
export default deviceSlice.reducer;
