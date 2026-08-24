"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  AlertCircle,
  Server,
  Gauge,
  Target,
  TrendingUp,
  ExternalLink,
  Shield,
  Activity,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { apiClient, queryKeys } from "@/api/client";
import type { AlertStats, IncidentStats } from "@/types";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

// Lazy-loaded chart components for code-splitting
const AlertsOverTimeChart = React.lazy(() => import("@/components/charts/AlertsOverTimeChart").then((m) => ({ default: m.default })));
const SeverityDistributionChart = React.lazy(() => import("@/components/charts/SeverityDistributionChart").then((m) => ({ default: m.default })));
const DetectionTypeChart = React.lazy(() => import("@/components/charts/DetectionTypeChart").then((m) => ({ default: m.default })));
const MITRECoverageChart = React.lazy(() => import("@/components/charts/MITRECoverageChart").then((m) => ({ default: m.default })));
const EventsBySourceChart = React.lazy(() => import("@/components/charts/EventsBySourceChart").then((m) => ({ default: m.default })));

interface StatsDashboardProps {
  /** Initial time range for time-series data */
  initialTimeRange?: "24h" | "7d" | "30d";
  /** Refresh interval in ms */
  refreshInterval?: number;
}

/**
 * StatsDashboard - Main statistics dashboard component
 * Displays KPI cards and charts for SOC overview
 */
