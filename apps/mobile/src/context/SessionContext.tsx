import React, {createContext, useContext, useEffect, useCallback} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {AppDispatch, RootState} from '@store/index';
import {
  StateManager,
  WebSocketClient,
} from '@harmonyflow/client-state-manager';
import {WS_BASE_URL} from '@constants/index';
import {setCurrentSession} from '@store/slices/sessionSlice';
import {Session} from '@types/index';

interface SessionContextType {
  stateManager: StateManager | null;
  wsClient: WebSocketClient | null;
  isConnected: boolean;
  connect: (sessionId: string) => Promise<void>;
  disconnect: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const token = useSelector((state: RootState) => state.auth.token);
  const [stateManager, setStateManager] = React.useState<StateManager | null>(
    null,
  );
  const [wsClient, setWsClient] = React.useState<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);

  const connect = useCallback(
    async (sessionId: string) => {
      if (!token) return;

      try {
        // Initialize WebSocket client
        const ws = new WebSocketClient({
          url: `${WS_BASE_URL}/sessions/${sessionId}`,
          token,
        });

        // Initialize State Manager
        const manager = new StateManager({
          sessionId,
          wsClient: ws,
        });

        // Set up event handlers
        ws.on('connected', () => {
          setIsConnected(true);
          console.log('[Session] WebSocket connected');
        });

        ws.on('disconnected', () => {
          setIsConnected(false);
          console.log('[Session] WebSocket disconnected');
        });

        ws.on('error', (error) => {
          console.error('[Session] WebSocket error:', error);
        });

        // Connect
        await ws.connect();

        setWsClient(ws);
        setStateManager(manager);
      } catch (error) {
        console.error('[Session] Connection error:', error);
      }
    },
    [token],
  );

  const disconnect = useCallback(() => {
    if (wsClient) {
      wsClient.disconnect();
      setWsClient(null);
    }
    if (stateManager) {
      setStateManager(null);
    }
    setIsConnected(false);
  }, [wsClient, stateManager]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <SessionContext.Provider
      value={{stateManager, wsClient, isConnected, connect, disconnect}}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};
