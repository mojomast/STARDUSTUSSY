import {HandoffRequest} from '@types/index';
import {API_BASE_URL} from '@constants/index';
import {getAuthHeaders} from './api';

export const initiateHandoff = async (
  targetDeviceId: string,
  sessionId: string,
): Promise<HandoffRequest> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/handoff/initiate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      targetDeviceId,
      sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to initiate handoff');
  }

  return response.json();
};

export const acceptHandoff = async (handoffId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/handoff/${handoffId}/accept`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to accept handoff');
  }
};

export const rejectHandoff = async (handoffId: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/handoff/${handoffId}/reject`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to reject handoff');
  }
};

export const getPendingHandoffs = async (): Promise<HandoffRequest[]> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/handoff/pending`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch pending handoffs');
  }

  return response.json();
};

export const validateQRCode = async (qrCode: string): Promise<HandoffRequest> => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}/handoff/validate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({qrCode}),
  });

  if (!response.ok) {
    throw new Error('Invalid QR code');
  }

  return response.json();
};
