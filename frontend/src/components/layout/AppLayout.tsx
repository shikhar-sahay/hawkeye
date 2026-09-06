"use client";

import * as React from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import { BackendReadyGate } from "@/components/BackendWakingScreen";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { UNAUTHORIZED_EVENT, clearStoredApiKey } from "@/auth";

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("hawkeye_sidebar_collapsed") === "true";
  });
  const location = useLocation();
  const navigate = useNavigate();

  // If the backend rejects our API key (expired/revoked), return to login
  React.useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredApiKey();
      navigate("/login", {
        replace: true,
        state: { from: location.pathname + location.search, message: "Your session is no longer valid. Please sign in again." },
      });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    // location changes are handled by navigate() reading latest at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("hawkeye_sidebar_collapsed", String(!prev));
      return !prev;
    });
  };

  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-background">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content
        </a>
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebarCollapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        {/* Main content area */}
        <div
          className={cn(
            "min-h-screen transition-[margin] duration-200",
            sidebarCollapsed ? "lg:ml-16" : "lg:ml-60"
          )}
        >
          {/* Top Navigation */}
          <TopNav
            onMenuClick={() => setMobileOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
          />

          {/* Page content */}
          <main
            id="main-content"
            className={cn(
              "pt-14 min-h-screen transition-all duration-200",
              "lg:pr-6 pb-6"
            )}
          >
            <div className="max-w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              <BackendReadyGate>
                <Outlet />
              </BackendReadyGate>
            </div>
          </main>
        </div>

        {/* Toaster for notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            className: "bg-popover text-popover-foreground border-border",
          }}
        />
      </div>
    </WebSocketProvider>
  );
}