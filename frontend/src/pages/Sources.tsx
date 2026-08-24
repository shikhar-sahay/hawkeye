"use client";

import { SourceManager } from "@/components/SourceManager";
import { PageContainer } from "@/components/ui";
import { useDocumentTitle } from "@/hooks/useRouteMeta";

export function SourcesPage() {
  useDocumentTitle("Sources");
  return (
    <PageContainer title="Sources" description="Manage application sources and API keys">
      <SourceManager />
    </PageContainer>
  );
}