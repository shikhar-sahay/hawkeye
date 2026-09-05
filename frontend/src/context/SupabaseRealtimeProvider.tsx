"use client";

/**
 * SupabaseRealtimeProvider - production realtime transport.
 *
 * Replaces the raw WebSocket with Supabase Realtime postgres_changes while
 * publishing the IDENTICAL WebSocketContextValue shape, so pages, alerts,
 * incidents, search, toasts, and status indicators work unchanged:
 * - normalized_events INSERT/UPDATE -> { type: "event", ... }
 * - alerts INSERT/UPDATE            -> { type: "alert", ... }
 * - incidents INSERT/UPDATE         -> { type: "incident", ... }
 *
 * Source isolation is enforced server-side by RLS (policies compare the
 * row's source_id to the JWT's source_id claim); the client additionally
 * filters its channel bindings per source as belt and braces.
 *
 * Auth: on API-key availability, POST /api/v1/realtime-token mints a
 * short-lived JWT (source_id derived server-side). The token is refreshed
 * before expiry; the channel is re-subscribed so the new token applies.
 * A 401 from the token endpoint behaves like the legacy 1008 path: surface
 * an error and stop retrying until the user signs in again.
 *
 * Reconnect semantics differ from the legacy transport by design: instead
 * of an in-memory replay window, consistency comes from the existing REST
 * refetch that every page already performs on each received message, plus
 * TanStack stale-time refetching. sessionId is therefore null and
 * lastEventId tracks the highest row id observed (display only).
 */
