"use client";

import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Activity,
  AlertTriangle,
  FileText,
  Server,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Live Events", href: "/events", icon: Activity },
  { name: "Alerts", href: "/alerts", icon: AlertTriangle },
  { name: "Incidents", href: "/incidents", icon: FileText },
  { name: "Sources", href: "/sources", icon: Server },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className={cn("flex h-16 items-center justify-center border-b px-4", collapsed && "justify-center")}>
          <NavLink to="/" className="flex items-center gap-2" aria-label="Hawkeye Dashboard">
            <Logo size={28} />
            {!collapsed && (
              <span className="text-xl font-bold tracking-tight text-foreground">Hawkeye</span>
            )}
          </NavLink>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4 overflow-y-auto" aria-label="Main navigation">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || (item.href !== "/" && location.pathname.startsWith(item.href));
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive: active }) => cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center px-2"
                )}
                title={collapsed ? item.name : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                {!collapsed && <span>{item.name}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Toggle button */}
        <div className="border-t p-4">
          <Button
            variant="ghost"
            size="icon"
            className={cn("w-full justify-center", collapsed && "rotate-180")}
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}