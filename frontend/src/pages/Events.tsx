"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function EventsPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedCategory, setSelectedCategory] = React.useState("all");

  const categories = ["all", "authentication", "authorization", "network", "application", "system"];

  // Placeholder data
  const events = [
    { id: 1, timestamp: "2026-07-25T10:30:00Z", category: "authentication", eventType: "login_success", severity: "low", userId: "user123", ip: "192.168.1.1", route: "/api/login", method: "POST", status: 200 },
    { id: 2, timestamp: "2026-07-25T10:31:00Z", category: "authorization", eventType: "access_denied", severity: "medium", userId: "user123", ip: "192.168.1.1", route: "/api/admin", method: "GET", status: 403 },
    { id: 3, timestamp: "2026-07-25T10:32:00Z", category: "network", eventType: "port_scan", severity: "high", userId: null, ip: "10.0.0.50", route: null, method: null, status: null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Events</h1>
          <p className="text-muted-foreground">Real-time event stream from all sources</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" size="sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex h-10 w-full max-w-xs items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "all" ? "All Categories" : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle>Event Stream</CardTitle>
          <CardDescription>
            {events.length} events displayed. Connect to WebSocket for real-time updates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No events found. Ingest events via API to see them here.
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-sm">{new Date(event.timestamp).toLocaleTimeString()}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{event.category}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{event.eventType}</TableCell>
                      <TableCell>
                        <Badge variant={event.severity as any}>{event.severity}</Badge>
                      </TableCell>
                      <TableCell>{event.userId || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{event.ip || "-"}</TableCell>
                      <TableCell className="font-mono text-sm truncate max-w-xs">{event.route || "-"}</TableCell>
                      <TableCell>{event.method || "-"}</TableCell>
                      <TableCell>{event.status || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}