"use client";

import { SourceManager } from "@/components/SourceManager";
import { PageContainer } from "@/components/ui";

export function SourcesPage() {
  return (
    <PageContainer title="Sources" description="Manage application sources and API keys">
      <SourceManager />
    </PageContainer>
  );
}