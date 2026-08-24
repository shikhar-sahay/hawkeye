"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Shield,
  ExternalLink,
  Clock,
  User,
  Hash,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  MapPin,
  AlertCircle,
} from "lucide-react";
import { formatDate, formatRelativeTime, getSeverityBadgeVariant, getStatusBadgeVariant, getDetectionTypeLabel, getMitreTacticLabel, cn } from "@/lib/utils";
import { apiClient } from "@/api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/client";
import type { Incident, IncidentStatusUpdate, Alert } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { AlertFeed } from "@/components/AlertFeed";

interface IncidentDetailProps {
  /** The incident to display details for */
  incident: Incident | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Optional: fetch full incident details if only partial data is provided */
  fetchFullIncident?: boolean;
}

/**
 * IncidentDetail - Dialog component for viewing and managing incident details
 * Shows incident metadata, timeline, related alerts, MITRE aggregation, and status actions
 */
export function IncidentDetail({
  incident,
  open,
  onOpenChange,
  fetchFullIncident = true,
}: IncidentDetailProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [fullIncident, setFullIncident] = React.useState<Incident | null>(null);
  const [relatedAlerts, setRelatedAlerts] = React.useState<Alert[]>([]);
  const [activeTab, setActiveTab] = React.useState("overview");

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: IncidentStatusUpdate }) => apiClient.updateIncidentStatus(id, data),
    onSuccess: (updatedIncident) => {
      setFullIncident(updatedIncident);
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.stats });
      toast({
        title: "Status updated",
        description: `Incident status changed to ${updatedIncident.status}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch full incident details and related alerts when incident changes
  React.useEffect(() => {
    if (incident && fetchFullIncident) {
      Promise.all([
        apiClient.getIncident(incident.id),
        apiClient.getIncidentAlerts(incident.id),
      ])
        .then(([incidentData, alertsData]) => {
          setFullIncident(incidentData);
          setRelatedAlerts(alertsData);
        })
        .catch((error) => {
          console.error("Failed to fetch incident details:", error);
          setFullIncident(incident); // Fallback to passed incident
          setRelatedAlerts([]);
        });
    } else if (incident) {
      setFullIncident(incident);
      setRelatedAlerts(incident.alerts || []);
    } else {
      setFullIncident(null);
      setRelatedAlerts([]);
    }
    setActiveTab("overview");
  }, [incident, fetchFullIncident]);

  const displayIncident = fullIncident ?? incident;

  const handleStatusChange = (status: IncidentStatusUpdate["status"]) => {
    if (!displayIncident) return;
    updateStatusMutation.mutate({ id: displayIncident.id, data: { status } });
  };

  const renderMitreTags = (tags: string[], prefix: string) => {
    if (!tags.length) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="gap-1">
            {prefix === "tactic" && <Shield className="h-2.5 w-2.5" />}
            {prefix === "technique" && <ExternalLink className="h-2.5 w-2.5" />}
            <span>{getMitreTacticLabel(tag)}</span>
          </Badge>
        ))}
      </div>
    );
  };

  if (!displayIncident) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold truncate pr-4">{displayIncident.title}</DialogTitle>
              <DialogDescription className="text-sm mt-1">{displayIncident.description}</DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={getSeverityBadgeVariant(displayIncident.severity)} className="text-xs">
                {displayIncident.severity.toUpperCase()}
              </Badge>
              <Badge variant={getStatusBadgeVariant(displayIncident.status)} className="text-xs">
                {displayIncident.status}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Separator className="my-4" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="alerts">Related Alerts ({relatedAlerts.length})</TabsTrigger>
            <TabsTrigger value="mitre">MITRE ATT&CK</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="h-[calc(100%-52px)] overflow-hidden">
            <ScrollArea className="h-full p-4 space-y-4">
              {/* Basic Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      Basic Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Incident ID</Label>
                      <p className="font-mono text-sm">{displayIncident.id}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Source ID</Label>
                      <p className="font-mono text-sm">{displayIncident.source_id}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Alert Count</Label>
                      <p className="font-mono text-sm">{displayIncident.alert_count}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Created</Label>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{formatDate(displayIncident.created_at)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Updated</Label>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{formatDate(displayIncident.updated_at)}</span>
                      </div>
                    </div>
                    {displayIncident.closed_at && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Closed</Label>
                        <div className="flex items-center gap-1 text-sm">
                          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                          <span>{formatDate(displayIncident.closed_at)}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Affected Entities
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Affected IPs ({displayIncident.affected_ips.length})</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {displayIncident.affected_ips.length > 0 ? (
                          displayIncident.affected_ips.map((ip) => (
                            <Badge key={ip} variant="outline" className="gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {ip}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Affected Users ({displayIncident.affected_users.length})</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {displayIncident.affected_users.length > 0 ? (
                          displayIncident.affected_users.map((user) => (
                            <Badge key={user} variant="outline" className="gap-1">
                              <User className="h-2.5 w-2.5" />
                              {user}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Status Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Status Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-3">
                    <StatusTimelineItem
                      label="Created"
                      time={displayIncident.created_at}
                      description="Incident was created from correlated alerts"
                      icon={<AlertCircle className="h-4 w-4 text-destructive" />}
                    />
                    {displayIncident.status === "investigating" && (
                      <StatusTimelineItem
                        label="Investigating"
                        time={displayIncident.updated_at}
                        description="Incident is under active investigation"
                        icon={<AlertCircle className="h-4 w-4 text-blue-500" />}
                      />
                    )}
                    {displayIncident.status === "resolved" && (
                      <StatusTimelineItem
                        label="Resolved"
                        time={displayIncident.updated_at}
                        description="Incident marked as resolved"
                        icon={<CheckCircle className="h-4 w-4 text-green-500" />}
                      />
                    )}
                    {displayIncident.status === "closed" && displayIncident.closed_at && (
                      <StatusTimelineItem
                        label="Closed"
                        time={displayIncident.closed_at}
                        description="Incident closed"
                        icon={<CheckCircle className="h-4 w-4 text-green-500" />}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="timeline" className="h-[calc(100%-52px)] overflow-hidden">
            <ScrollArea className="h-full p-4">
              <AlertFeed
                alerts={relatedAlerts.map((alert) => ({
                  id: alert.id,
                  source_id: alert.source_id,
                  detection_type: alert.detection_type,
                  severity: alert.severity,
                  status: alert.status,
                  confidence: alert.confidence,
                  title: alert.title,
                  description: alert.description,
                  evidence: alert.evidence,
                  mitre_tactics: alert.mitre_tactics,
                  mitre_techniques: alert.mitre_techniques,
                  affected_entities: {},
                  created_at: alert.created_at,
                  updated_at: alert.updated_at,
                }))}
                showConnectionStatus={false}
                connectionStatus="connected"
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="alerts" className="h-[calc(100%-52px)] overflow-hidden">
            <ScrollArea className="h-full p-4">
              {relatedAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                  <p>No related alerts found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {relatedAlerts.map((alert) => (
                    <AlertCard key={alert.id} alert={alert} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="mitre" className="h-[calc(100%-52px)] overflow-hidden">
            <ScrollArea className="h-full p-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    MITRE ATT&CK Tactics
                  </CardTitle>
                  <CardDescription>Aggregated tactics from all related alerts</CardDescription>
                </CardHeader>
                <CardContent>
                  {displayIncident.mitre_tactics.length > 0 ? (
                    renderMitreTags(displayIncident.mitre_tactics, "tactic")
                  ) : (
                    <p className="text-sm text-muted-foreground">No MITRE tactics associated</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    MITRE ATT&CK Techniques
                  </CardTitle>
                  <CardDescription>Aggregated techniques from all related alerts</CardDescription>
                </CardHeader>
                <CardContent>
                  {displayIncident.mitre_techniques.length > 0 ? (
                    renderMitreTags(displayIncident.mitre_techniques, "technique")
                  ) : (
                    <p className="text-sm text-muted-foreground">No MITRE techniques associated</p>
                  )}
                </CardContent>
              </Card>

              {/* MITRE Coverage Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Coverage Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{displayIncident.mitre_tactics.length}</p>
                    <p className="text-xs text-muted-foreground">Unique Tactics</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{displayIncident.mitre_techniques.length}</p>
                    <p className="text-xs text-muted-foreground">Unique Techniques</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <Shield className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-2xl font-bold">{displayIncident.alert_count}</p>
                    <p className="text-xs text-muted-foreground">Correlated Alerts</p>
                  </div>
                </CardContent>
              </Card>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="actions" className="h-[calc(100%-52px)] overflow-hidden">
            <ScrollArea className="h-full p-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Status Actions
                  </CardTitle>
                  <CardDescription>Update the incident status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <StatusActionButton
                      label="Open"
                      description="Reopen incident"
                      icon={<AlertCircle className="h-4 w-4" />}
                      variant={displayIncident.status === "open" ? "default" : "outline"}
                      disabled={displayIncident.status === "open" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("open")}
                    />
                    <StatusActionButton
                      label="Investigating"
                      description="Mark as under investigation"
                      icon={<AlertCircle className="h-4 w-4" />}
                      variant={displayIncident.status === "investigating" ? "default" : "outline"}
                      disabled={displayIncident.status === "investigating" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("investigating")}
                    />
                    <StatusActionButton
                      label="Resolve"
                      description="Mark as resolved"
                      icon={<CheckCircle className="h-4 w-4" />}
                      variant={displayIncident.status === "resolved" ? "default" : "outline"}
                      disabled={displayIncident.status === "resolved" || displayIncident.status === "closed" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("resolved")}
                    />
                    <StatusActionButton
                      label="Close"
                      description="Close the incident"
                      icon={<XCircle className="h-4 w-4" />}
                      variant={displayIncident.status === "closed" ? "default" : "outline"}
                      disabled={displayIncident.status === "closed" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("closed")}
                    />
                  </div>
                  {updateStatusMutation.isPending && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating status...
                    </div>
                  )}
                </CardContent>
              </Card>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusTimelineItem({
  label,
  time,
  description,
  icon,
}: {
  label: string;
  time: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{label}</span>
          <span className="text-xs text-muted-foreground font-mono">{formatRelativeTime(time)}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function StatusActionButton({
  label,
  description,
  icon,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  variant: "default" | "outline";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      className="h-auto p-3 text-left gap-2"
    >
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </Button>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  return (
    <div className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">
          <span className={cn("h-5 w-5 rounded-full", {
            "bg-destructive": alert.severity === "critical",
            "bg-orange-500": alert.severity === "high",
            "bg-yellow-500": alert.severity === "medium",
            "bg-blue-500": alert.severity === "low",
          })} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{alert.title}</h4>
            <Badge variant={getSeverityBadgeVariant(alert.severity)} className="text-xs">
              {alert.severity.toUpperCase()}
            </Badge>
            <Badge variant={getStatusBadgeVariant(alert.status)} className="text-xs">
              {alert.status}
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">
              {getDetectionTypeLabel(alert.detection_type)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">{alert.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {alert.mitre_tactics.slice(0, 3).map((tactic) => (
              <Badge key={tactic} variant="outline" className="text-xs gap-1">
                <Shield className="h-2.5 w-2.5" />
                {getMitreTacticLabel(tactic)}
              </Badge>
            ))}
            {alert.mitre_techniques.slice(0, 2).map((technique) => (
              <Badge key={technique} variant="outline" className="text-xs gap-1">
                <ExternalLink className="h-2.5 w-2.5" />
                {technique}
              </Badge>
            ))}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground flex-shrink-0">
          <div>{formatRelativeTime(alert.created_at)}</div>
          <div className="font-mono">ID: {alert.id}</div>
        </div>
      </div>
    </div>
  );
}