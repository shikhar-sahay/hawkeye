"use client";

import { Eye, ArrowDownToLine, Crosshair, Network, BellRing } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const STAGES = [
  {
    icon: Eye,
    key: "WATCH",
    title: "Watch",
    detail: "Your application emits security events — logins, requests, session activity.",
    tag: "your app",
  },
  {
    icon: ArrowDownToLine,
    key: "INGEST",
    title: "Ingest",
    detail: "Events arrive over the REST API and are normalized with MITRE ATT&CK context.",
    tag: "POST /api/v1/events",
  },
  {
    icon: Crosshair,
    key: "DETECT",
    title: "Detect",
    detail: "Every event is evaluated by all seven detection engines against a rolling window.",
    tag: "7 engines",
  },
  {
    icon: Network,
    key: "CORRELATE",
    title: "Correlate",
    detail: "Related alerts are grouped into incidents with aggregated entities and tactics.",
    tag: "24h window",
  },
  {
    icon: BellRing,
    key: "RESPOND",
    title: "Respond",
    detail: "Incidents stream to the dashboard over WebSocket. Triage, update status, resolve.",
    tag: "live /ws",
  },
];

/**
 * PipelineFlow - the WATCH → INGEST → DETECT → CORRELATE → RESPOND flow,
 * drawn as a connected rail instead of a card grid.
 */
export function PipelineFlow() {
  return (
    <section id="pipeline" className="border-t py-20 scroll-mt-14 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Pipeline
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Five stages between a probe and a resolved incident
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            This is the actual path every event takes through Hawkeye. No queue
            of unprocessed logs — ingestion, detection, and correlation happen
            per event, as it arrives.
          </p>
        </Reveal>

        <ol className="relative mt-12 grid gap-6 md:grid-cols-5 md:gap-3">
          {/* Connecting rail (horizontal on md+) */}
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-5 hidden border-t border-dashed border-border md:block"
          />
          {STAGES.map((stage, i) => (
            <Reveal key={stage.key} delay={i * 90}>
              <li className="relative flex gap-4 md:flex-col md:gap-0">
                <div className="relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full border bg-card shadow-card">
                  <stage.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="md:mt-4">
                  <p className="font-mono text-2xs tracking-widest text-muted-foreground">
                    {stage.key}
                  </p>
                  <h3 className="mt-0.5 font-semibold">{stage.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {stage.detail}
                  </p>
                  <p className="mt-2 inline-block rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                    {stage.tag}
                  </p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
