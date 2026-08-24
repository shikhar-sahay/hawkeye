"use client";

import * as React from "react";
import { StatsDashboard } from "@/components/StatsDashboard";
import { PageContainer } from "@/components/ui";

/** Auto-refresh interval from Settings (seconds, 0 = disabled). Default 60s. */
function getAutoRefreshInterval(): number {
  if (typeof window === "undefined") return 60000;
  const saved = parseInt(localStorage.getItem("hawkeye_auto_refresh") ?? "60", 10);
  return Number.isNaN(saved) || saved <= 0 ? 0 : saved * 1000;
}

export function DashboardPage() {
  const [refreshInterval] = React.useState(getAutoRefreshInterval);
  return (
    <PageContainer title="Dashboard" description="Overview of your security posture">
      <StatsDashboard initialTimeRange="24h" refreshInterval={refreshInterval} />
    </PageContainer>
  );
}

