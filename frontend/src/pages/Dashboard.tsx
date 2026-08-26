"use client";

import * as React from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { StatsDashboard } from "@/components/StatsDashboard";
import { PageContainer } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/useRouteMeta";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Auto-refresh interval from Settings (seconds, 0 = disabled). Default 60s. */
function getAutoRefreshInterval(): number {
  if (typeof window === "undefined") return 60000;
  const saved = parseInt(localStorage.getItem("hawkeye_auto_refresh") ?? "60", 10);
  return Number.isNaN(saved) || saved <= 0 ? 0 : saved * 1000;
}

/** Query-key prefixes owned by the dashboard views. */
const dashboardKeyPrefixes = [
  ["dashboard"],
  ["alerts", "stats"],
  ["alerts", "over-time"],
  ["alerts", "mitre-coverage"],
  ["incidents", "stats"],
  ["sources", "event-counts"],
];

export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const [refreshInterval] = React.useState(getAutoRefreshInterval);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // True while any dashboard query is actively fetching (manual or interval)
  const isFetchingDashboard = useIsFetching({
    predicate: (query) =>
      dashboardKeyPrefixes.some((prefix) =>
        prefix.every((seg, i) => query.queryKey[i] === seg)
      ),
  });

  // Manual refresh: invalidates every dashboard query so TanStack refetches
  // from the network (cached data is marked stale and replaced, not re-rendered).
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.all(
        dashboardKeyPrefixes.map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        )
      );
      toast({ title: "Dashboard refreshed", description: "All statistics were reloaded from the API." });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Could not refresh dashboard data.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <PageContainer
      title="Dashboard"
      description="Overview of your security posture"
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing || isFetchingDashboard > 0}
          aria-label="Refresh dashboard data"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", (isRefreshing || isFetchingDashboard > 0) && "animate-spin")} />
          Refresh
        </Button>
      }
    >
      <StatsDashboard initialTimeRange="24h" refreshInterval={refreshInterval} />
    </PageContainer>
  );
}
