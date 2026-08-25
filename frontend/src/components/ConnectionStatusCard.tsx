"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Wifi,
  WifiOff,
  RotateCcw,
  XCircle,
} from "lucide-react";

type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "error" | "disconnected";

interface ConnectionStatusCardProps {
  status: ConnectionStatus;
  sessionId?: string | null;
  lastEventId?: number;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  /** Show even when connected (default: false - only show when not connected) */
  alwaysShow?: boolean;
  /** Show compact version (for TopNav) */
  compact?: boolean;
}

/**
 * ConnectionStatusCard - Reusable WebSocket connection status indicator
 * Displays connection state, session info, and reconnect/disconnect controls
 */
export function ConnectionStatusCard({
  status,
  sessionId,
  lastEventId,
  onReconnect,
  onDisconnect,
  alwaysShow = false,
  compact = false,
}: ConnectionStatusCardProps) {
  // Don't render if connected and not alwaysShow
  if (status === "connected" && !alwaysShow && !compact) {
    return null;
  }

  const isConnected = status === "connected";
  const isConnecting = status === "connecting" || status === "reconnecting";
  const isError = status === "error";

  const statusConfig = {
    connected: { icon: Wifi, color: "text-success", bg: "bg-success", label: "Connected" },
    connecting: { icon: Wifi, color: "text-warning", bg: "bg-warning animate-pulse", label: "Connecting..." },
    reconnecting: { icon: Wifi, color: "text-warning", bg: "bg-warning animate-pulse", label: "Reconnecting..." },
    error: { icon: WifiOff, color: "text-destructive", bg: "bg-destructive", label: "Error" },
    disconnected: { icon: WifiOff, color: "text-muted-foreground", bg: "bg-muted-foreground", label: "Disconnected" },
  };

  const config = statusConfig[status];

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-xs font-medium", isConnected && "text-success")}>
        <config.icon className={cn("h-3.5 w-3.5", config.color, isConnecting && "animate-pulse")} aria-hidden="true" />
        <span>{config.label}</span>
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <span className={cn("flex items-center gap-2", isConnected && "text-success")}>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected && "bg-success",
                  isConnecting && "bg-warning animate-pulse",
                  isError && "bg-destructive",
                  (!isConnected && !isConnecting && !isError) && "bg-muted-foreground"
                )}
              />
              WebSocket:{' '}
              <span className="font-medium capitalize">{config.label}</span>
            </span>
            {sessionId && (
              <span className="text-muted-foreground font-mono text-xs">
                Session: {sessionId.slice(0, 8)}...
              </span>
            )}
            {lastEventId && lastEventId > 0 && (
              <span className="text-muted-foreground font-mono text-xs">
                Last Event: #{lastEventId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isConnected && onReconnect && (
              <Button variant="outline" size="sm" onClick={onReconnect}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reconnect
              </Button>
            )}
            {onDisconnect && (
              <Button variant="outline" size="sm" onClick={onDisconnect}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ConnectionStatusInline - Compact inline connection status for TopNav
 */
export function ConnectionStatusInline({
  status,
  onReconnect,
}: {
  status: ConnectionStatus;
  onReconnect?: () => void;
}) {
  const isConnected = status === "connected";
  const isConnecting = status === "connecting" || status === "reconnecting";

  const statusConfig = {
    connected: { icon: Wifi, color: "text-success", label: "Connected" },
    connecting: { icon: Wifi, color: "text-warning", label: "Connecting..." },
    reconnecting: { icon: Wifi, color: "text-warning", label: "Reconnecting..." },
    error: { icon: WifiOff, color: "text-destructive", label: "Error" },
    disconnected: { icon: WifiOff, color: "text-muted-foreground", label: "Disconnected" },
  };

  const config = statusConfig[status];

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-xs font-medium", isConnected && "text-success")}>
      <config.icon className={cn("h-3.5 w-3.5", config.color, isConnecting && "animate-pulse")} aria-hidden="true" />
      {/* Label hidden on very small screens; the icon + tooltip carry status */}
      <span className="hidden sm:inline">{config.label}</span>
      <span className="sr-only sm:hidden">{config.label}</span>
      {!isConnected && onReconnect && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onReconnect} aria-label="Reconnect">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}