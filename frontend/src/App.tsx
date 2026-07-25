import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/Dashboard";
import { EventsPage } from "@/pages/Events";

function FeaturePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
        HawkEye
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route
            path="alerts"
            element={<FeaturePlaceholder title="Alerts" description="Live alert management will land in the next dashboard pass." />}
          />
          <Route
            path="incidents"
            element={<FeaturePlaceholder title="Incidents" description="Incident timelines and response workflows are coming next." />}
          />
          <Route
            path="sources"
            element={<FeaturePlaceholder title="Sources" description="Source and API key management will be wired up against the backend APIs." />}
          />
          <Route
            path="api-keys"
            element={<FeaturePlaceholder title="API Keys" description="API key lifecycle controls will be added once the source views are wired." />}
          />
          <Route
            path="settings"
            element={<FeaturePlaceholder title="Settings" description="Application settings and user preferences will live here." />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
