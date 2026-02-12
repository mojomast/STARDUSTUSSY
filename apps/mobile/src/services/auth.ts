import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  AuthCredentials,
  RegistrationData,
} from '@types/index';
import {API_BASE_URL, STORAGE_KEYS} from '@constants/index';

interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, any>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.code || 'UNKNOWN_ERROR',
      error.message || 'An unexpected error occurred',
      error.details,
    );
  }
  return response.json();
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.authToken);
  return {
    'Content-Type': 'application/json',
    ...(token && {Authorization: `Bearer ${token}`}),
  };
};

export const login = async (credentials: AuthCredentials): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  const data = await handleResponse<AuthResponse>(response);
  await AsyncStorage.setItem(STORAGE_KEYS.authToken, data.token);
  await AsyncStorage.setItem(STORAGE_KEYS.refreshToken, data.refreshToken);
  await AsyncStorage.setItem(STORAGE_KEYS.userData, JSON.stringify(data.user));
  return data;
};

export const register = async (data: RegistrationData): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const result = await handleResponse<AuthResponse>(response);
  await AsyncStorage.setItem(STORAGE_KEYS.authToken, result.token);
  await AsyncStorage.setItem(STORAGE_KEYS.refreshToken, result.refreshToken);
  await AsyncStorage.setItem(STORAGE_KEYS.userData, JSON.stringify(result.user));
  return result;
};

export const logout = async (): Promise<void> => {
  const headers = await getAuthHeaders();
  
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers,
    });
  } finally {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.authToken,
      STORAGE_KEYS.refreshToken,
      STORAGE_KEYS.userData,
      STORAGE_KEYS.sessionData,
    ]);
  }
};

export const checkAuth = async (): Promise<AuthResponse> => {
  const token = await AsyncStorage.getItem(STORAGE_KEYS.authToken);
  const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.refreshToken);
  const userData = await AsyncStorage.getItem(STORAGE_KEYS.userData);

  if (!token || !userData) {
    throw new ApiError('NOT_AUTHENTICATED', 'Not authenticated');
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 && refreshToken) {
        return await refreshAccessToken(refreshToken);
      }
      throw new ApiError('SESSION_EXPIRED', 'Session expired');
    }

    const data = await response.json();
    return {
      user: JSON.parse(userData),
      token,
      refreshToken: refreshToken || '',
      ...data,
    };
  } catch (error) {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.authToken,
      STORAGE_KEYS.refreshToken,
      STORAGE_KEYS.userData,
    ]);
    throw error;
  }
};

export const refreshAccessToken = async (
  refreshToken: string,
): Promise<AuthResponse> => {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({refreshToken}),
  });

  const data = await handleResponse<AuthResponse>(response);
  await AsyncStorage.setItem(STORAGE_KEYS.authToken, data.token);
  await AsyncStorage.setItem(STORAGE_KEYS.refreshToken, data.refreshToken);
  return data;
};

export const forgotPassword = async (email: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({email}),
  });

  await handleResponse<void>(response);
};
