"use client";

import { StatsDashboard } from "@/components/StatsDashboard";
import { PageContainer } from "@/components/ui";

export function DashboardPage() {
  return (
    <PageContainer title="Dashboard" description="Overview of your security posture">
      <StatsDashboard initialTimeRange="24h" refreshInterval={60000} />
    </PageContainer>
  );
}
