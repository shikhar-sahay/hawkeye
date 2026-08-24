"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IncidentTimeline } from "@/components/IncidentTimeline";
import { IncidentDetail } from "@/components/IncidentDetail";
import { ConnectionStatusCard } from "@/components/ConnectionStatusCard";
import { apiClient, queryKeys } from "@/api/client";
import {
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { cn, getSeverityBadgeVariant, getStatusBadgeVariant } from "@/lib/utils";
import type { Incident, IncidentListParams } from "@/types";
import { useWebSocketContext, useWebSocketMessage } from "@/context/WebSocketContext";
import type { IncidentPayload } from "@/context/WebSocketContext";

/**
 * IncidentsPage - Main incidents management page
 * Fetches initial incidents via REST API, receives real-time updates via shared WebSocketContext
 */
export function IncidentsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state
  const [filters, setFilters] = React.useState<IncidentListParams>({
    limit: 50,
    offset: 0,
  });
  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);

  // WebSocket state for live incidents
  const [liveIncidents, setLiveIncidents] = React.useState<IncidentPayload[]>([]);
  const [selectedIncident, setSelectedIncident] = React.useState<Incident | null>(null);

  // Debounce search input into the query used for server-side filtering
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset pagination whenever server-side filters change
  React.useEffect(() => {
    setFilters((prev) => ({ ...prev, search: searchQuery || undefined, offset: 0 }));
  }, [searchQuery]);

  // Deep link: /incidents?incident=ID opens the detail dialog
  const deepLinkIncidentId = searchParams.get("incident");
  React.useEffect(() => {
    if (!deepLinkIncidentId) return;
    const id = Number(deepLinkIncidentId);
    if (!Number.isFinite(id)) return;
    apiClient.getIncident(id).then(setSelectedIncident).catch(() => setSelectedIncident(null));
  }, [deepLinkIncidentId]);

  const closeDetail = () => {
    setSelectedIncident(null);
    if (searchParams.get("incident")) {
      const params = new URLSearchParams(searchParams);
      params.delete("incident");
      setSearchParams(params, { replace: true });
    }
  };

  // Shared WebSocket context for connection status and subscriptions
  const {
    status: wsConnectionStatus,
    sessionId,
    lastEventId: wsLastEventId,
    reconnect,
    disconnect,
  } = useWebSocketContext();

  // Subscribe to real-time incidents via shared WebSocket
  useWebSocketMessage("incident", (message) => {
    const incident = message.data as IncidentPayload;
    // Prepend new incident to live incidents
    setLiveIncidents((prev) => [incident, ...prev.slice(0, 99)]); // Keep max 100 live incidents
    // Invalidate query to refresh if needed
    queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
  });

  // Subscribe to alerts for query invalidation
  useWebSocketMessage("alert", () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
  });

  // Fetch initial incidents via TanStack Query
  const {
    data: incidentsResponse,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.incidents.list(filters),
    queryFn: () => apiClient.getIncidents(filters),
    staleTime: 30000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });

  // Combine REST incidents with live incidents
  const combinedIncidents = React.useMemo(() => {
    const restIncidents = incidentsResponse?.incidents || [];
    const restIncidentIds = new Set(restIncidents.map((i) => i.id));

    // Convert live incidents to Incident format and filter out duplicates
    const liveIncidentsConverted: Incident[] = liveIncidents
      .filter((li) => !restIncidentIds.has(li.id))
      .map((li) => ({
        id: li.id,
        source_id: li.source_id,
        title: li.title,
        description: li.description,
        severity: li.severity,
        status: li.status,
        affected_ips: li.affected_ips,
        affected_users: li.affected_users,
        mitre_tactics: li.mitre_tactics,
        mitre_techniques: li.mitre_techniques,
        alert_count: li.alert_count,
        created_at: li.created_at,
        updated_at: li.updated_at,
        closed_at: li.closed_at,
        alerts: undefined,
      }));

    return [...liveIncidentsConverted, ...restIncidents];
  }, [incidentsResponse?.incidents, liveIncidents]);

  // Handle filter changes
  const handleFilterChange = (key: keyof IncidentListParams, value: string | number | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value, offset: 0 }));
  };

  const clearFilters = () => {
    setFilters({ limit: 50, offset: 0 });
    setSearchInput("");
    setSearchQuery("");
  };

  const hasActiveFilters =
    filters.severity || filters.status || filters.affected_ip || filters.search;

  // Server-side pagination
  const pageSize = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const total = incidentsResponse?.total ?? 0;
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  return (
    <>
      <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
          <p className="text-muted-foreground">
            Investigate and manage correlated security incidents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={() => setIsFilterOpen(!isFilterOpen)} variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filters {hasActiveFilters && <Badge variant="secondary">{Object.keys(filters).filter((k) => filters[k as keyof IncidentListParams] && k !== "limit" && k !== "offset").length}</Badge>}
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
                placeholder="Search incidents by title, description, MITRE tags, IPs, users..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Affected IP"
                value={filters.affected_ip || ""}
                onChange={(e) => handleFilterChange("affected_ip", e.target.value.trim() || undefined)}
                className="w-[160px]"
              />

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Incident Timeline & Table */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Real-time Incident Timeline (left column - wider on desktop) */}
        <div className="lg:col-span-2">
          <IncidentTimeline
            incidents={combinedIncidents}
            connectionStatus={wsConnectionStatus}
            onIncidentClick={(incident) => {
              apiClient.getIncident(incident.id).then((fullIncident) => {
                setSelectedIncident(fullIncident);
              }).catch(() => {
                setSelectedIncident(incident);
              });
            }}
          />
        </div>

        {/* Incident Table / List (right column) */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Incident List</CardTitle>
                <Badge variant="secondary">{total}</Badge>
              </div>
              <CardDescription>Click an incident to view details</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading && incidentsResponse === undefined ? (
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
                  <p>Failed to load incidents</p>
                  <p className="text-sm text-muted-foreground mt-1">{error?.message}</p>
                  <Button className="mt-4" variant="outline" size="sm" onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              ) : combinedIncidents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No incidents found</p>
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
                        <TableHead className="hidden md:table-cell">Status</TableHead>
                        <TableHead className="hidden lg:table-cell">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedIncidents.map((incident) => (
                        <TableRow
                          key={incident.id}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            apiClient.getIncident(incident.id).then((fullIncident) => {
                              setSelectedIncident(fullIncident);
                            }).catch(() => {
                              setSelectedIncident(incident);
                            });
                          }}
                        >
                          <TableCell className="p-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 p-0"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Expand incident"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getSeverityBadgeVariant(incident.severity)}>{incident.severity}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate font-medium">{incident.title}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant={getStatusBadgeVariant(incident.status)}>{incident.status}</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                            {new Date(incident.created_at).toLocaleTimeString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {total > 0 && (
                    <div className="flex items-center justify-between p-4 border-t">
                      <span className="text-xs text-muted-foreground">
                        Showing {Math.min(offset + 1, total)}–{Math.min(offset + pageSize, total)} of {total}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFilters((prev) => ({ ...prev, offset: Math.max(0, (prev.offset ?? 0) - pageSize) }))}
                          disabled={!canPrev || isFetching}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFilters((prev) => ({ ...prev, offset: (prev.offset ?? 0) + pageSize }))}
                          disabled={!canNext || isFetching}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
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
      />
    </div>

    {/* Incident Detail Dialog */}
    <IncidentDetail
      incident={selectedIncident}
      open={!!selectedIncident}
      onOpenChange={(open) => {
        if (!open) closeDetail();
      }}
    />
  </>
);
}