"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, FileText, Server, Key, Settings } from "lucide-react";

export function DashboardPage() {
  const stats = [
    { title: "Total Alerts", value: "0", icon: AlertTriangle, color: "text-destructive" },
    { title: "Open Incidents", value: "0", icon: FileText, color: "text-primary" },
    { title: "Active Sources", value: "0", icon: Server, color: "text-green-500" },
    { title: "Events (24h)", value: "0", icon: Activity, color: "text-blue-500" },
  ];

  const quickActions = [
    { name: "Live Events", href: "/events", icon: Activity, description: "View real-time event stream" },
    { name: "Alerts", href: "/alerts", icon: AlertTriangle, description: "Manage security alerts" },
    { name: "Incidents", href: "/incidents", icon: FileText, description: "Investigate incidents" },
    { name: "Sources", href: "/sources", icon: Server, description: "Configure data sources" },
    { name: "API Keys", href: "/api-keys", icon: Key, description: "Manage API credentials" },
    { name: "Settings", href: "/settings", icon: Settings, description: "Application settings" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your security posture</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">No data available</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Card
              key={action.name}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => window.location.href = action.href}
            >
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <action.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-medium">{action.name}</h3>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
          <CardDescription>Latest security alerts from all sources</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No alerts yet. Connect a data source to start monitoring.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}