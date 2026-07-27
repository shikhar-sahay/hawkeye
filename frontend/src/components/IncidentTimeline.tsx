"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Shield,
  Clock,
  ChevronDown,
  ChevronRight,
  MapPin,
  User,
  Search,
  X,
} from "lucide-react";
import { cn, formatRelativeTime, getSeverityBadgeVariant, getStatusBadgeVariant, getMitreTacticLabel } from "@/lib/utils";
import type { IncidentPayload } from "@/hooks/useWebSocket";
import type { Incident } from "@/types";

interface IncidentTimelineProps {
  /** Array of incidents to display */
  incidents: (Incident | IncidentPayload)[];
  /** Called when an incident is clicked for details */
  onIncidentClick?: (incident: Incident | IncidentPayload) => void;
  /** Maximum number of incidents to show (0 = unlimited) */
  maxIncidents?: number;
  /** Show connection status indicator */
  showConnectionStatus?: boolean;
  /** Current WebSocket connection status */
  connectionStatus?: "connecting" | "connected" | "disconnected" | "reconnecting" | "error";
  /** Class name for the container */
  className?: string;
}

interface TimelineItemProps {
  incident: Incident | IncidentPayload;
  index: number;
  total: number;
  isExpanded: boolean;
  onToggle: () => void;
  onClick?: () => void;
}

function TimelineItem({ incident, index, total, isExpanded, onToggle, onClick }: TimelineItemProps) {
  const isLast = index === total - 1;
  const isCritical = incident.severity === "critical";
  const isHigh = incident.severity === "high";

  return (
    <div className="relative" onClick={onClick}>
      {/* Vertical line connector */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" style={{ display: isLast ? "none" : "block" }} />

      <div className="relative pl-16">
        {/* Timeline dot */}
        <div
          className={cn(
            "absolute left-4 top-3 w-4 h-4 rounded-full border-3 border-background z-10 flex items-center justify-center transition-all duration-200",
            isCritical && "bg-destructive border-destructive animate-pulse",
            isHigh && "bg-orange-500 border-orange-500",
            !isCritical && !isHigh && incident.severity === "medium" && "bg-yellow-500 border-yellow-500",
            !isCritical && !isHigh && incident.severity === "low" && "bg-blue-500 border-blue-500",
            isExpanded && "scale-125"
          )}
        >
          <span className="text-[10px] font-bold text-white" style={{ lineHeight: 1 }}>
            {incident.severity === "critical" ? "!" : incident.severity === "high" ? "▲" : "●"}
          </span>
        </div>

        {/* Incident Card */}
        <Card className={cn("transition-all duration-200", isExpanded && "shadow-lg ring-2 ring-primary/20")}>
          <CardHeader className="pb-3" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            <div className="flex items-start gap-3">
              {/* Expand/Collapse icon */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 p-0 mt-0.5 flex-shrink-0"
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{incident.title}</h4>
                    <Badge variant={getSeverityBadgeVariant(incident.severity)} className="text-xs">
                      {incident.severity.toUpperCase()}
                    </Badge>
                    <Badge variant={getStatusBadgeVariant(incident.status)} className="text-xs">
                      {incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                    <span className="font-mono">#{incident.id}</span>
                    <Clock className="h-3 w-3" />
                    <span>{formatRelativeTime(incident.created_at)}</span>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground line-clamp-2">{incident.description}</p>

                {/* Quick stats row */}
                <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{incident.alert_count} alerts</span>
                  </div>
                  {incident.affected_ips.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{incident.affected_ips.slice(0, 2).join(", ")}{incident.affected_ips.length > 2 ? ` +${incident.affected_ips.length - 2}` : ""}</span>
                    </div>
                  )}
                  {incident.affected_users.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{incident.affected_users.slice(0, 2).join(", ")}{incident.affected_users.length > 2 ? ` +${incident.affected_users.length - 2}` : ""}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>

          {/* Expanded details */}
          {isExpanded && (
            <CardContent className="pb-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <Separator />

              {/* MITRE Tactics */}
              {(incident.mitre_tactics.length > 0 || incident.mitre_techniques.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <Shield className="h-3 w-3" />
                    MITRE ATT&CK
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {incident.mitre_tactics.slice(0, 5).map((tactic) => (
                      <Badge key={tactic} variant="outline" className="text-xs gap-1">
                        <Shield className="h-2.5 w-2.5" />
                        {getMitreTacticLabel(tactic)}
                      </Badge>
                    ))}
                    {incident.mitre_tactics.length > 5 && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        +{incident.mitre_tactics.length - 5} more
                      </Badge>
                    )}
                    {incident.mitre_techniques.slice(0, 3).map((technique) => (
                      <Badge key={technique} variant="outline" className="text-xs gap-1">
                        <Search className="h-2.5 w-2.5" />
                        {technique}
                      </Badge>
                    ))}
                    {incident.mitre_techniques.length > 3 && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        +{incident.mitre_techniques.length - 3} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-mono">{new Date(incident.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Updated</p>
                  <p className="font-mono">{new Date(incident.updated_at).toLocaleString()}</p>
                </div>
                {incident.closed_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Closed</p>
                    <p className="font-mono">{new Date(incident.closed_at).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="font-mono">Source #{incident.source_id}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
                  View Details
                </Button>
                <Button variant="outline" size="sm">
                  Acknowledge
                </Button>
                <Button variant="outline" size="sm">
                  Resolve
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  filterActive?: boolean;
  onClearFilters?: () => void;
}

function EmptyState({ filterActive, onClearFilters }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground">
      <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
      <p className="font-medium text-lg">No incidents found</p>
      <p className="text-sm mt-1 max-w-md">
        {filterActive
          ? "Try adjusting your filters or search query to find incidents."
          : "Connect a data source and ingest events to start seeing incidents."}
      </p>
      {filterActive && onClearFilters && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
          <X className="h-4 w-4 mr-2" />
          Clear Filters
        </Button>
      )}
    </div>
  );
}

interface LoadingSkeletonProps {
  count?: number;
}

function LoadingSkeleton({ count = 3 }: LoadingSkeletonProps) {
  return (
    <div className="animate-pulse space-y-4">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="pl-16">
          <div className="absolute left-6 top-3 w-4 h-4 rounded-full bg-muted" />
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                  <div className="flex gap-2">
                    <div className="h-5 w-20 bg-muted rounded" />
                    <div className="h-5 w-20 bg-muted rounded" />
                    <div className="h-5 w-20 bg-muted rounded" />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-4 w-full bg-muted rounded mb-2" />
              <div className="h-4 w-2/3 bg-muted rounded" />
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

/**
 * IncidentTimeline - Timeline visualization for incidents with severity markers,
 * MITRE tags, expandable details, and real-time updates
 */
export function IncidentTimeline({
  incidents,
  onIncidentClick,
  maxIncidents = 0,
  showConnectionStatus = true,
  connectionStatus = "disconnected",
  className,
}: IncidentTimelineProps) {
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set());
  const displayIncidents = maxIncidents > 0 ? incidents.slice(0, maxIncidents) : incidents;

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (displayIncidents.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Incident Timeline
          </CardTitle>
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
            Incident Timeline
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
          <div className="p-4 space-y-4">
            {displayIncidents.map((incident, index) => (
              <TimelineItem
                key={incident.id}
                incident={incident}
                index={index}
                total={displayIncidents.length}
                isExpanded={expandedIds.has(incident.id)}
                onToggle={() => toggleExpanded(incident.id)}
                onClick={() => onIncidentClick?.(incident)}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export { TimelineItem, EmptyState, LoadingSkeleton };