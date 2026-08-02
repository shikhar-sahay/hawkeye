"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertFeed } from "@/components/AlertFeed";
import { AlertDetail } from "@/components/AlertDetail";
import { useWebSocket, type AlertPayload } from "@/hooks/useWebSocket";
import { ConnectionStatusCard } from "@/components/ConnectionStatusCard";
import { apiClient, queryKeys } from "@/api/client";
import {
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { cn, getSeverityBadgeVariant } from "@/lib/utils";
import type { Alert, AlertListParams } from "@/types";

/**
 * AlertsPage - Main alerts management page
 * Fetches initial alerts via REST API, receives real-time updates via WebSocket
 */
export function AlertsPage() {
  const queryClient = useQueryClient();

  // Filter state
  const [filters, setFilters] = React.useState<AlertListParams>({
    limit: 50,
    offset: 0,
  });
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);

  // WebSocket state
  const [liveAlerts, setLiveAlerts] = React.useState<AlertPayload[]>([]);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = React.useState<Alert | null>(null);

  // Fetch initial alerts via TanStack Query
  const {
    data: alertsResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.alerts.list(filters),
    queryFn: () => apiClient.getAlerts(filters),
    staleTime: 30000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });

  // Combine REST alerts with live alerts
  // Live alerts are prepended to the list, but we need to deduplicate
  const combinedAlerts = React.useMemo(() => {
    const restAlerts = alertsResponse?.alerts || [];
    const restAlertIds = new Set(restAlerts.map((a) => a.id));

    // Convert live alerts to Alert format
    const liveAlertsConverted: Alert[] = liveAlerts
      .filter((la) => !restAlertIds.has(la.id))
      .map((la) => ({
        id: la.id,
        source_id: la.source_id,
        event_id: la.id, // Use alert ID as event_id for now
        detection_type: la.detection_type,
        title: la.title,
        description: la.description,
        severity: la.severity,
        confidence: la.confidence,
        status: la.status,
        evidence: la.evidence,
        mitre_tactics: la.mitre_tactics,
        mitre_techniques: la.mitre_techniques,
        created_at: la.created_at,
        updated_at: la.updated_at,
        acknowledged_at: null,
        acknowledged_by: null,
        resolved_at: null,
      }));

    return [...liveAlertsConverted, ...restAlerts];
  }, [alertsResponse?.alerts, liveAlerts]);

  // Apply client-side filtering for search
  const filteredAlerts = React.useMemo(() => {
    if (!searchQuery.trim()) return combinedAlerts;

    const query = searchQuery.toLowerCase();
    return combinedAlerts.filter(
      (alert) =>
        alert.title.toLowerCase().includes(query) ||
        alert.description.toLowerCase().includes(query) ||
        alert.detection_type.toLowerCase().includes(query) ||
        String(alert.id).includes(query) ||
        alert.mitre_tactics.some((tactic: string) => tactic.toLowerCase().includes(query)) ||
        alert.mitre_techniques.some((technique: string) => technique.toLowerCase().includes(query))
    );
  }, [combinedAlerts, searchQuery]);

  // Get API key from localStorage (or auth context)
  const apiKey = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("hawkeye_api_key");
  }, []);

  // WebSocket hook
  const {
    status: wsConnectionStatus,
    sessionId: wsSessionId,
    lastEventId: wsLastEventId,
    reconnect,
    disconnect,
  } = useWebSocket({
    apiKey: apiKey || "",
    subscriptions: ["alerts"],
    autoReconnect: true,
    onStatusChange: () => {}, // Connection status available via wsConnectionStatus
    onAlert: (alert) => {
      // Prepend new alert to live alerts
      setLiveAlerts((prev) => [alert, ...prev.slice(0, 99)]); // Keep max 100 live alerts
      // Invalidate query to refresh if needed
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    },
    onIncident: () => {
      // Could add incident notifications here
    },
    onError: (error) => {
      console.error("WebSocket error:", error);
    },
  });

  // Sync session ID for reconnection
  React.useEffect(() => {
    if (wsSessionId) {
      setSessionId(wsSessionId);
    }
  }, [wsSessionId]);

  // Handle filter changes
  const handleFilterChange = (key: keyof AlertListParams, value: string | number | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value, offset: 0 }));
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const clearFilters = () => {
    setFilters({ limit: 50, offset: 0 });
    setSearchQuery("");
  };

  const hasActiveFilters =
    filters.severity || filters.status || filters.detection_type || filters.start_time || filters.end_time;

  // Load more alerts (pagination)
  const loadMore = () => {
    setFilters((prev) => ({ ...prev, offset: (prev.offset ?? 0) + (prev.limit ?? 50) }));
  };

  return (
    <>
      <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
          <p className="text-muted-foreground">
            Manage and investigate security alerts from all sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setIsFilterOpen(!isFilterOpen)} variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters {hasActiveFilters && <Badge variant="secondary">{Object.keys(filters).filter((k) => filters[k as keyof AlertListParams] && k !== "limit" && k !== "offset").length}</Badge>}
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search alerts by title, description, MITRE tags..."
                value={searchQuery}
                onChange={handleSearch}
                className="pl-10"
              />
            </div>

            <div className="flex flex-wrap gap-2" style={{ display: isFilterOpen ? "flex" : "none" }}>
              <Select
                value={filters.severity || "all"}
                onValueChange={(value) => handleFilterChange("severity", value === "all" ? undefined : value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.status || "all"}
                onValueChange={(value) => handleFilterChange("status", value === "all" ? undefined : value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="suppressed">Suppressed</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.detection_type || "all"}
                onValueChange={(value) => handleFilterChange("detection_type", value === "all" ? undefined : value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Detection Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="brute_force">Brute Force</SelectItem>
                  <SelectItem value="credential_stuffing">Credential Stuffing</SelectItem>
                  <SelectItem value="enumeration">Enumeration</SelectItem>
                  <SelectItem value="bot">Bot Detection</SelectItem>
                  <SelectItem value="sensitive_action">Sensitive Action</SelectItem>
                  <SelectItem value="session_hijacking">Session Hijacking</SelectItem>
                  <SelectItem value="api_abuse">API Abuse</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alert Feed & Table */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Real-time Alert Feed (left column - wider on desktop) */}
        <div className="lg:col-span-2">
          <AlertFeed
            alerts={filteredAlerts.map((alert) => ({
              id: alert.id,
              source_id: alert.source_id,
              detection_type: alert.detection_type,
              severity: alert.severity,
              status: alert.status,
              confidence: alert.confidence,
              title: alert.title,
              description: alert.description,
              evidence: alert.evidence,
              mitre_tactics: alert.mitre_tactics,
              mitre_techniques: alert.mitre_techniques,
              affected_entities: {},
              created_at: alert.created_at,
              updated_at: alert.updated_at,
            }))}
            connectionStatus={wsConnectionStatus}
            onAlertClick={(alert) => {
              // Fetch full alert details and open detail view
              apiClient.getAlert(alert.id).then((fullAlert) => {
                setSelectedAlert(fullAlert);
              }).catch(() => {
                // Fallback to basic alert data
                setSelectedAlert(alert);
              });
            }}
          />
        </div>

        {/* Alert Table / List (right column) */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Alert List</CardTitle>
                <Badge variant="secondary">{filteredAlerts.length}</Badge>
              </div>
              <CardDescription>Click an alert to view details</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && alertsResponse === undefined ? (
                <div className="p-8 text-center">
                  <div className="animate-pulse space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-muted rounded" />
                    ))}
                  </div>
                </div>
              ) : isError ? (
                <div className="p-8 text-center text-destructive">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Failed to load alerts</p>
                  <p className="text-sm text-muted-foreground mt-1">{error?.message}</p>
                  <Button className="mt-4" variant="outline" size="sm" onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              ) : filteredAlerts.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No alerts found</p>
                  <p className="text-sm mt-1">Try adjusting your filters or search query</p>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="hidden md:table-cell">Type</TableHead>
                        <TableHead className="hidden lg:table-cell">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAlerts.map((alert) => (
                        <TableRow
                          key={alert.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            apiClient.getAlert(alert.id).then((fullAlert) => {
                              setSelectedAlert(fullAlert);
                            }).catch(() => {
                              setSelectedAlert(alert);
                            });
                          }}
                        >
                          <TableCell className="p-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 p-0"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Expand alert"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getSeverityBadgeVariant(alert.severity)}>{alert.severity}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate font-medium">{alert.title}</TableCell>
                          <TableCell className="hidden md:table-cell font-mono text-xs">
                            {alert.detection_type}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                            {new Date(alert.created_at).toLocaleTimeString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Load More */}
              {(alertsResponse?.total ?? 0) > (filters.offset || 0) + (filters.limit || 50) && !isLoading && (
                <div className="p-4 border-t">
                  <Button variant="outline" className="w-full" onClick={loadMore} disabled={isLoading}>
                    Load More ({filteredAlerts.length} of {alertsResponse?.total})
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Connection Status Indicator (bottom) */}
      <ConnectionStatusCard
        status={wsConnectionStatus}
        sessionId={sessionId}
        lastEventId={wsLastEventId}
        onReconnect={reconnect}
        onDisconnect={disconnect}
        alwaysShow={true}
      />
    </div>

    {/* Alert Detail Dialog */}
    <AlertDetail
      alert={selectedAlert}
      open={!!selectedAlert}
      onOpenChange={(open) => {
        if (!open) setSelectedAlert(null);
      }}
    />
  </>
);
}