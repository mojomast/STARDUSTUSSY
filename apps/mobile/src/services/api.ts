import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS, API_BASE_URL} from '@constants/index';

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.authToken);
  return {
    'Content-Type': 'application/json',
    ...(token && {Authorization: `Bearer ${token}`}),
  };
};

export const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An unexpected error occurred',
    }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

export const apiPost = <T>(endpoint: string, data: any): Promise<T> =>
  apiRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const apiGet = <T>(endpoint: string): Promise<T> =>
  apiRequest<T>(endpoint, {
    method: 'GET',
  });

export const apiPatch = <T>(endpoint: string, data: any): Promise<T> =>
  apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const apiDelete = <T>(endpoint: string): Promise<T> =>
  apiRequest<T>(endpoint, {
    method: 'DELETE',
  });
