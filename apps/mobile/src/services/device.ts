import {Device} from '@types/index';
import {API_BASE_URL} from '@constants/index';
import {getAuthHeaders} from './api';
import DeviceInfo from 'react-native-device-info';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '@constants/index';

export const getDevices = async (): Promise<Device[]> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/devices`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch devices');
  }

  return response.json();
};

export const registerDevice = async (): Promise<Device> => {
  const deviceId = await AsyncStorage.getItem(STORAGE_KEYS.deviceId);
  const deviceName = await DeviceInfo.getDeviceName();
  const systemVersion = await DeviceInfo.getSystemVersion();

  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/devices/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: deviceId,
      name: deviceName,
      type: Platform.select({ios: 'mobile', android: 'mobile', default: 'mobile'}),
      platform: Platform.OS,
      version: systemVersion,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to register device');
  }

  const device = await response.json();
  await AsyncStorage.setItem(STORAGE_KEYS.deviceId, device.id);
  return device;
};

export const unregisterDevice = async (deviceId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/devices/${deviceId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to unregister device');
  }
};

export const updateDeviceStatus = async (
  deviceId: string,
  isActive: boolean,
): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/devices/${deviceId}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({isActive}),
  });

  if (!response.ok) {
    throw new Error('Failed to update device status');
  }
};
