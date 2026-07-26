"use client";

import * as React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const location = useLocation();

  // Close sidebar on mobile when navigating
  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleSidebarCollapsed = () => setSidebarCollapsed(!sidebarCollapsed);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebarCollapsed}
      />

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main content area */}
      <div
        className={cn(
          "min-h-screen transition-all duration-200",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        )}
      >
        {/* Top Navigation */}
        <TopNav
          onMenuClick={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* Page content */}
        <main
          className={cn(
            "pt-16 min-h-screen transition-all duration-200",
            sidebarCollapsed ? "lg:ml-16 lg:pl-6" : "lg:ml-64 lg:pl-6",
            "pr-6 pb-6"
          )}
          role="main"
        >
          <Outlet />
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
  );
}