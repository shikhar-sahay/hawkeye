"use client";

/**
 * Realtime transport dispatcher (Vercel/Supabase migration).
 *
 * This module preserves the exact public API the dashboard has always
 * imported (types, hooks, WebSocketProvider), while selecting the transport:
 * - Supabase Realtime when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are
 *   set (production split deployment).
 * - Raw WebSocket to the FastAPI backend otherwise (local development,
 *   unchanged behavior).
 *
 * Both providers publish the identical WebSocketContextValue shape, so no
 * page or component needs to know which transport is active.
 */
import * as React from "react";
import { LegacyRealtimeProvider } from "./LegacyRealtimeProvider";
import { SupabaseRealtimeProvider } from "./SupabaseRealtimeProvider";

export type {
  AlertPayload,
  ConnectedData,
  ConnectionStatus,
  EventPayload,
  IncidentPayload,
  UseWebSocketOptions,
  WebSocketContextValue,
  WSErrorData,
  WSClientMessage,
  WSMessage,
  WSMessageHandler,
  WSMessageType,
} from "./realtimeTypes";
export {
  WebSocketContext,
  useConnectionStatus,
  useConnectionStatusWithInit,
  useWebSocketContext,
  useWebSocketMessage,
} from "./RealtimeContext";

const USE_SUPABASE_REALTIME =
  (import.meta.env.VITE_SUPABASE_URL ?? "") !== "" &&
  (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "") !== "";

interface WebSocketProviderProps {
  children: React.ReactNode;
  /** Optional: override default subscriptions */
  subscriptions?: ("alerts" | "incidents" | "events")[];
}

export function WebSocketProvider({
  children,
  subscriptions = ["alerts", "incidents", "events"],
}: WebSocketProviderProps) {
  if (USE_SUPABASE_REALTIME) {
    return (
      <SupabaseRealtimeProvider subscriptions={subscriptions}>
        {children}
      </SupabaseRealtimeProvider>
    );
  }
  return (
    <LegacyRealtimeProvider subscriptions={subscriptions}>
      {children}
    </LegacyRealtimeProvider>
  );
}
