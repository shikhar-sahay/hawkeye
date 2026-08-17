"use client";

import * as React from "react";

/**
 * WebSocket message types matching the backend protocol
 */
export type WSMessageType =
  | "alert"
  | "incident"
  | "event"
  | "ping"
  | "pong"
  | "connected"
  | "error"
  | "subscribed"
  | "unsubscribed";

/**
 * Base message structure
 */
export interface WSMessage {
  type: WSMessageType;
  timestamp: string;
  event_id?: number;
  data?: unknown;
  connection_id?: string;
  source_id?: number;
  source_name?: string;
  subscriptions?: string[];
  session_id?: string;
}

/**
 * Client -> Server message
 */
export interface WSClientMessage {
  type: "pong" | "subscribe" | "unsubscribe" | "ping" | "reconnect";
  data?: {
    types?: string[];
    session_id?: string;
    last_event_id?: number;
  };
}

/**
 * Alert payload from WebSocket
 */
export interface AlertPayload {
  id: number;
  source_id: number;
  detection_type: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  status: "open" | "acknowledged" | "resolved" | "suppressed";
  evidence: Record<string, unknown>;
  mitre_tactics: string[];
  mitre_techniques: string[];
  affected_entities: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Incident payload from WebSocket
 */
export interface IncidentPayload {
  id: number;
  source_id: number;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "open" | "investigating" | "resolved" | "closed";
  affected_ips: string[];
  affected_users: string[];
  mitre_tactics: string[];
  mitre_techniques: string[];
  alert_count: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/**
 * Event payload from WebSocket
 */
export interface EventPayload {
  id: number;
  source_id: number;
  category: string;
  event_type: string;
  severity: "critical" | "high" | "medium" | "low";
  timestamp: string;
  user_id: string | null;
  ip: string | null;
  route: string | null;
  method: string | null;
  status_code: number | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  mitre_tactic: string | null;
  mitre_technique: string | null;
  created_at: string;
}

/**
 * Connected confirmation message data
 */
export interface ConnectedData {
  connection_id: string;
  source_id: number;
  source_name: string;
  subscriptions: string[];
  session_id?: string;
}

/**
 * Error message data
 */
export interface WSErrorData {
  code: string;
  message: string;
}

/**
 * Connection status states
 */
export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * WebSocket configuration options
 */
export interface UseWebSocketOptions {
  /** API key for authentication */
  apiKey: string;
  /** WebSocket server URL (defaults to /ws on same origin) */
  url?: string;
  /** Event types to subscribe to */
  subscriptions?: ("alerts" | "incidents" | "events")[];
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts (0 = infinite) */
  maxReconnectAttempts?: number;
  /** Base delay for exponential backoff (ms) */
  reconnectBaseDelay?: number;
  /** Maximum delay for exponential backoff (ms) */
  reconnectMaxDelay?: number;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
  /** Callback when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Callback when an alert is received */
  onAlert?: (alert: AlertPayload, eventId: number) => void;
  /** Callback when an incident is received */
  onIncident?: (incident: IncidentPayload, eventId: number) => void;
  /** Callback when an event is received */
  onEvent?: (event: EventPayload, eventId: number) => void;
  /** Callback when connection error occurs */
  onError?: (error: Error) => void;
  /** Callback when connected */
  onConnect?: (data: ConnectedData) => void;
  /** Callback when disconnected */
  onDisconnect?: () => void;
}

/**
 * WebSocket hook return type
 */
export interface UseWebSocketReturn {
  /** Current connection status */
  status: ConnectionStatus;
  /** Current session ID for reconnection */
  sessionId: string | null;
  /** Last event ID received */
  lastEventId: number;
  /** Subscribe to event types */
  subscribe: (types: ("alerts" | "incidents")[]) => void;
  /** Unsubscribe from event types */
  unsubscribe: (types: ("alerts" | "incidents")[]) => void;
  /** Manually trigger reconnection */
  reconnect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Send raw message */
  send: (message: WSClientMessage) => void;
  /** Whether there's an active connection */
  isConnected: boolean;
}

/**
 * Custom hook for managing WebSocket connection with auto-reconnect,
 * heartbeat, session resume, and subscription management.
 *
 * @param options - Configuration options
 * @returns WebSocket control functions and state
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    apiKey,
    url,
    subscriptions = ["alerts", "incidents"],
    autoReconnect = true,
    maxReconnectAttempts = 0,
    reconnectBaseDelay = 1000,
    reconnectMaxDelay = 30000,
    heartbeatInterval = 30000,
    onStatusChange,
    onAlert,
    onIncident,
    onEvent,
    onError,
    onConnect,
    onDisconnect,
  } = options;

  // State
  const [status, setStatus] = React.useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [lastEventId, setLastEventId] = React.useState(0);
  const [currentSubscriptions, setCurrentSubscriptions] = React.useState<Set<string>>(
    new Set(subscriptions)
  );

  // Refs for mounted state, WebSocket, timeouts, and queues
  const isMountedRef = React.useRef(true);
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const messageQueueRef = React.useRef<Array<{ message: WSClientMessage; resolve: () => void }>>([]);
  const reconnectAttemptsRef = React.useRef(0);
  const isIntentionalDisconnectRef = React.useRef(false);

  // Refs for callback options to avoid dependency issues
  const onStatusChangeRef = React.useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onAlertRef = React.useRef(onAlert);
  onAlertRef.current = onAlert;
  const onIncidentRef = React.useRef(onIncident);
  onIncidentRef.current = onIncident;
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectRef = React.useRef(onConnect);
  onConnectRef.current = onConnect;
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const onDisconnectRef = React.useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  // Build WebSocket URL
  const getWsUrl = React.useCallback(() => {
    if (url) return url;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const subscribeParam = subscriptions.join(",");
    // Include API key as query parameter for authentication
    const apiKeyParam = apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : "";
    return `${protocol}//${host}/ws?subscribe=${encodeURIComponent(subscribeParam)}${apiKeyParam}`;
  }, [url, subscriptions, apiKey]);

  // Update status with callback
  const updateStatus = React.useCallback(
    (newStatus: ConnectionStatus) => {
      if (!isMountedRef.current) return;
      setStatus(newStatus);
      onStatusChangeRef.current?.(newStatus);
    },
    []
  );

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
    }, heartbeatInterval);
  }, [clearHeartbeat, heartbeatInterval]);

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

  // Valid subscription types
  const validTypes = React.useMemo(() => new Set(["alerts", "incidents", "events"]), []);

  // Subscribe to event types
  const subscribe = React.useCallback(
    (types: ("alerts" | "incidents" | "events")[]) => {
      const newSubs = new Set([...currentSubscriptions, ...types.filter((t) => validTypes.has(t))]);
      setCurrentSubscriptions(newSubs);
      send({ type: "subscribe", data: { types: Array.from(newSubs) } });
    },
    [currentSubscriptions, send, validTypes]
  );

  // Unsubscribe from event types
  const unsubscribe = React.useCallback(
    (types: ("alerts" | "incidents" | "events")[]) => {
      const newSubs = new Set(currentSubscriptions);
      types.filter((t) => validTypes.has(t)).forEach((t) => newSubs.delete(t));
      setCurrentSubscriptions(newSubs);
      send({ type: "unsubscribe", data: { types: Array.from(newSubs) } });
    },
    [currentSubscriptions, send, validTypes]
  );

  // Handle incoming messages
  const handleMessage = React.useCallback(
    (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        switch (message.type) {
          case "connected": {
            const data = message.data as ConnectedData;
            setSessionId(data.session_id || null);
            setLastEventId(0);
            updateStatus("connected");
            startHeartbeat();
            processMessageQueue();
            onConnectRef.current?.(data);
            break;
          }

          case "alert": {
            const alert = message.data as AlertPayload;
            const eventId = message.event_id || 0;
            setLastEventId(eventId);
            onAlertRef.current?.(alert, eventId);
            break;
          }

          case "incident": {
            const incident = message.data as IncidentPayload;
            const eventId = message.event_id || 0;
            setLastEventId(eventId);
            onIncidentRef.current?.(incident, eventId);
            break;
          }

          case "event": {
            const event = message.data as EventPayload;
            const eventId = message.event_id || 0;
            setLastEventId(eventId);
            onEventRef.current?.(event, eventId);
            break;
          }

          case "ping": {
            // Respond to server ping
            send({ type: "pong" });
            break;
          }

          case "pong": {
            // Server acknowledged our ping
            break;
          }

          case "error": {
            const errorData = message.data as WSErrorData;
            console.error("WebSocket error:", errorData);
            if (errorData.code === "SESSION_EXPIRED" || errorData.code === "INVALID_RECONNECT") {
              // Session expired, clear session and reconnect fresh
              setSessionId(null);
              setLastEventId(0);
            }
            break;
          }

          default: {
            console.debug("Unknown WebSocket message type:", message.type);
          }
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    },
    [send, startHeartbeat, processMessageQueue, updateStatus]
  );

  // Connect to WebSocket
  const connect = React.useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    isIntentionalDisconnectRef.current = false;
    updateStatus("connecting");

    try {
      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl);

      // Set up authentication via headers (WebSocket API doesn't support custom headers directly)
      // We'll use the query param approach as fallback, but the backend supports Bearer auth
      // Note: For headers, we'd need to use a different approach (see below)

      ws.onopen = () => {
        // Connection opened, wait for "connected" message from server
        console.debug("WebSocket connection opened");
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        console.debug("WebSocket closed:", event.code, event.reason);
        clearHeartbeat();
        clearReconnectTimeout();

        if (isMountedRef.current) {
          updateStatus("disconnected");
          onDisconnectRef.current?.();

          // Attempt reconnection if not intentional and auto-reconnect is enabled
          if (!isIntentionalDisconnectRef.current && autoReconnect) {
            const shouldReconnect =
              maxReconnectAttempts === 0 || reconnectAttemptsRef.current < maxReconnectAttempts;

            if (shouldReconnect) {
              updateStatus("reconnecting");
              reconnectAttemptsRef.current += 1;

              // Exponential backoff with jitter
              const delay = Math.min(
                reconnectBaseDelay * Math.pow(2, reconnectAttemptsRef.current - 1) +
                  Math.random() * 1000,
                reconnectMaxDelay
              );

              console.debug(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

              reconnectTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current && !isIntentionalDisconnectRef.current) {
                  // Try to resume session if we have one
                  if (sessionId && lastEventId > 0) {
                    // Create new connection and send reconnect message
                    connect();
                    // The reconnect message will be sent once connected via the queue
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
              onError?.(new Error("Max reconnection attempts reached"));
            }
          }
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (isMountedRef.current) {
          updateStatus("error");
          onErrorRef.current?.(new Error("WebSocket connection error"));
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      if (isMountedRef.current) {
        updateStatus("error");
        onErrorRef.current?.(error as Error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    getWsUrl,
    handleMessage,
    updateStatus,
    startHeartbeat,
    clearHeartbeat,
    clearReconnectTimeout,
    autoReconnect,
    maxReconnectAttempts,
    reconnectBaseDelay,
    reconnectMaxDelay,
    sessionId,
    lastEventId,
    send,
    onErrorRef,
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
      onDisconnectRef.current?.();
    }
  }, [clearReconnectTimeout, clearHeartbeat, updateStatus]);

  // Reconnect manually
  const reconnect = React.useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    // Small delay to ensure clean disconnect
    setTimeout(() => {
      if (isMountedRef.current) {
        connect();
      }
    }, 100);
  }, [disconnect, connect]);

  // Initialize connection on mount
  React.useEffect(() => {
    isMountedRef.current = true;

    if (apiKey) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [apiKey, connect, disconnect]);

  // Reconnect when apiKey changes
  React.useEffect(() => {
    if (apiKey && status === "disconnected" && !isIntentionalDisconnectRef.current) {
      connect();
    }
  }, [apiKey, status, connect]);

  return {
    status,
    sessionId,
    lastEventId,
    subscribe,
    unsubscribe,
    reconnect,
    disconnect,
    send,
    isConnected: status === "connected",
  };
}