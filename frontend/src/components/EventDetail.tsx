"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Activity, Clock, User, MapPin, Route, ArrowRightLeft, Hash, Shield } from "lucide-react";
import { formatTimestamp, formatDate, getSeverityBadgeVariant } from "@/lib/utils";
import type { NormalizedEvent } from "@/types";

interface EventDetailProps {
  /** The event to display */
  event: NormalizedEvent | null;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog should close */
  onOpenChange: (open: boolean) => void;
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground w-32 flex-shrink-0">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium break-all">{String(value)}</span>
    </div>
  );
}

/**
 * EventDetail - dialog showing a single normalized security event with all
 * metadata an analyst needs to triage it.
 */
export function EventDetail({ event, open, onOpenChange }: EventDetailProps) {
  const metadataJson = React.useMemo(() => {
    if (!event?.metadata || Object.keys(event.metadata).length === 0) return null;
    try {
      return JSON.stringify(event.metadata, null, 2);
    } catch {
      return String(event.metadata);
    }
  }, [event]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5" />
                <span className="font-mono">#{event.id}</span>
                <Badge variant="secondary">{event.category}</Badge>
                <Badge variant={getSeverityBadgeVariant(event.severity)}>{event.severity}</Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="overflow-y-auto pr-1 space-y-4">
              <div>
                <h3 className="font-mono font-medium mb-2">{event.event_type}</h3>
                <Separator />
              </div>

              <div className="divide-y">
                <DetailRow icon={<Clock className="h-3.5 w-3.5" />} label="Event Time" value={`${formatDate(event.timestamp)} ${formatTimestamp(event.timestamp)}`} />
                <DetailRow icon={<Clock className="h-3.5 w-3.5" />} label="Ingested" value={`${formatDate(event.created_at)} ${formatTimestamp(event.created_at)}`} />
                <DetailRow icon={<User className="h-3.5 w-3.5" />} label="User" value={event.user_id} />
                <DetailRow icon={<Hash className="h-3.5 w-3.5" />} label="Session" value={event.session_id} />
                <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="IP Address" value={event.ip} />
                <DetailRow icon={<ArrowRightLeft className="h-3.5 w-3.5" />} label="Method" value={event.method} />
                <DetailRow icon={<Route className="h-3.5 w-3.5" />} label="Route" value={event.route} />
                <DetailRow icon={<Hash className="h-3.5 w-3.5" />} label="Status Code" value={event.status_code} />
                <DetailRow icon={<Shield className="h-3.5 w-3.5" />} label="Source ID" value={event.source_id} />
                {event.user_agent && (
                  <DetailRow icon={<Activity className="h-3.5 w-3.5" />} label="User Agent" value={event.user_agent} />
                )}
              </div>

              {(event.mitre_tactic || event.mitre_technique) && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Shield className="h-4 w-4" /> MITRE ATT&CK
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {event.mitre_tactic && <Badge variant="outline">{event.mitre_tactic}</Badge>}
                    {event.mitre_technique && <Badge variant="outline">{event.mitre_technique}</Badge>}
                  </div>
                </div>
              )}

              {metadataJson && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Metadata</h4>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-auto max-h-[200px] whitespace-pre-wrap">
                    {metadataJson}
                  </pre>
                </div>
              )}
            </div>

            <DialogFooter className="border-t p-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
