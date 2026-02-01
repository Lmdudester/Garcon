import * as React from 'react';
import type {
  WebSocketOutgoingMessage,
  WebSocketServerStatusMessage,
  WebSocketServerUpdateMessage
} from '@garcon/shared';
import { config } from '@/lib/config';

interface WebSocketContextValue {
  isConnected: boolean;
  subscribe: (serverId?: string) => void;
  unsubscribe: (serverId?: string) => void;
  onServerStatus: (callback: (message: WebSocketServerStatusMessage) => void) => () => void;
  onServerUpdate: (callback: (message: WebSocketServerUpdateMessage) => void) => () => void;
}

const WebSocketContext = React.createContext<WebSocketContextValue | undefined>(undefined);

const WS_URL = config.wsUrl || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
const RECONNECT_DELAY = 3000;
const PING_INTERVAL = 30000;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>();
  const pingIntervalRef = React.useRef<ReturnType<typeof setInterval>>();

  const statusCallbacksRef = React.useRef<Set<(message: WebSocketServerStatusMessage) => void>>(new Set());
  const updateCallbacksRef = React.useRef<Set<(message: WebSocketServerUpdateMessage) => void>>(new Set());

  const connect = React.useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Clear handlers from any existing socket
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
    }

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (ws !== wsRef.current) return;
      setIsConnected(true);
      ws.send(JSON.stringify({ type: 'subscribe' }));

      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL);
    };

    ws.onclose = () => {
      if (ws !== wsRef.current) return;
      setIsConnected(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      if (ws !== wsRef.current) return;
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketOutgoingMessage;

        switch (message.type) {
          case 'server_status':
            statusCallbacksRef.current.forEach(cb => cb(message));
            break;
          case 'server_update':
            updateCallbacksRef.current.forEach(cb => cb(message));
            break;
          case 'pong':
            break;
          case 'error':
            console.error('WebSocket error:', message.message);
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    wsRef.current = ws;
  }, []);

  React.useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = React.useCallback((serverId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        serverId
      }));
    }
  }, []);

  const unsubscribe = React.useCallback((serverId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        serverId
      }));
    }
  }, []);

  const onServerStatus = React.useCallback((callback: (message: WebSocketServerStatusMessage) => void) => {
    statusCallbacksRef.current.add(callback);
    return () => {
      statusCallbacksRef.current.delete(callback);
    };
  }, []);

  const onServerUpdate = React.useCallback((callback: (message: WebSocketServerUpdateMessage) => void) => {
    updateCallbacksRef.current.add(callback);
    return () => {
      updateCallbacksRef.current.delete(callback);
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{
        isConnected,
        subscribe,
        unsubscribe,
        onServerStatus,
        onServerUpdate
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = React.useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
