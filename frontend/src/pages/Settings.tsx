"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Save,
  Loader2,
  Key,
  Server,
  Monitor,
  Wifi,
  Info,
  Database,
  Shield,
  Bell,
  GitBranch,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const APP_VERSION = "2.0.0";
const BUILD_DATE = "2026-07-27";

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  // Local state
  const [apiEndpoint, setApiEndpoint] = React.useState("");
  const [storedApiKey, setStoredApiKey] = React.useState("");
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [autoRefreshInterval, setAutoRefreshInterval] = React.useState(60);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  // Load settings from localStorage on mount
  React.useEffect(() => {
    const savedEndpoint = localStorage.getItem("hawkeye_api_endpoint");
    const savedKey = localStorage.getItem("hawkeye_api_key");
    const savedNotifications = localStorage.getItem("hawkeye_notifications");
    const savedRefresh = localStorage.getItem("hawkeye_auto_refresh");
    const savedSidebar = localStorage.getItem("hawkeye_sidebar_collapsed");

    if (savedEndpoint) setApiEndpoint(savedEndpoint);
    if (savedKey) setStoredApiKey(savedKey);
    if (savedNotifications !== null) setNotificationsEnabled(savedNotifications === "true");
    if (savedRefresh) setAutoRefreshInterval(parseInt(savedRefresh, 10));
    if (savedSidebar !== null) setSidebarCollapsed(savedSidebar === "true");
  }, []);

  // Test API connection
  const testConnection = async () => {
    if (!apiEndpoint.trim()) {
      toast({ title: "No endpoint", description: "Please enter an API endpoint first.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${apiEndpoint.replace(/\/$/, "")}/health`);
      if (response.ok) {
        toast({ title: "Connection successful", description: "API endpoint is reachable." });
      } else {
        toast({ title: "Connection failed", description: `HTTP ${response.status}`, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Connection failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Save all settings
  const saveSettings = () => {
    setIsSaving(true);
    try {
      localStorage.setItem("hawkeye_api_endpoint", apiEndpoint);
      localStorage.setItem("hawkeye_api_key", storedApiKey);
      localStorage.setItem("hawkeye_notifications", String(notificationsEnabled));
      localStorage.setItem("hawkeye_auto_refresh", String(autoRefreshInterval));
      localStorage.setItem("hawkeye_sidebar_collapsed", String(sidebarCollapsed));

      // Apply theme
      if (theme) setTheme(theme);

      toast({ title: "Settings saved", description: "Your preferences have been updated." });
    } catch (error) {
      toast({ title: "Failed to save", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Copy API key to clipboard
  const copyApiKey = () => {
    if (storedApiKey) {
      navigator.clipboard.writeText(storedApiKey);
      toast({ title: "Copied", description: "API key copied to clipboard." });
    }
  };

  // Clear API key
  const clearApiKey = () => {
    setStoredApiKey("");
    localStorage.removeItem("hawkeye_api_key");
    toast({ title: "Cleared", description: "Stored API key has been removed." });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your Hawkeye dashboard preferences
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">
            <Monitor className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="api">
            <Server className="h-4 w-4 mr-2" />
            API Connection
          </TabsTrigger>
          <TabsTrigger value="websocket">
            <Wifi className="h-4 w-4 mr-2" />
            WebSocket
          </TabsTrigger>
          <TabsTrigger value="about">
            <Info className="h-4 w-4 mr-2" />
            About
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how the dashboard looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Theme</Label>
                  <p className="text-sm text-muted-foreground">Choose your preferred color scheme</p>
                </div>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Sidebar State</Label>
                  <p className="text-sm text-muted-foreground">Remember sidebar collapsed state</p>
                </div>
                <Switch
                  checked={sidebarCollapsed}
                  onCheckedChange={setSidebarCollapsed}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configure notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground">Show toast notifications for alerts and updates</p>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Auto Refresh Interval</Label>
                  <p className="text-sm text-muted-foreground">How often to refresh data automatically (seconds)</p>
                </div>
                <Select value={String(autoRefreshInterval)} onValueChange={(v) => setAutoRefreshInterval(parseInt(v, 10))}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 seconds</SelectItem>
                    <SelectItem value="60">1 minute</SelectItem>
                    <SelectItem value="120">2 minutes</SelectItem>
                    <SelectItem value="300">5 minutes</SelectItem>
                    <SelectItem value="600">10 minutes</SelectItem>
                    <SelectItem value="0">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data & Privacy</CardTitle>
              <CardDescription>Manage local data storage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Clear All Local Data</Label>
                  <p className="text-sm text-muted-foreground">Remove all cached data, settings, and stored keys</p>
                </div>
                <Button variant="destructive" onClick={() => {
                  if (confirm("This will clear ALL local data including API keys. Are you sure?")) {
                    localStorage.clear();
                    toast({ title: "Data cleared", description: "All local data has been removed. Please refresh the page." });
                  }
                }}>
                  Clear Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Connection Settings */}
        <TabsContent value="api" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Endpoint</CardTitle>
              <CardDescription>Configure the backend API endpoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-endpoint">API Base URL</Label>
                <Input
                  id="api-endpoint"
                  placeholder="https://api.hawkeye.example.com/api/v1"
                  value={apiEndpoint}
                  onChange={(e) => setApiEndpoint(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  The base URL for the Hawkeye REST API. Include the version path (e.g., /api/v1).
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={testConnection} disabled={isSaving || !apiEndpoint.trim()}>
                  <Loader2 className="h-4 w-4 mr-2" />
                  Test Connection
                </Button>
                <Button variant="outline" onClick={() => setApiEndpoint(window.location.origin + "/api/v1")}>
                  Use Current Origin
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stored API Key</CardTitle>
              <CardDescription>Store an API key for authenticated requests</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder="Enter your API key (starts with hk_)"
                    value={storedApiKey}
                    onChange={(e) => setStoredApiKey(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? "Hide key" : "Show key"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  This key is stored locally in your browser and used for authenticated API requests.
                  Get your API key from the Sources page.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={copyApiKey} disabled={!storedApiKey}>
                  <Key className="h-4 w-4 mr-2" />
                  Copy Key
                </Button>
                <Button variant="destructive" onClick={clearApiKey} disabled={!storedApiKey}>
                  Clear Key
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WebSocket Settings */}
        <TabsContent value="websocket" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>WebSocket Connection</CardTitle>
              <CardDescription>Real-time connection status and diagnostics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-background flex items-center justify-center">
                  <Wifi className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Connection Status</span>
                    <span className="font-mono text-sm text-muted-foreground">
                      Configure API key to connect
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    WebSocket connection for real-time alerts and incidents
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled>
                  Connect
                </Button>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">WebSocket URL</span>
                  </div>
                  <code className="text-sm text-muted-foreground font-mono break-all">
                    {window.location.protocol === "https:" ? "wss:" : "ws:"}//{window.location.host}/ws
                  </code>
                </div>

                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Auto-Reconnect</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enabled with exponential backoff (max 30s delay)
                  </p>
                </div>

                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Authentication</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {storedApiKey ? "API Key configured" : "No API key stored"}
                  </p>
                </div>

                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Subscriptions</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Alerts, Incidents
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connection Diagnostics</CardTitle>
              <CardDescription>Debug WebSocket connection issues</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Button variant="outline" className="justify-start gap-2">
                  <Wifi className="h-4 w-4" />
                  Run Connection Test
                </Button>
                <Button variant="outline" className="justify-start gap-2">
                  <GitBranch className="h-4 w-4" />
                  View Connection Logs
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Connection diagnostics will be available in a future update.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* About Settings */}
        <TabsContent value="about" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Information</CardTitle>
              <CardDescription>Version and build details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Version</span>
                  </div>
                  <p className="font-mono text-lg font-medium">{APP_VERSION}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Build Date</span>
                  </div>
                  <p className="font-mono text-lg font-medium">{BUILD_DATE}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Environment</span>
                  </div>
                  <p className="font-mono text-lg font-medium">
                    {process.env.NODE_ENV === "production" ? "Production" : "Development"}
                  </p>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">User Agent</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground truncate max-w-xs">
                    {typeof navigator !== "undefined" ? navigator.userAgent : "Unknown"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Links & Resources</CardTitle>
              <CardDescription>Helpful links for development and support</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-muted-foreground cursor-not-allowed"
                      disabled
                      aria-disabled="true"
                    >
                      <div className="flex items-center gap-3">
                        <GitBranch className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">GitHub Repository</p>
                          <p className="text-sm text-muted-foreground">Source code and issues (coming soon)</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground opacity-50" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Not yet available — placeholder for future GitHub repo</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-muted-foreground cursor-not-allowed"
                      disabled
                      aria-disabled="true"
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Security Policy</p>
                          <p className="text-sm text-muted-foreground">Report vulnerabilities (coming soon)</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground opacity-50" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Not yet available — placeholder for future security policy</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg text-muted-foreground cursor-not-allowed"
                      disabled
                      aria-disabled="true"
                    >
                      <div className="flex items-center gap-3">
                        <Info className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Documentation</p>
                          <p className="text-sm text-muted-foreground">API reference and guides (coming soon)</p>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground opacity-50" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Not yet available — placeholder for future documentation site</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>Future Settings (Planned)</CardTitle>
              <CardDescription>These sections will be implemented in future milestones</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg opacity-60">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Data Retention</p>
                    <p className="text-sm text-muted-foreground">Configure event/alert retention policies</p>
                  </div>
                </div>
                <Badge variant="secondary">Planned</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg opacity-60">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Alert Rules</p>
                    <p className="text-sm text-muted-foreground">Custom detection thresholds and notifications</p>
                  </div>
                </div>
                <Badge variant="secondary">Planned</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg opacity-60">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Team Management</p>
                    <p className="text-sm text-muted-foreground">User roles, permissions, and SSO</p>
                  </div>
                </div>
                <Badge variant="secondary">Planned</Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg opacity-60">
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Integrations</p>
                    <p className="text-sm text-muted-foreground">Slack, PagerDuty, webhooks, SIEM exports</p>
                  </div>
                </div>
                <Badge variant="secondary">Planned</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={saveSettings} disabled={isSaving} className="w-full sm:w-auto">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save All Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
}