import * as React from "react";
import type {
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";
import { API_KEY_STORAGE, getStoredApiKey } from "@/auth";
import { ApiError, apiClient } from "@/api/client";
import { WebSocketContext } from "./RealtimeContext";
import type {
  AlertPayload,
  ConnectedData,
  ConnectionStatus,
  EventPayload,
  IncidentPayload,
  UseWebSocketOptions,
  WebSocketContextValue,
  WSClientMessage,
  WSMessage,
  WSMessageHandler,
} from "./realtimeTypes";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Supabase tables backing each subscription bucket. */
const TABLE_FOR_SUBSCRIPTION = {
  alerts: "alerts",
  incidents: "incidents",
  events: "normalized_events",
} as const;

type SubscriptionName = keyof typeof TABLE_FOR_SUBSCRIPTION;

/** Wire message type per table (matches the legacy backend protocol). */
const WIRE_TYPE_FOR_TABLE: Record<string, WSMessage["type"]> = {
  normalized_events: "event",
  alerts: "alert",
  incidents: "incident",
};

const MAX_RECONNECT_ATTEMPTS = 10;
const TOKEN_REFRESH_SKEW_S = 60;

interface WebSocketProviderProps {
  children: React.ReactNode;
  /** Optional: override default subscriptions */
  subscriptions?: ("alerts" | "incidents" | "events")[];
}

function mapEventRow(row: Record<string, unknown>): EventPayload {
  const r = row as Record<string, unknown>;
  return {
    id: Number(r.id),
    source_id: Number(r.source_id),
    category: String(r.category ?? ""),
    event_type: String(r.event_type ?? ""),
    severity: (r.severity as EventPayload["severity"]) ?? "low",
    timestamp: String(r.timestamp ?? ""),
    user_id: (r.user_id as string | null) ?? null,
    session_id: (r.session_id as string | null) ?? null,
    ip: (r.ip as string | null) ?? null,
    user_agent: (r.user_agent as string | null) ?? null,
    route: (r.route as string | null) ?? null,
    method: (r.method as string | null) ?? null,
    status_code: (r.status_code as number | null) ?? null,
    metadata: (r.event_metadata as Record<string, unknown>) ?? {},
    mitre_tactic: (r.mitre_tactic as string | null) ?? null,
    mitre_technique: (r.mitre_technique as string | null) ?? null,
    created_at: String(r.timestamp ?? ""),
  };
}

function mapAlertRow(row: Record<string, unknown>): AlertPayload {
  const r = row as Record<string, unknown>;
  return {
    id: Number(r.id),
    source_id: Number(r.source_id),
    detection_type: String(r.detection_type ?? ""),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    severity: (r.severity as AlertPayload["severity"]) ?? "low",
    confidence: Number(r.confidence ?? 0),
    status: (r.status as AlertPayload["status"]) ?? "new",
    evidence: (r.evidence as Record<string, unknown>) ?? {},
    // The backend broadcast never enriched these; the dashboard refetches
    // authoritative rows on every message, so empty defaults are safe.
    mitre_tactics: [],
    mitre_techniques: [],
    affected_entities: {},
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function mapIncidentRow(row: Record<string, unknown>): IncidentPayload {
  const r = row as Record<string, unknown>;
  return {
    id: Number(r.id),
    source_id: Number(r.source_id),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    severity: (r.severity as IncidentPayload["severity"]) ?? "low",
    status: (r.status as IncidentPayload["status"]) ?? "open",
    affected_ips: (r.affected_ips as string[]) ?? [],
    affected_users: (r.affected_users as string[]) ?? [],
    mitre_tactics: (r.mitre_tactics as string[]) ?? [],
    mitre_techniques: (r.mitre_techniques as string[]) ?? [],
    // Resolved authoritatively via the refetch every page performs.
    alert_count: 0,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    closed_at: (r.closed_at as string | null) ?? null,
  };
}

export function SupabaseRealtimeProvider({
  children,
  subscriptions = ["alerts", "incidents", "events"],
}: WebSocketProviderProps) {
  const [status, setStatus] = React.useState<ConnectionStatus>("disconnected");
  const [isInitialized, setIsInitialized] = React.useState(false);

  const clientRef = React.useRef<SupabaseClient | null>(null);
  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const handlersRef = React.useRef<Map<string, Set<WSMessageHandler>>>(new Map());
  const reconnectTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = React.useRef(0);
  const isIntentionalDisconnectRef = React.useRef(false);
  const isMountedRef = React.useRef(true);
  const currentSubscriptionsRef = React.useRef<Set<string>>(new Set(subscriptions));
  const sourceIdRef = React.useRef<number | null>(null);
  const maxRowIdRef = React.useRef(0);
  const [maxRowId, setMaxRowId] = React.useState(0);
  const connectedApiKeyRef = React.useRef<string | null>(null);

  const callbackRefs = React.useRef({
    onStatusChange: null as UseWebSocketOptions["onStatusChange"] | null,
    onAlert: null as UseWebSocketOptions["onAlert"] | null,
    onIncident: null as UseWebSocketOptions["onIncident"] | null,
    onEvent: null as UseWebSocketOptions["onEvent"] | null,
    onError: null as UseWebSocketOptions["onError"] | null,
    onConnect: null as UseWebSocketOptions["onConnect"] | null,
    onDisconnect: null as UseWebSocketOptions["onDisconnect"] | null,
  });

  const [apiKey, setApiKey] = React.useState<string | null>(() => getStoredApiKey());

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === API_KEY_STORAGE) {
        setApiKey(event.newValue || getStoredApiKey());
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const updateStatus = React.useCallback((newStatus: ConnectionStatus) => {
    if (!isMountedRef.current) return;
    setStatus(newStatus);
  }, []);

  const clearTimers = React.useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  const emit = React.useCallback((message: WSMessage) => {
    const rowId = (message.data as { id?: unknown } | undefined)?.id;
    const numericId = typeof rowId === "number" ? rowId : 0;
    if (numericId > maxRowIdRef.current) {
      maxRowIdRef.current = numericId;
      setMaxRowId(numericId);
    }
    if (message.type === "alert") {
      callbackRefs.current.onAlert?.(message.data as AlertPayload, numericId);
    } else if (message.type === "incident") {
      callbackRefs.current.onIncident?.(message.data as IncidentPayload, numericId);
    } else if (message.type === "event") {
      callbackRefs.current.onEvent?.(message.data as EventPayload, numericId);
    }
    const typeHandlers = handlersRef.current.get(message.type);
    typeHandlers?.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error("Error in WebSocket message handler:", error);
      }
    });
    handlersRef.current.get("*")?.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error("Error in WebSocket wildcard handler:", error);
      }
    });
  }, []);

  const teardownChannel = React.useCallback(async () => {
    clearTimers();
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      try {
        await clientRef.current?.removeChannel(channel);
      } catch (error) {
        console.debug("Error removing realtime channel:", error);
      }
    }
  }, [clearTimers]);

  const scheduleReconnect = React.useCallback(() => {
    if (!isMountedRef.current || isIntentionalDisconnectRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      updateStatus("error");
      callbackRefs.current.onStatusChange?.("error");
      callbackRefs.current.onError?.(new Error("Realtime reconnection attempts exhausted"));
      return;
    }
    updateStatus("reconnecting");
    callbackRefs.current.onStatusChange?.("reconnecting");
    reconnectAttemptsRef.current += 1;
    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttemptsRef.current - 1) + Math.random() * 1000,
      30000
    );
    reconnectTimeoutRef.current = setTimeout(() => {
      void connectRef.current();
    }, delay);
  }, [updateStatus]);

  const connect = React.useCallback(async () => {
    if (!isMountedRef.current) return;
    if (channelRef.current) return;
    const currentApiKey = connectedApiKeyRef.current;
    if (!currentApiKey) return;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      updateStatus("error");
      callbackRefs.current.onStatusChange?.("error");
      callbackRefs.current.onError?.(
        new Error("Supabase realtime is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)")
      );
      return;
    }

    isIntentionalDisconnectRef.current = false;
    updateStatus("connecting");

    try {
      const { createClient } = await import("@supabase/supabase-js");
      if (!clientRef.current) {
        clientRef.current = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      }
      // Mint a source-scoped token with the stored HawkEye API key. The
      // client key is sent as X-API-Key by apiClient, exactly like login.
      const token = await apiClient.getRealtimeToken();
      sourceIdRef.current = token.source_id;
      clientRef.current.realtime.setAuth(token.token);

      const wanted = new Set(
        [...currentSubscriptionsRef.current].filter((t): t is SubscriptionName =>
          t === "alerts" || t === "incidents" || t === "events"
        )
      );
      if (wanted.size === 0) {
        updateStatus("connected");
        return;
      }

      let channel = clientRef.current.channel("hawkeye");
      for (const sub of wanted) {
        const table = TABLE_FOR_SUBSCRIPTION[sub];
        channel = channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `source_id=eq.${token.source_id}`,
          },
          (payload) => {
            const row = (payload.new ?? {}) as Record<string, unknown>;
            if (!row || typeof row.id === "undefined") return;
            const wireType = WIRE_TYPE_FOR_TABLE[table];
            let data: unknown = row;
            if (wireType === "event") data = mapEventRow(row);
            else if (wireType === "alert") data = mapAlertRow(row);
            else if (wireType === "incident") data = mapIncidentRow(row);
            emit({
              type: wireType,
              timestamp: new Date().toISOString(),
              event_id: typeof row.id === "number" ? row.id : 0,
              data,
            });
          }
        );
      }

      channelRef.current = channel;
      channel.subscribe((channelStatus) => {
        if (!isMountedRef.current) return;
        if (channelStatus === "SUBSCRIBED") {
          reconnectAttemptsRef.current = 0;
          updateStatus("connected");
          const connectedData: ConnectedData = {
            connection_id: `supabase:hawkeye:${token.source_id}`,
            source_id: token.source_id,
            source_name: "",
            subscriptions: [...wanted],
          };
          callbackRefs.current.onConnect?.(connectedData);
          callbackRefs.current.onStatusChange?.("connected");
          // Refresh the token before it expires; the channel is rebuilt so
          // the new token applies to the subscription.
          const skewMs = Math.max(token.expires_in - TOKEN_REFRESH_SKEW_S, 30) * 1000;
          refreshTimeoutRef.current = setTimeout(() => {
            void (async () => {
              await teardownChannel();
              if (isMountedRef.current && !isIntentionalDisconnectRef.current) {
                await connectRef.current();
              }
            })();
          }, skewMs);
        } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "CLOSED") {
          channelRef.current = null;
          updateStatus("disconnected");
          callbackRefs.current.onStatusChange?.("disconnected");
          callbackRefs.current.onDisconnect?.();
          scheduleReconnect();
        }
      });
    } catch (error) {
      console.error("Failed to connect realtime:", error);
      if (!isMountedRef.current) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        // Key rejected: same semantics as the legacy 1008 path.
        isIntentionalDisconnectRef.current = true;
        updateStatus("error");
        callbackRefs.current.onStatusChange?.("error");
        callbackRefs.current.onError?.(new Error("Realtime authentication failed"));
        return;
      }
      updateStatus("disconnected");
      callbackRefs.current.onStatusChange?.("disconnected");
      scheduleReconnect();
    }
  }, [emit, scheduleReconnect, teardownChannel, updateStatus]);

  const connectRef = React.useRef(connect);
  connectRef.current = connect;

  const disconnect = React.useCallback(() => {
    isIntentionalDisconnectRef.current = true;
    connectedApiKeyRef.current = null;
    void teardownChannel();
    if (isMountedRef.current) {
      updateStatus("disconnected");
      callbackRefs.current.onStatusChange?.("disconnected");
      callbackRefs.current.onDisconnect?.();
    }
  }, [teardownChannel, updateStatus]);

  const reconnect = React.useCallback(() => {
    reconnectAttemptsRef.current = 0;
    const currentApiKey = connectedApiKeyRef.current || apiKey;
    void teardownChannel();
    setTimeout(() => {
      if (isMountedRef.current && currentApiKey) {
        connectedApiKeyRef.current = currentApiKey;
        void connectRef.current();
      }
    }, 100);
  }, [apiKey, teardownChannel]);

  const subscribe = React.useCallback(
    (types: ("alerts" | "incidents" | "events")[]) => {
      const validTypes = new Set(["alerts", "incidents", "events"]);
      let changed = false;
      types
        .filter((t) => validTypes.has(t))
        .forEach((t) => {
          if (!currentSubscriptionsRef.current.has(t)) {
            currentSubscriptionsRef.current.add(t);
            changed = true;
          }
        });
      if (changed) {
        void teardownChannel().then(() => {
          if (isMountedRef.current && !isIntentionalDisconnectRef.current) {
            void connectRef.current();
          }
        });
      }
    },
    [teardownChannel]
  );

  const unsubscribe = React.useCallback(
    (types: ("alerts" | "incidents" | "events")[]) => {
      const validTypes = new Set(["alerts", "incidents", "events"]);
      let changed = false;
      types
        .filter((t) => validTypes.has(t))
        .forEach((t) => {
          if (currentSubscriptionsRef.current.delete(t)) changed = true;
        });
      if (changed) {
        void teardownChannel().then(() => {
          if (isMountedRef.current && !isIntentionalDisconnectRef.current) {
            void connectRef.current();
          }
        });
      }
    },
    [teardownChannel]
  );

  const send = React.useCallback((_message: WSClientMessage) => {
    // No raw socket exists: subscribe/unsubscribe are applied directly above;
    // ping/pong/reconnect are owned by supabase-js. Resolve immediately.
    return Promise.resolve();
  }, []);

  const on = React.useCallback(
    (types: WSMessage["type"] | WSMessage["type"][], handler: (message: WSMessage) => void) => {
      const typeArray = Array.isArray(types) ? types : [types];
      typeArray.forEach((type) => {
        if (!handlersRef.current.has(type)) {
          handlersRef.current.set(type, new Set());
        }
        handlersRef.current.get(type)!.add(handler);
      });
      return () => {
        typeArray.forEach((type) => {
          handlersRef.current.get(type)?.delete(handler);
        });
      };
    },
    []
  );

  const configure = React.useCallback((options: UseWebSocketOptions) => {
    callbackRefs.current.onStatusChange = options.onStatusChange ?? null;
    callbackRefs.current.onAlert = options.onAlert ?? null;
    callbackRefs.current.onIncident = options.onIncident ?? null;
    callbackRefs.current.onEvent = options.onEvent ?? null;
    callbackRefs.current.onError = options.onError ?? null;
    callbackRefs.current.onConnect = options.onConnect ?? null;
    callbackRefs.current.onDisconnect = options.onDisconnect ?? null;
    if (options.subscriptions) {
      currentSubscriptionsRef.current = new Set(options.subscriptions);
    }
    if (options.apiKey) {
      connectedApiKeyRef.current = options.apiKey;
      void connectRef.current();
    }
  }, []);

  const getConfig = React.useCallback(() => null, []);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      void teardownChannel();
    };
  }, [teardownChannel]);

  React.useEffect(() => {
    setIsInitialized(!!apiKey);
    if (apiKey) {
      if (apiKey !== connectedApiKeyRef.current) {
        void teardownChannel();
      }
      connectedApiKeyRef.current = apiKey;
      reconnectAttemptsRef.current = 0;
      isIntentionalDisconnectRef.current = false;
      void connectRef.current();
    } else {
      connectedApiKeyRef.current = null;
      void teardownChannel();
      if (isMountedRef.current) {
        updateStatus("disconnected");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const value: WebSocketContextValue = {
    status,
    sessionId: null,
    lastEventId: maxRowId,
    isInitialized,
    subscribe,
    unsubscribe,
    reconnect,
    disconnect,
    connect: () => {
      void connectRef.current();
    },
    send,
    isConnected: status === "connected",
    on,
    configure,
    getConfig,
  };

  return (
    <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
  );
}
