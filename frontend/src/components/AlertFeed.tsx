"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Clock, Shield, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertPayload } from "@/hooks/useWebSocket";
import { formatRelativeTime } from "@/lib/utils";

interface AlertFeedProps {
  /** Array of alerts to display */
  alerts: AlertPayload[];
  /** Called when an alert is clicked for details */
  onAlertClick?: (alert: AlertPayload) => void;
  /** Maximum number of alerts to show (0 = unlimited) */
  maxAlerts?: number;
  /** Show connection status indicator */
  showConnectionStatus?: boolean;
  /** Current WebSocket connection status */
  connectionStatus?: "connecting" | "connected" | "disconnected" | "reconnecting" | "error";
  /** Class name for the container */
  className?: string;
}

function getSeverityVariant(severity: string): "default" | "destructive" | "secondary" | "outline" {
  switch (severity) {
    case "critical":
      return "destructive";
    case "high":
      return "default";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
}

/**
 * Gets icon for severity
 */
function SeverityIcon({ severity, className }: { severity: string; className?: string }) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className={cn("text-destructive", className)} />;
    case "high":
      return <Shield className={cn("text-orange-500", className)} />;
    case "medium":
      return <Shield className={cn("text-yellow-500", className)} />;
    case "low":
      return <Shield className={cn("text-blue-500", className)} />;
    default:
      return <Shield className={cn("text-muted-foreground", className)} />;
  }
}

/**
 * Individual alert item component
 */
export interface AlertItemProps {
  alert: AlertPayload;
  isNew?: boolean;
  onClick?: () => void;
}

function AlertItem({ alert, isNew, onClick }: AlertItemProps) {
  return (
    <div
      className={cn(
        "relative border-b last:border-0 transition-all duration-200",
        isNew && "bg-primary/5 border-l-2 border-l-primary"
      )}
      onClick={onClick}
    >
      {/* New indicator */}
      {isNew && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-md animate-pulse" />
      )}

      <div className="p-4 hover:bg-muted/30 transition-colors cursor-pointer">
        <div className="flex items-start gap-3">
          {/* Severity indicator */}
          <div className="flex-shrink-0 pt-0.5">
            <SeverityIcon severity={alert.severity} className="h-5 w-5" />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h4 className="font-medium text-sm truncate">{alert.title}</h4>
                <Badge variant={getSeverityVariant(alert.severity)} className="text-xs">
                  {alert.severity.toUpperCase()}
                </Badge>
                <Badge variant="outline" className="text-xs font-mono">
                  {alert.detection_type}
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                <Clock className="h-3 w-3" />
                <span>{formatRelativeTime(alert.created_at)}</span>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{alert.description}</p>

            {/* MITRE tags */}
            {(alert.mitre_tactics.length > 0 || alert.mitre_techniques.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {alert.mitre_tactics.slice(0, 3).map((tactic) => (
                  <Badge key={tactic} variant="outline" className="text-xs gap-1">
                    <Shield className="h-2.5 w-2.5" />
                    {tactic}
                  </Badge>
                ))}
                {alert.mitre_techniques.slice(0, 2).map((technique) => (
                  <Badge key={technique} variant="outline" className="text-xs gap-1">
                    <ExternalLink className="h-2.5 w-2.5" />
                    {technique}
                  </Badge>
                ))}
                {alert.mitre_tactics.length > 3 || alert.mitre_techniques.length > 2 ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    +{alert.mitre_tactics.length - 3 + alert.mitre_techniques.length - 2} more
                  </Badge>
                ) : null}
              </div>
            )}

            {/* Expandable details */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">Alert ID: {alert.id}</span>
              <span>Source: {alert.source_id}</span>
              {alert.confidence !== undefined && (
                <span>Confidence: {Math.round(alert.confidence * 100)}%</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground">
      <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
      <p className="font-medium">No alerts yet</p>
      <p className="text-sm mt-1">Connect a data source to start receiving real-time alerts</p>
    </div>
  );
}

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-4 border-b">
          <div className="flex items-start gap-3">
            <div className="h-5 w-5 rounded bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/2 bg-muted rounded" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * AlertFeed - Real-time alert feed component
 * Displays incoming alerts with severity badges, MITRE tags, and highlights new alerts
 */
export function AlertFeed({
  alerts,
  onAlertClick,
  maxAlerts = 0,
  showConnectionStatus = true,
  connectionStatus = "disconnected",
  className,
}: AlertFeedProps) {
  const displayAlerts = maxAlerts > 0 ? alerts.slice(0, maxAlerts) : alerts;

  // Track seen alert IDs to detect new ones
  const seenAlertIdsRef = React.useRef<Set<number>>(new Set());

  // Track which alerts are "new" (received in last 5 seconds) by their unique ID
  const [newAlertIds, setNewAlertIds] = React.useState<Set<number>>(new Set());

  // Detect new alerts when displayAlerts changes
  React.useEffect(() => {
    if (displayAlerts.length === 0) return;

    // Find new alerts (IDs not previously seen)
    const newIds: number[] = [];

    displayAlerts.forEach(alert => {
      if (!seenAlertIdsRef.current.has(alert.id)) {
        newIds.push(alert.id);
      }
    });

    // Add new IDs to newAlertIds set
    if (newIds.length > 0) {
      setNewAlertIds(prev => new Set([...prev, ...newIds]));
      // Mark these as seen
      newIds.forEach(id => seenAlertIdsRef.current.add(id));
    }
  }, [displayAlerts]);

  // Mark new alerts as not-new after 5 seconds
  React.useEffect(() => {
    if (newAlertIds.size > 0) {
      const timer = setTimeout(() => {
        setNewAlertIds(new Set());
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [newAlertIds.size]);

  if (displayAlerts.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Live Alert Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Live Alert Feed
          </CardTitle>
          {showConnectionStatus && (
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  connectionStatus === "connected" && "bg-green-500",
                  connectionStatus === "connecting" && "bg-yellow-500 animate-pulse",
                  connectionStatus === "reconnecting" && "bg-yellow-500 animate-pulse",
                  connectionStatus === "error" && "bg-destructive",
                  connectionStatus === "disconnected" && "bg-muted-foreground"
                )}
              />
              <span className="font-medium capitalize">{connectionStatus}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-0">
            {displayAlerts.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                isNew={newAlertIds.has(alert.id)}
                onClick={() => onAlertClick?.(alert)}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export { AlertItem, EmptyState, LoadingSkeleton };