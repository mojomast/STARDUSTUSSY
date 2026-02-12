import {Session} from '@types/index';
import {API_BASE_URL} from '@constants/index';
import {getAuthHeaders} from './api';

export const getSessions = async (): Promise<Session[]> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch sessions');
  }

  return response.json();
};

export const getSession = async (sessionId: string): Promise<Session> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch session');
  }

  return response.json();
};

export const createSession = async (): Promise<Session> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to create session');
  }

  return response.json();
};

export const terminateSession = async (sessionId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to terminate session');
  }
};

export const suspendSession = async (sessionId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/suspend`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to suspend session');
  }
};

export const resumeSession = async (sessionId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to resume session');
  }
};

export const acceptHandoff = async (sessionId: string): Promise<Session> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/handoff/accept`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to accept handoff');
  }

  return response.json();
};

export const rejectHandoff = async (sessionId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/handoff/reject`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to reject handoff');
  }
};
