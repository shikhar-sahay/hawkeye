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

// Static imports for debugging - lazy imports fail because components use named exports
import { AlertsOverTimeChart } from "@/components/charts/AlertsOverTimeChart";
import { SeverityDistributionChart } from "@/components/charts/SeverityDistributionChart";
import { DetectionTypeChart } from "@/components/charts/DetectionTypeChart";
import { MITRECoverageChart } from "@/components/charts/MITRECoverageChart";
import { EventsBySourceChart } from "@/components/charts/EventsBySourceChart";

// DEBUG: Custom hook to trace query execution
function useDebugQuery<T>(queryKey: string[], queryFn: () => Promise<T>, options: any = {}) {
  const result = useQuery({
    queryKey,
    queryFn: async () => {
      console.log(`[DEBUG] Query START: ${queryKey.join("/")}`);
      try {
        const data = await queryFn();
        console.log(`[DEBUG] Query SUCCESS: ${queryKey.join("/")}`, data);
        return data;
      } catch (error) {
        console.error(`[DEBUG] Query ERROR: ${queryKey.join("/")}`, error);
        throw error;
      }
    },
    ...options,
  });

  // Log status changes
  React.useEffect(() => {
    console.log(`[DEBUG] Query STATUS: ${queryKey.join("/")} - isLoading: ${result.isLoading}, isError: ${result.isError}, isSuccess: ${result.isSuccess}`, result.error);
  }, [result.isLoading, result.isError, result.isSuccess, result.error, queryKey.join("/")]);

  return result;
}

interface StatsDashboardProps {
  /** Time range for time-series data */
  timeRange?: "24h" | "7d" | "30d";
  /** Refresh interval in ms */
  refreshInterval?: number;
}

/**
 * StatsDashboard - Main statistics dashboard component
 * Displays KPI cards and charts for SOC overview
 */
export function StatsDashboard({ timeRange = "24h", refreshInterval = 60000 }: StatsDashboardProps) {
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
  const { data: mitreCoverage, isLoading: mitreCoverageLoading, error: mitreCoverageError } = useQuery({
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
  const { data: alertsOverTime, isLoading: alertsOverTimeLoading, error: alertsOverTimeError } = useQuery({
    queryKey: queryKeys.alerts.overTime(hours),
    queryFn: () => apiClient.getAlertsOverTime(hours),
    refetchInterval: refreshInterval,
    staleTime: 30000,
  });

  const isLoading = statsLoading || alertStatsLoading || incidentStatsLoading || sourceEventCountsLoading || alertsOverTimeLoading || mitreCoverageLoading;
  const hasError = statsError || alertStatsError || incidentStatsError || sourceEventCountsError;

  // DEBUG: Log query states
  React.useEffect(() => {
    console.log('[DEBUG] StatsDashboard render:', {
      statsLoading, statsError,
      alertStatsLoading, alertStatsError,
      incidentStatsLoading, incidentStatsError,
      sourceEventCountsLoading, sourceEventCountsError,
      alertsOverTimeLoading, alertsOverTimeError,
      mitreCoverageLoading, mitreCoverageError,
      hasError,
      isLoading,
      dashboardStats,
      alertStats,
      incidentStats,
    });
  }, [statsLoading, statsError, alertStatsLoading, alertStatsError, incidentStatsLoading, incidentStatsError, hasError, isLoading]);

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
          value={dashboardStats?.events_24h ? formatNumber(dashboardStats.events_24h) : "—"}
          subtitle="Last 24 hours"
          icon={Activity}
          trend={dashboardStats?.events_24h && dashboardStats.events_24h > 0 ? "up" : "neutral"}
        />
        <StatCard
          title="Active Alerts"
          value={alertStats ? formatNumber(alertStats.open + alertStats.acknowledged) : "—"}
          subtitle={alertStats ? `${alertStats.open} open, ${alertStats.acknowledged} acknowledged` : "Loading..."}
          icon={AlertTriangle}
          trend={alertStats && alertStats.open > 10 ? "up" : "neutral"}
          badge={alertStats && alertStats.open > 0 ? <Badge variant="destructive">{alertStats.open} critical</Badge> : null}
        />
        <StatCard
          title="Active Incidents"
          value={incidentStats ? formatNumber(incidentStats.open + incidentStats.investigating) : "—"}
          subtitle={incidentStats ? `${incidentStats.open} open, ${incidentStats.investigating} investigating` : "Loading..."}
          icon={AlertCircle}
          trend={incidentStats && incidentStats.open > 5 ? "up" : "neutral"}
        />
        <StatCard
          title="Registered Sources"
          value={dashboardStats?.sources ? formatNumber(dashboardStats.sources.total) : "—"}
          subtitle={dashboardStats?.sources ? `${dashboardStats.sources.active} active, ${dashboardStats.sources.inactive} inactive` : "Loading..."}
          icon={Server}
        />
        <StatCard
          title="Detection Rate"
          value={alertStats && dashboardStats?.events_24h && dashboardStats.events_24h > 0
            ? `${((alertStats.total / dashboardStats.events_24h) * 100).toFixed(1)}%`
            : "—"}
          subtitle="Alerts per event"
          icon={Gauge}
          trend="neutral"
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
          title="Events Today"
          value={dashboardStats?.events_24h ? formatNumber(dashboardStats.events_24h) : "—"}
          subtitle="Last 24 hours"
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
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">24h</Badge>
              <Badge variant="outline" className="text-xs">7d</Badge>
              <Badge variant="outline" className="text-xs">30d</Badge>
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
                    { name: "critical", value: alertStats.by_severity?.critical || 0, fill: "hsl(var(--destructive))" },
                    { name: "high", value: alertStats.by_severity?.high || 0, fill: "hsl(var(--warning))" },
                    { name: "medium", value: alertStats.by_severity?.medium || 0, fill: "hsl(var(--accent))" },
                    { name: "low", value: alertStats.by_severity?.low || 0, fill: "hsl(var(--primary))" },
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
  const openIncidents = incidentStats?.open || 0;

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
              <p className="font-medium">Total Alerts (24h)</p>
              <p className="text-sm text-muted-foreground">All severity levels combined</p>
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