export function StatsDashboard({ initialTimeRange = "24h", refreshInterval = 60000 }: StatsDashboardProps) {
  const [timeRange, setTimeRange] = React.useState<"24h" | "7d" | "30d">(initialTimeRange);
  // Fetch dashboard stats
  const { data: dashboardStats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: () => apiClient.getDashboardStats(),
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  // Fetch alert stats for severity distribution
  const { data: alertStats, isLoading: alertStatsLoading, error: alertStatsError } = useQuery({
    queryKey: queryKeys.alerts.stats,
    queryFn: () => apiClient.getAlertStats(),
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  // Fetch incident stats
  const { data: incidentStats, isLoading: incidentStatsLoading, error: incidentStatsError } = useQuery({
    queryKey: queryKeys.incidents.stats,
    queryFn: () => apiClient.getIncidentStats(),
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  // Fetch MITRE coverage stats
  const { data: mitreCoverage, isLoading: mitreCoverageLoading } = useQuery({
    queryKey: ["alerts", "mitre-coverage"],
    queryFn: () => apiClient.getMITRECoverage(),
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  // Fetch source event counts
  const { data: sourceEventCounts, isLoading: sourceEventCountsLoading, error: sourceEventCountsError } = useQuery({
    queryKey: ["sources", "event-counts"],
    queryFn: () => apiClient.getSourceEventCounts(),
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  // Fetch alerts over time for time-series chart
  const hours = timeRange === "24h" ? 24 : timeRange === "7d" ? 168 : 720;
  const { data: alertsOverTime, isLoading: alertsOverTimeLoading } = useQuery({
    queryKey: queryKeys.alerts.overTime(hours),
    queryFn: () => apiClient.getAlertsOverTime(hours),
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  const isLoading = statsLoading || alertStatsLoading || incidentStatsLoading || sourceEventCountsLoading || alertsOverTimeLoading || mitreCoverageLoading;
  const hasError = statsError || alertStatsError || incidentStatsError || sourceEventCountsError;

  // Build source data for events by source chart
  const sourceChartData = React.useMemo(() => {
    if (!sourceEventCounts) return [];
    return sourceEventCounts.map((source) => ({
      name: source.source_name,
      events: source.event_count,
      alerts: source.alert_count,
      incidents: source.incident_count,
      isActive: source.is_active,
    }));
  }, [sourceEventCounts]);

  if (hasError) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="Failed to load dashboard"
          description="Unable to fetch statistics data. Please try again later."
          action={{
            label: "Retry",
            onClick: () => window.location.reload(),
          }}
          icon={<AlertTriangle className="h-12 w-12 text-destructive" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard
          title="Total Events"
          value={dashboardStats?.events_24h !== undefined ? formatNumber(dashboardStats.events_24h || 0) : "—"}
          subtitle="All events on record"
          icon={Activity}
        />
        <StatCard
          title="Active Alerts"
          value={alertStats ? formatNumber((alertStats.by_status?.new || 0) + (alertStats.by_status?.processing || 0)) : "—"}
          subtitle={alertStats ? `${alertStats.by_status?.new || 0} new, ${alertStats.by_status?.processing || 0} processing` : undefined}
          icon={AlertTriangle}
          badge={alertStats && (alertStats.by_severity?.critical || 0) > 0 ? <Badge variant="destructive">{alertStats.by_severity?.critical || 0} critical</Badge> : null}
        />        <StatCard
          title="Active Incidents"
          value={incidentStats ? formatNumber((incidentStats.by_status?.open || 0) + (incidentStats.by_status?.investigating || 0)) : "—"}
          subtitle={incidentStats ? `${incidentStats.by_status?.open || 0} open, ${incidentStats.by_status?.investigating || 0} investigating` : undefined}
          icon={AlertCircle}
        />
        <StatCard
          title="Registered Sources"
          value={dashboardStats?.sources ? formatNumber(dashboardStats.sources.total) : "—"}
          subtitle={dashboardStats?.sources ? `${dashboardStats.sources.active} active, ${dashboardStats.sources.inactive} inactive` : undefined}
          icon={Server}
        />
        <StatCard
          title="Detection Rate"
          value={alertStats && dashboardStats?.events_24h && dashboardStats.events_24h > 0
            ? `${((alertStats.total / dashboardStats.events_24h) * 100).toFixed(1)}%`
            : "—"}
          subtitle="Alerts per event"
          icon={Gauge}
        />
        <StatCard
          title="Avg Confidence"
          value={alertStats && alertStats.avg_confidence !== undefined && alertStats.avg_confidence !== null
            ? `${Math.round(alertStats.avg_confidence * 100)}%`
            : "—"}
          subtitle="Across all detections"
          icon={Target}
        />
        <StatCard
          title="Resolved Alerts"
          value={alertStats ? formatNumber(alertStats.by_status?.resolved || 0) : "—"}
          subtitle={`${formatNumber(alertStats?.by_status?.suppressed || 0)} suppressed`}
          icon={TrendingUp}
        />
      </div>

      {/* Charts Row 1: Alerts Over Time + Severity Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Alerts Over Time
            </CardTitle>
            <div className="flex items-center gap-1" role="group" aria-label="Time range selection">
              <button
                type="button"
                onClick={() => setTimeRange("24h")}
                className={`badge cursor-pointer transition-colors px-2 py-1 text-xs ${timeRange === "24h" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
                aria-pressed={timeRange === "24h"}
              >
                24h
              </button>
              <button
                type="button"
                onClick={() => setTimeRange("7d")}
                className={`badge cursor-pointer transition-colors px-2 py-1 text-xs ${timeRange === "7d" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
                aria-pressed={timeRange === "7d"}
              >
                7d
              </button>
              <button
                type="button"
                onClick={() => setTimeRange("30d")}
                className={`badge cursor-pointer transition-colors px-2 py-1 text-xs ${timeRange === "30d" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
                aria-pressed={timeRange === "30d"}
              >
                30d
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ height: 300 }}>
              <React.Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Skeleton className="h-[300px] w-full" /></div>}>
                <AlertsOverTimeChart
                  data={alertsOverTime || []}
                  isLoading={alertsOverTimeLoading}
                />
              </React.Suspense>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Severity Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 280 }}>
              <React.Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Skeleton className="h-[280px] w-full" /></div>}>
                <SeverityDistributionChart
                  data={alertStats ? [
                    { name: "critical", value: alertStats.by_severity?.critical || 0 },
                    { name: "high", value: alertStats.by_severity?.high || 0 },
                    { name: "medium", value: alertStats.by_severity?.medium || 0 },
                    { name: "low", value: alertStats.by_severity?.low || 0 },
                  ] : []}
                  isLoading={isLoading}
                />
              </React.Suspense>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Detection Types + MITRE Coverage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-4 w-4" />
              Alerts by Detection Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 300 }}>
              <React.Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Skeleton className="h-[300px] w-full" /></div>}>
                <DetectionTypeChart
                  data={alertStats ? Object.entries(alertStats.by_detection_type || {}).map(([name, value]) => ({
                    name,
                    value,
                  })) : []}
                  isLoading={isLoading}
                />
              </React.Suspense>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              MITRE ATT&CK Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 300 }}>
              <React.Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Skeleton className="h-[300px] w-full" /></div>}>
                <MITRECoverageChart
                  data={mitreCoverage ? [
                    ...Object.entries(mitreCoverage.by_tactic).map(([name, value]) => ({ name, value, type: "tactic" as const })),
                    ...Object.entries(mitreCoverage.by_technique).map(([name, value]) => ({ name, value, type: "technique" as const })),
                  ] : []}
                  isLoading={mitreCoverageLoading}
                />
              </React.Suspense>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 3: Events by Source + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-4 w-4" />
              Events by Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 250 }}>
              <React.Suspense fallback={<div className="h-full w-full flex items-center justify-center"><Skeleton className="h-[250px] w-full" /></div>}>
                <EventsBySourceChart
                  data={sourceChartData}
                  isLoading={sourceEventCountsLoading}
                />
              </React.Suspense>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RecentActivityPanel
              alertStats={alertStats}
              incidentStats={incidentStats}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * RecentActivityPanel - Shows recent alerts and incidents summary
 */
function RecentActivityPanel({
  alertStats,
  incidentStats,
  isLoading,
}: {
  alertStats?: AlertStats;
  incidentStats?: IncidentStats;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const totalAlerts = alertStats?.total || 0;
  const totalIncidents = incidentStats?.total || 0;
  const criticalAlerts = alertStats?.by_severity?.critical || 0;
  const openIncidents = incidentStats?.by_status?.open || 0;

  return (
    <ScrollArea className="h-[250px] p-4 space-y-3">
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="font-medium">Critical Alerts</p>
              <p className="text-sm text-muted-foreground">{criticalAlerts} requiring immediate attention</p>
            </div>
          </div>
          <span className="font-mono text-lg font-bold text-destructive">{criticalAlerts}</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="font-medium">Open Incidents</p>
              <p className="text-sm text-muted-foreground">{openIncidents} incidents under investigation</p>
            </div>
          </div>
          <span className="font-mono text-lg font-bold text-orange-500">{openIncidents}</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Total Alerts</p>
              <p className="text-sm text-muted-foreground">All statuses combined</p>
            </div>
          </div>
          <span className="font-mono text-lg font-bold">{totalAlerts}</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary/10 rounded-lg">
              <ExternalLink className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="font-medium">Total Incidents</p>
              <p className="text-sm text-muted-foreground">All statuses combined</p>
            </div>
          </div>
          <span className="font-mono text-lg font-bold">{totalIncidents}</span>
        </div>
      </div>
    </ScrollArea>
  );
}