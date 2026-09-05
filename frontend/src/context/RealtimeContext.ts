/**
 * Shared realtime React context object and consumer hooks.
 *
 * Transport-agnostic: both LegacyRealtimeProvider and
 * SupabaseRealtimeProvider publish the same WebSocketContextValue shape
 * here, so pages and components never know which transport is active.
 */
import * as React from "react";
import type { ConnectionStatus, WebSocketContextValue, WSMessage } from "./realtimeTypes";

export const WebSocketContext =
  React.createContext<WebSocketContextValue | null>(null);

/**
 * Hook to access the shared WebSocket connection
 * Must be used within a WebSocketProvider
 */
export function useWebSocketContext(): WebSocketContextValue {
  const context = React.useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within a WebSocketProvider");
  }
  return context;
}

/**
 * Hook to access just the connection status (for simple status indicators)
 */
export function useConnectionStatus(): ConnectionStatus {
  const { status } = useWebSocketContext();
  return status;
}

/**
 * Hook to access connection status with initialized check
 * Returns "disconnected" if not initialized (no API key)
 */
export function useConnectionStatusWithInit(): ConnectionStatus {
  const { status, isInitialized } = useWebSocketContext();
  if (!isInitialized) return "disconnected";
  return status;
}

/**
 * Hook to subscribe to specific WebSocket message types
 */
export function useWebSocketMessage(
  types: WSMessage["type"] | WSMessage["type"][],
  handler: (message: WSMessage) => void
) {
  const { on } = useWebSocketContext();
  React.useEffect(() => {
    return on(types, handler);
  }, [on, types, handler]);
}
