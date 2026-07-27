"use client";

import { StatsDashboard } from "@/components/StatsDashboard";
import { PageContainer } from "@/components/ui";

export function DashboardPage() {
  return (
    <PageContainer title="Dashboard" description="Overview of your security posture">
      <StatsDashboard timeRange="24h" refreshInterval={60000} />
    </PageContainer>
  );
}