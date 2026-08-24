import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { LandingPage } from "@/pages/Landing";
import { GetStartedPage } from "@/pages/GetStarted";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { EventsPage } from "@/pages/Events";
import { AlertsPage } from "@/pages/Alerts";
import { IncidentsPage } from "@/pages/Incidents";
import { SourcesPage } from "@/pages/Sources";
import { SettingsPage } from "@/pages/Settings";
import { hasUserApiKey } from "@/auth";

/**
 * RequireAuth - gate for all dashboard routes.
 * Redirects to /login when this browser has no stored API key.
 */
function RequireAuth() {
  const location = useLocation();
  if (!hasUserApiKey()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
}

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/get-started" element={<GetStartedPage />} />

      {/* Dashboard (requires a source API key) */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
