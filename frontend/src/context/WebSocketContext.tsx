"use client";

import * as React from "react";
import type { WSMessage, WSClientMessage, ConnectedData, AlertPayload, IncidentPayload, EventPayload, WSErrorData } from "@/hooks/useWebSocket";
import { API_KEY as BUILD_TIME_API_KEY } from "@/api/client";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

type WSMessageHandler = (message: WSMessage) => void;

interface WebSocketContextValue {
  /** Current connection status */
  status: ConnectionStatus;
  /** Current session ID for reconnection */
  sessionId: string | null;
  /** Last event ID received */
  lastEventId: number;
  /** Whether the WebSocket is initialized with an API key */
  isInitialized: boolean;
  /** Subscribe to event types */
  subscribe: (types: ("alerts" | "incidents" | "events")[]) => void;
  /** Unsubscribe from event types */
  unsubscribe: (types: ("alerts" | "incidents" | "events")[]) => void;
  /** Manually trigger reconnection */
  reconnect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Send raw message */
  send: (message: WSClientMessage) => void;
  /** Whether there's an active connection */
  isConnected: boolean;
  /** Register a callback for specific message types */
  on: (types: WSMessage["type"] | WSMessage["type"][], handler: WSMessageHandler) => () => void;
}

const WebSocketContext = React.createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
  /** Optional: override default subscriptions */
  subscriptions?: ("alerts" | "incidents" | "events")[];
}

/**
 * WebSocketProvider - Provides a single shared WebSocket connection across the app
 * Uses an event emitter pattern to broadcast messages to all subscribers
 */
