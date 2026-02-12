import { useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store';
import { setConnectionStatus, updateSessionState, addDevice, removeDevice } from '../store/slices/sessionSlice';
import type { WebSocketMessage, AppState } from '../types/index.ts';
import type { Device } from '../types/index.ts';

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 5;

export function useWebSocket() {
  const dispatch = useDispatch<AppDispatch>();
  const { token } = useSelector((state: RootState) => state.auth);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'state_update':
        dispatch(updateSessionState(message.payload as AppState));
        break;
      case 'device_connected':
        dispatch(addDevice(message.payload as Device));
        break;
      case 'device_disconnected':
        dispatch(removeDevice((message.payload as { deviceId: string }).deviceId));
        break;
      case 'error':
        console.error('Server error:', message.payload);
        break;
    }
  }, [dispatch]);

  const connect = useCallback(() => {
    if (!token || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    dispatch(setConnectionStatus({ connecting: true, error: null }));

    const wsUrl = `${import.meta.env.VITE_WS_URL || 'ws://localhost:8081'}/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      dispatch(setConnectionStatus({ connected: true, connecting: false, error: null }));
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      dispatch(setConnectionStatus({ connected: false, connecting: false }));
      wsRef.current = null;

      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = RECONNECT_DELAY * reconnectAttemptsRef.current;
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      dispatch(setConnectionStatus({ error: 'Connection error' }));
    };

    wsRef.current = ws;
  }, [token, dispatch, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((type: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const updateState = useCallback((state: AppState) => {
    sendMessage('state_update', state);
  }, [sendMessage]);

  useEffect(() => {
    if (token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  return {
    connect,
    disconnect,
    sendMessage,
    updateState,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
