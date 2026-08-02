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
import {
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  Download,
  X,
} from "lucide-react";
import { cn, getSeverityBadgeVariant, formatTimestamp } from "@/lib/utils";
import { ConnectionStatusCard } from "@/components/ConnectionStatusCard";
import { apiClient, queryKeys } from "@/api/client";
import { useWebSocketContext, useWebSocketMessage } from "@/context/WebSocketContext";
import type { NormalizedEvent, EventListParams } from "@/types";

/**
 * EventsPage - Main events management page
 * Fetches initial events via REST API, supports server-side filtering/pagination/search
 * Real-time updates via shared WebSocket context (events subscription)
 */
export function EventsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state (mirrors backend EventListParams)
  const [filters, setFilters] = React.useState<EventListParams>({
    limit: 50,
    offset: 0,
    search: "",
  });
  const [searchQuery, setSearchQuery] = React.useState(() => searchParams.get("search") || "");
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);

  // WebSocket state for live events
  const [liveEvents, setLiveEvents] = React.useState<NormalizedEvent[]>([]);

  // Sync searchQuery with filters for API calls
  React.useEffect(() => {
    setFilters(prev => ({ ...prev, search: searchQuery.trim() || undefined, offset: 0 }));
  }, [searchQuery]);

  // Fetch initial events via TanStack Query
  const {
    data: eventsResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.events.list(filters),
    queryFn: () => apiClient.getEvents(filters),
    staleTime: 30000, // 30 seconds
    placeholderData: (previousData) => previousData,
  });

  // Shared WebSocket context for connection status
  const {
    status: wsConnectionStatus,
    sessionId,
    lastEventId: wsLastEventId,
    reconnect,
    disconnect,
  } = useWebSocketContext();

  // Subscribe to real-time events via shared WebSocket
  useWebSocketMessage("event", (message) => {
    const event = message.data as NormalizedEvent;
    // Prepend new event to live events
    setLiveEvents((prev) => [event, ...prev.slice(0, 99)]); // Keep max 100 live events
    // Invalidate query to refresh if needed
    queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
  });

  // Subscribe to alerts for query invalidation
  useWebSocketMessage("alert", () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
  });

  // Subscribe to incidents for query invalidation
  useWebSocketMessage("incident", () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
  });

  // Combine REST API events with WebSocket live events
  // WebSocket events are prepended since they're newer
  const combinedEvents = React.useMemo(() => {
    const apiEvents = eventsResponse?.events || [];
    return [...liveEvents, ...apiEvents];
  }, [eventsResponse?.events, liveEvents]);

  // Sync search query with URL params
  React.useEffect(() => {
    const currentSearch = searchParams.get("search") || "";
    if (currentSearch !== searchQuery) {
      setSearchQuery(currentSearch);
    }
  }, [searchParams, searchQuery]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (searchQuery.trim()) {
      params.set("search", searchQuery.trim());
    } else {
      params.delete("search");
    }
    setSearchParams(params, { replace: true });
  }, [searchQuery, searchParams, setSearchParams]);

  // Handle filter changes
  const handleFilterChange = (key: keyof EventListParams, value: string | number | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value, offset: 0 }));
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const clearFilters = () => {
    setFilters({ limit: 50, offset: 0, search: undefined });
    setSearchQuery("");
  };

  // Export events to CSV
  const handleExport = () => {
    const eventsToExport = combinedEvents;
    if (eventsToExport.length === 0) {
      return;
    }

    // Convert events to CSV
    const headers = [
      "Timestamp",
      "Category",
      "Event Type",
      "Severity",
      "User ID",
      "IP",
      "Route",
      "Method",
      "Status Code",
    ];

    const rows = eventsToExport.map((event) => [
      formatTimestamp(event.timestamp),
      event.category,
      event.event_type,
      event.severity,
      event.user_id || "",
      event.ip || "",
      event.route || "",
      event.method || "",
      event.status_code?.toString() || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Create and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `hawkeye-events-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters =
    searchQuery ||
    filters.category ||
    filters.event_type ||
    filters.severity ||
    filters.user_id ||
    filters.ip ||
    filters.route ||
    filters.method ||
    filters.status_code ||
    filters.start_time ||
    filters.end_time;

  // Load more events (pagination)
  const loadMore = () => {
    setFilters((prev) => ({ ...prev, offset: (prev.offset ?? 0) + (prev.limit ?? 50) }));
  };

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Live Events</h1>
            <p className="text-muted-foreground">Real-time event stream from all sources</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={combinedEvents.length === 0}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button onClick={() => setIsFilterOpen(!isFilterOpen)} variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary">
                  {Object.keys(filters).filter(
                    (k) => filters[k as keyof EventListParams] && k !== "limit" && k !== "offset"
                  ).length}
                </Badge>
              )}
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
                  placeholder="Search events by category, type, user, IP, route..."
                  value={searchQuery}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>

              <div className="flex flex-wrap gap-2" style={{ display: isFilterOpen ? "flex" : "none" }}>
                <Select
                  value={filters.category || "all"}
                  onValueChange={(value) => handleFilterChange("category", value === "all" ? undefined : value)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                    <SelectItem value="authorization">Authorization</SelectItem>
                    <SelectItem value="network">Network</SelectItem>
                    <SelectItem value="application">Application</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.severity || "all"}
                  onValueChange={(value) => handleFilterChange("severity", value === "all" ? undefined : value)}
                >
                  <SelectTrigger className="w-[160px]">
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
                  value={filters.event_type || "all"}
                  onValueChange={(value) => handleFilterChange("event_type", value === "all" ? undefined : value)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Event Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Event Types</SelectItem>
                    <SelectItem value="login_success">Login Success</SelectItem>
                    <SelectItem value="login_failure">Login Failure</SelectItem>
                    <SelectItem value="logout">Logout</SelectItem>
                    <SelectItem value="access_denied">Access Denied</SelectItem>
                    <SelectItem value="privilege_escalation">Privilege Escalation</SelectItem>
                    <SelectItem value="port_scan">Port Scan</SelectItem>
                    <SelectItem value="api_abuse">API Abuse</SelectItem>
                    <SelectItem value="bot_detected">Bot Detected</SelectItem>
                    <SelectItem value="sensitive_action">Sensitive Action</SelectItem>
                    <SelectItem value="session_anomaly">Session Anomaly</SelectItem>
                  </SelectContent                >
                </Select>

                <Input
                  placeholder="User ID"
                  value={(filters.user_id as string) || ""}
                  onChange={(e) => handleFilterChange("user_id", e.target.value || undefined)}
                  className="w-[160px]"
                />

                <Input
                  placeholder="IP Address"
                  value={(filters.ip as string) || ""}
                  onChange={(e) => handleFilterChange("ip", e.target.value || undefined)}
                  className="w-[160px]"
                />

                <Input
                  placeholder="Route"
                  value={(filters.route as string) || ""}
                  onChange={(e) => handleFilterChange("route", e.target.value || undefined)}
                  className="w-[160px]"
                />

                <Select
                  value={filters.method || "all"}
                  onValueChange={(value) => handleFilterChange("method", value === "all" ? undefined : value)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Event Stream</CardTitle>
              <Badge variant="secondary">{combinedEvents.length} events</Badge>
            </div>
            <CardDescription>
              {eventsResponse !== undefined
                ? `Showing ${combinedEvents.length} of ${eventsResponse.total} events`
                : "Loading..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && eventsResponse === undefined ? (
              <div className="p-8 text-center">
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 bg-muted rounded" />
                  ))}
                </div>
              </div>
            ) : isError ? (
              <div className="p-8 text-center text-destructive">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Failed to load events</p>
                <p className="text-sm text-muted-foreground mt-1">{error?.message}</p>
                <Button className="mt-4" variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            ) : combinedEvents.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No events found</p>
                <p className="text-sm mt-1">
                  {hasActiveFilters || searchQuery
                    ? "Try adjusting your filters or search query"
                    : "Ingest events via API to see them here"}
                </p>
              </div>
            ) : (
              <div className="max-h-[700px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Time</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead className="hidden md:table-cell">Route</TableHead>
                      <TableHead className="hidden lg:table-cell">Method</TableHead>
                      <TableHead className="hidden lg:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedEvents.map((event) => (
                      <TableRow key={event.id} className="hover:bg-muted/50 transition-colors">
                        <TableCell className="font-mono text-sm whitespace-nowrap">
                          {formatTimestamp(event.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{event.category}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{event.event_type}</TableCell>
                        <TableCell>
                          <Badge variant={getSeverityBadgeVariant(event.severity)}>{event.severity}</Badge>
                        </TableCell>
                        <TableCell>{event.user_id || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">{event.ip || "-"}</TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-sm truncate max-w-xs">
                          {event.route || "-"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{event.method || "-"}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {event.status_code ? (
                            <Badge variant={event.status_code >= 400 ? "destructive" : "default"}>
                              {event.status_code}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Load More Pagination */}
                {(eventsResponse?.total ?? 0) > (filters.offset || 0) + (filters.limit || 50) && !isLoading && (
                  <div className="p-4 border-t">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={loadMore}
                      disabled={isLoading}
                    >
                      Load More ({combinedEvents.length} of {eventsResponse?.total})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
    </>
  );
}