export function WebSocketProvider({
  children,
  subscriptions = ["alerts", "incidents", "events"],
}: WebSocketProviderProps) {
  const [status, setStatus] = React.useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [lastEventId, setLastEventId] = React.useState(0);
  const [isInitialized, setIsInitialized] = React.useState(false);

  // Event emitter for message handlers
  const handlersRef = React.useRef<Map<string, Set<WSMessageHandler>>>(new Map());
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const messageQueueRef = React.useRef<Array<{ message: WSClientMessage; resolve: () => void }>>([]);
  const reconnectAttemptsRef = React.useRef(0);
  const isIntentionalDisconnectRef = React.useRef(false);
  const isMountedRef = React.useRef(true);
  const currentSubscriptionsRef = React.useRef<Set<string>>(new Set(subscriptions));

  // Get API key from localStorage, fallback to build-time VITE_API_KEY
  // Use state to make it reactive to localStorage changes
  const [apiKey, setApiKey] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("hawkeye_api_key") || BUILD_TIME_API_KEY || null;
  });

  // Listen for localStorage changes to update apiKey
  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "hawkeye_api_key") {
        setApiKey(event.newValue || BUILD_TIME_API_KEY || null);
      }
    };

    // Also listen for same-tab changes (storage event doesn't fire in same tab)
    const handleLocalStorageChange = () => {
      const newKey = localStorage.getItem("hawkeye_api_key") || BUILD_TIME_API_KEY || null;
      setApiKey(newKey);
    };

    window.addEventListener("storage", handleStorageChange);
    // Poll for same-tab changes as a fallback
    const interval = setInterval(handleLocalStorageChange, 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Build WebSocket URL - use relative path so Vite dev proxy works in development
  const getWsUrl = React.useCallback(() => {
    const subscribeParam = Array.from(currentSubscriptionsRef.current).join(",");
    // Include API key as query parameter for authentication
    const apiKeyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
    return `/ws?subscribe=${encodeURIComponent(subscribeParam)}${apiKeyParam}`;
  }, [apiKey]);

  // Clear reconnect timeout
  const clearReconnectTimeout = React.useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Clear heartbeat interval
  const clearHeartbeat = React.useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Start heartbeat
  const startHeartbeat = React.useCallback(() => {
    clearHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  }, [clearHeartbeat]);

  // Process queued messages
  const processMessageQueue = React.useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (messageQueueRef.current.length > 0) {
      const { message, resolve } = messageQueueRef.current.shift()!;
      ws.send(JSON.stringify(message));
      resolve();
    }
  }, []);

  // Send message (queues if not connected)
  const send = React.useCallback((message: WSClientMessage) => {
    return new Promise<void>((resolve) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        resolve();
      } else {
        messageQueueRef.current.push({ message, resolve });
      }
    });
  }, []);

  // Update status
  const updateStatus = React.useCallback((newStatus: ConnectionStatus) => {
    if (!isMountedRef.current) return;
    setStatus(newStatus);
  }, []);

  // Handle incoming messages
  const handleMessage = React.useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data);

      // Handle server ping - respond with pong
      if (message.type === "ping") {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "pong" }));
        }
        return;
      }

      // Update session/lastEventId for reconnection
      if (message.type === "connected") {
        const data = message.data as ConnectedData;
        setSessionId(data.session_id || null);
        setLastEventId(0);
        updateStatus("connected");
        startHeartbeat();
        processMessageQueue();
      } else if (message.type === "alert" || message.type === "incident" || message.type === "event") {
        setLastEventId(message.event_id || 0);
      } else if (message.type === "error") {
        const errorData = message.data as WSErrorData;
        console.error("WebSocket error:", errorData);
        if (errorData.code === "SESSION_EXPIRED" || errorData.code === "INVALID_RECONNECT") {
          setSessionId(null);
          setLastEventId(0);
        }
      }

      // Broadcast to all handlers for this message type
      const typeHandlers = handlersRef.current.get(message.type);
      if (typeHandlers) {
        typeHandlers.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            console.error("Error in WebSocket message handler:", error);
          }
        });
      }

      // Also broadcast to wildcard handlers
      const wildcardHandlers = handlersRef.current.get("*");
      if (wildcardHandlers) {
        wildcardHandlers.forEach((handler) => {
          try {
            handler(message);
          } catch (error) {
            console.error("Error in WebSocket wildcard handler:", error);
          }
        });
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  }, [updateStatus, startHeartbeat, processMessageQueue]);

  // Register a callback for message types
  const on = React.useCallback((types: WSMessage["type"] | WSMessage["type"][], handler: WSMessageHandler) => {
    const typeArray = Array.isArray(types) ? types : [types];

    typeArray.forEach((type) => {
      if (!handlersRef.current.has(type)) {
        handlersRef.current.set(type, new Set());
      }
      handlersRef.current.get(type)!.add(handler);
    });

    // Return unsubscribe function
    return () => {
      typeArray.forEach((type) => {
        handlersRef.current.get(type)?.delete(handler);
      });
    };
  }, []);

  // Connect to WebSocket
  const connect = React.useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }
    if (!apiKey) {
      console.debug("No API key, skipping WebSocket connection");
      return;
    }

    isIntentionalDisconnectRef.current = false;
    updateStatus("connecting");

    try {
      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.debug("WebSocket connection opened");
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.debug("WebSocket closed:", event.code, event.reason);
        clearHeartbeat();
        clearReconnectTimeout();

        if (isMountedRef.current) {
          updateStatus("disconnected");

          // Attempt reconnection if not intentional and auto-reconnect is enabled
          if (!isIntentionalDisconnectRef.current) {
            const shouldReconnect = reconnectAttemptsRef.current < 10; // Max 10 attempts

            if (shouldReconnect) {
              updateStatus("reconnecting");
              reconnectAttemptsRef.current += 1;

              // Exponential backoff with jitter
              const delay = Math.min(
                1000 * Math.pow(2, reconnectAttemptsRef.current - 1) + Math.random() * 1000,
                30000
              );

              console.debug(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

              reconnectTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current && !isIntentionalDisconnectRef.current) {
                  if (sessionId && lastEventId > 0) {
                    connect();
                    setTimeout(() => {
                      send({
                        type: "reconnect",
                        data: { session_id: sessionId, last_event_id: lastEventId },
                      });
                    }, 100);
                  } else {
                    connect();
                  }
                }
              }, delay);
            } else {
              updateStatus("error");
            }
          }
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (isMountedRef.current) {
          updateStatus("error");
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      if (isMountedRef.current) {
        updateStatus("error");
      }
    }
  }, [
    apiKey,
    getWsUrl,
    handleMessage,
    updateStatus,
    startHeartbeat,
    clearHeartbeat,
    clearReconnectTimeout,
    sessionId,
    lastEventId,
    send,
  ]);

  // Disconnect
  const disconnect = React.useCallback(() => {
    isIntentionalDisconnectRef.current = true;
    clearReconnectTimeout();
    clearHeartbeat();

    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close(1000, "Intentional disconnect");
      wsRef.current = null;
    }

    if (isMountedRef.current) {
      updateStatus("disconnected");
    }
  }, [clearReconnectTimeout, clearHeartbeat, updateStatus]);

  // Reconnect manually
  const reconnect = React.useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    setTimeout(() => {
      if (isMountedRef.current) {
        connect();
      }
    }, 100);
  }, [disconnect, connect]);

  // Subscribe to event types
  const subscribe = React.useCallback((types: ("alerts" | "incidents" | "events")[]) => {
    const validTypes = new Set(["alerts", "incidents", "events"]);
    types.filter((t) => validTypes.has(t)).forEach((t) => currentSubscriptionsRef.current.add(t));
    send({ type: "subscribe", data: { types: Array.from(currentSubscriptionsRef.current) } });
  }, [send]);

  // Unsubscribe from event types
  const unsubscribe = React.useCallback((types: ("alerts" | "incidents" | "events")[]) => {
    const validTypes = new Set(["alerts", "incidents", "events"]);
    types.filter((t) => validTypes.has(t)).forEach((t) => currentSubscriptionsRef.current.delete(t));
    send({ type: "unsubscribe", data: { types: Array.from(currentSubscriptionsRef.current) } });
  }, [send]);

  // Initialize connection on mount and when apiKey changes
  React.useEffect(() => {
    isMountedRef.current = true;
    setIsInitialized(!!apiKey);

    if (apiKey) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [apiKey, connect, disconnect]);

  // Reconnect when apiKey changes from null to value
  React.useEffect(() => {
    if (apiKey && status === "disconnected" && !isIntentionalDisconnectRef.current) {
      connect();
    }
  }, [apiKey, status, connect]);

  const value: WebSocketContextValue = {
    status,
    sessionId,
    lastEventId,
    isInitialized,
    subscribe,
    unsubscribe,
    reconnect,
    disconnect,
    send,
    isConnected: status === "connected",
    on,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

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