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
  AlertTriangle,
  Shield,
  ExternalLink,
  Clock,
  User,
  Hash,
  FileText,
  ChevronDown,
  X,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { formatDate, formatRelativeTime, getSeverityBadgeVariant, getStatusBadgeVariant, getDetectionTypeLabel, getMitreTacticLabel } from "@/lib/utils";
import { apiClient } from "@/api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/api/client";
import type { Alert, AlertStatusUpdate } from "@/types";
import { useToast } from "@/hooks/use-toast";

interface AlertDetailProps {
  /** The alert to display details for */
  alert: Alert | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Optional: fetch full alert details if only partial data is provided */
  fetchFullAlert?: boolean;
}

/**
 * AlertDetail - Dialog component for viewing and managing alert details
 * Shows complete alert metadata, evidence, MITRE tags, and status controls
 */
export function AlertDetail({
  alert,
  open,
  onOpenChange,
  fetchFullAlert = true,
}: AlertDetailProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [fullAlert, setFullAlert] = React.useState<Alert | null>(null);
  const [activeTab, setActiveTab] = React.useState("overview");

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AlertStatusUpdate }) => apiClient.updateAlertStatus(id, data),
    onSuccess: (updatedAlert) => {
      setFullAlert(updatedAlert);
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.stats });
      toast({
        title: "Status updated",
        description: `Alert status changed to ${updatedAlert.status}`,
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

  // Fetch full alert details when alert changes
  React.useEffect(() => {
    if (alert && fetchFullAlert) {
      apiClient
        .getAlert(alert.id)
        .then(setFullAlert)
        .catch((error) => {
          console.error("Failed to fetch alert details:", error);
          setFullAlert(alert); // Fallback to passed alert
        });
    } else if (alert) {
      setFullAlert(alert);
    } else {
      setFullAlert(null);
    }
    setActiveTab("overview");
  }, [alert, fetchFullAlert]);

  const displayAlert = fullAlert ?? alert;

  const handleStatusChange = (status: AlertStatusUpdate["status"]) => {
    if (!displayAlert) return;
    updateStatusMutation.mutate({ id: displayAlert.id, data: { status } });
  };

  const formatEvidence = (evidence: Record<string, unknown>): string => {
    try {
      return JSON.stringify(evidence, null, 2);
    } catch {
      return "Unable to format evidence";
    }
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

  if (!displayAlert) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-semibold truncate pr-4">{displayAlert.title}</DialogTitle>
              <DialogDescription className="text-sm mt-1">{displayAlert.description}</DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant={getSeverityBadgeVariant(displayAlert.severity)} className="text-xs">
                {displayAlert.severity.toUpperCase()}
              </Badge>
              <Badge variant={getStatusBadgeVariant(displayAlert.status)} className="text-xs">
                {displayAlert.status}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <Separator className="my-4" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="mitre">MITRE ATT&CK</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="h-[calc(100%-52px)] overflow-hidden">
            <ScrollArea className="h-full p-4 space-y-4">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Alert ID</Label>
                      <p className="font-mono text-sm">{displayAlert.id}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Source ID</Label>
                      <p className="font-mono text-sm">{displayAlert.source_id}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Event ID</Label>
                      <p className="font-mono text-sm">{displayAlert.event_id}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Detection Type</Label>
                      <Badge variant="outline" className="gap-1">
                        <Shield className="h-3 w-3" />
                        {getDetectionTypeLabel(displayAlert.detection_type)}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Confidence</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.round(displayAlert.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-mono w-16 text-right">
                          {Math.round(displayAlert.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Created</Label>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{formatDate(displayAlert.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                      time={displayAlert.created_at}
                      description="Alert was generated by detection engine"
                      icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                    />
                    {displayAlert.acknowledged_at && (
                      <StatusTimelineItem
                        label="Acknowledged"
                        time={displayAlert.acknowledged_at}
                        description={`By ${displayAlert.acknowledged_by || "unknown"}`}
                        icon={<CheckCircle className="h-4 w-4 text-orange-500" />}
                      />
                    )}
                    {displayAlert.resolved_at && (
                      <StatusTimelineItem
                        label="Resolved"
                        time={displayAlert.resolved_at}
                        description="Alert marked as resolved"
                        icon={<CheckCircle className="h-4 w-4 text-green-500" />}
                      />
                    )}
                    {displayAlert.status === "suppressed" && (
                      <StatusTimelineItem
                        label="Suppressed"
                        time={displayAlert.updated_at}
                        description="Alert was suppressed"
                        icon={<XCircle className="h-4 w-4 text-muted-foreground" />}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="evidence" className="h-[calc(100%-52px)] overflow-hidden">
            <ScrollArea className="h-full p-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Evidence Details
                  </CardTitle>
                  <CardDescription>Raw evidence data collected by the detection engine</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted p-4 rounded-md text-sm font-mono overflow-x-auto max-h-[500px] whitespace-pre-wrap">
                    {formatEvidence(displayAlert.evidence)}
                  </pre>
                </CardContent>
              </Card>
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
                  <CardDescription>Tactics associated with this alert</CardDescription>
                </CardHeader>
                <CardContent>
                  {displayAlert.mitre_tactics.length > 0 ? (
                    renderMitreTags(displayAlert.mitre_tactics, "tactic")
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
                  <CardDescription>Specific techniques identified</CardDescription>
                </CardHeader>
                <CardContent>
                  {displayAlert.mitre_techniques.length > 0 ? (
                    renderMitreTags(displayAlert.mitre_techniques, "technique")
                  ) : (
                    <p className="text-sm text-muted-foreground">No MITRE techniques associated</p>
                  )}
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
                  <CardDescription>Update the alert status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <StatusActionButton
                      label="Acknowledge"
                      description="Mark as under review"
                      icon={<User className="h-4 w-4" />}
                      variant={displayAlert.status === "acknowledged" ? "default" : "outline"}
                      disabled={displayAlert.status === "acknowledged" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("acknowledged")}
                    />
                    <StatusActionButton
                      label="Resolve"
                      description="Mark as resolved"
                      icon={<CheckCircle className="h-4 w-4" />}
                      variant={displayAlert.status === "resolved" ? "default" : "outline"}
                      disabled={displayAlert.status === "resolved" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("resolved")}
                    />
                    <StatusActionButton
                      label="Suppress"
                      description="Suppress future alerts of this type"
                      icon={<X className="h-4 w-4" />}
                      variant={displayAlert.status === "suppressed" ? "default" : "outline"}
                      disabled={displayAlert.status === "suppressed" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("suppressed")}
                    />
                    <StatusActionButton
                      label="Reopen"
                      description="Reopen closed/suppressed alert"
                      icon={<ChevronDown className="h-4 w-4" />}
                      variant={displayAlert.status === "open" ? "default" : "outline"}
                      disabled={displayAlert.status === "open" || updateStatusMutation.isPending}
                      onClick={() => handleStatusChange("open")}
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