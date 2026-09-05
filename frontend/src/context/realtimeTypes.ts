/**
 * Shared realtime protocol types and context contract.
 *
 * Transport-agnostic: implemented by LegacyRealtimeProvider (raw WebSocket,
 * local dev) and SupabaseRealtimeProvider (Supabase Realtime, production).
 * Re-exported from ./WebSocketContext so existing imports keep working.
 */

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
  status: "new" | "processing" | "correlated" | "dismissed";
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
  status: "open" | "investigating" | "contained" | "resolved" | "closed";
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
  session_id: string | null;
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

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export type WSMessageHandler = (message: WSMessage) => void;

export interface UseWebSocketOptions {
  /** API key for authentication */
  apiKey?: string;
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

export interface WebSocketContextValue {
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
  /** Configure the WebSocket connection (call once on app init) */
  configure: (options: UseWebSocketOptions) => void;
  /** Get current configuration */
  getConfig: () => UseWebSocketOptions | null;
  /** Explicitly connect with current config (for manual reconnect) */
  connect: () => void;
}