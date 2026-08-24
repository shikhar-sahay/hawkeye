"use client";

import { Link } from "react-router-dom";
import {
  ArrowRight,
  Radar,
  FileText,
  Server,
  ShieldCheck,
  GitBranch,
  ExternalLink,
  Terminal,
  Database,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Reveal } from "@/components/Reveal";

/**
 * LandingPage - public product page for HawkEye.
 *
 * Copy is limited to capabilities the backend actually implements:
 * event ingestion, MITRE normalization, seven detection engines, alert to
 * incident correlation, WebSocket streaming, and per-source API keys.
 */

const features = [
  {
    icon: Radar,
    title: "Seven detection engines",
    description:
      "Brute force, credential stuffing, enumeration, bot activity, sensitive actions, session hijacking, and API abuse are evaluated on every ingested event.",
  },
  {
    icon: GitBranch,
    title: "MITRE ATT&CK mapping",
    description:
      "Events and alerts are normalized with ATT&CK tactics and techniques, so findings map to a framework your team already uses.",
  },
  {
    icon: FileText,
    title: "Alerts become incidents",
    description:
      "Related alerts within a time window are correlated into incidents with aggregated entities, timelines, and severity.",
  },
  {
    icon: Zap,
    title: "Real-time stream",
    description:
      "A persistent WebSocket connection pushes new alerts, incidents, and events to the dashboard as they happen, with automatic reconnection.",
  },
  {
    icon: Server,
    title: "Source and key management",
    description:
      "Register each application as a source, issue scoped API keys, and track where every event came from.",
  },
  {
    icon: Database,
    title: "Self-hosted storage",
    description:
      "Runs on SQLite for evaluation or PostgreSQL in production. Your telemetry stays in your infrastructure.",
  },
];

const pipeline = [
  {
    step: "01",
    title: "Register a source",
    description: "Create an application source and generate its API key.",
  },
  {
    step: "02",
    title: "Stream events",
    description: "Send security events to POST /api/v1/events, one at a time or in batches of up to 1,000.",
  },
  {
    step: "03",
    title: "Normalize and detect",
    description: "Events are enriched with ATT&CK data, then run through all detection engines.",
  },
  {
    step: "04",
    title: "Triage in real time",
    description: "Correlated incidents land on the dashboard over WebSocket. Investigate, update status, resolve.",
  },
];

const detectors = [
  { name: "Brute Force", mitre: "T1110.001" },
  { name: "Credential Stuffing", mitre: "T1110.004" },
  { name: "Enumeration", mitre: "T1590 / T1592" },
  { name: "Bot Activity", mitre: "T1586.001" },
  { name: "Sensitive Actions", mitre: "T1078 / T1556" },
  { name: "Session Hijacking", mitre: "T1556.002" },
  { name: "API Abuse", mitre: "T1505 / T1583" },
];

const ingestSnippet = `curl -X POST http://localhost:8000/api/v1/events \\
  -H "X-API-Key: hawk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "login_failed",
    "category": "authentication",
    "ip": "203.0.113.7",
    "route": "/login",
    "method": "POST",
    "status_code": 401
  }'`;

function SiteHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="Hawkeye home">
          <Logo size={26} />
          <span className="text-base font-semibold tracking-tight">Hawkeye</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground" aria-label="Site">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#detection" className="transition-colors hover:text-foreground">Detection</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/get-started">
              Get started
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="font-semibold tracking-tight">Hawkeye</span>
          </div>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Self-hosted security monitoring for web applications.
          </p>
        </div>
        <div className="text-sm">
          <p className="font-medium">Product</p>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li><a href="#features" className="hover:text-foreground">Features</a></li>
            <li><a href="#detection" className="hover:text-foreground">Detection engines</a></li>
            <li><Link to="/get-started" className="hover:text-foreground">Get started</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="font-medium">Resources</p>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li>
              <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                API reference <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a href="https://github.com/shikhar-sahay/hawkeye" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                GitHub repository <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">
        Hawkeye is released under the MIT license.
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        {/* Faint surveillance grid backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border) / 0.55) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.55) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 90% 70% at 50% 30%, black 35%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 30%, black 35%, transparent 78%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <div
              className="animate-fade-up inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
              style={{ animationDelay: "0ms" }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-pulse-dot" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Self-hosted application monitoring
            </div>

            <h1
              className="animate-fade-up mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-[3.4rem]"
              style={{ animationDelay: "80ms" }}
            >
              Know when your web app is under attack.
            </h1>

            <p
              className="animate-fade-up mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground"
              style={{ animationDelay: "160ms" }}
            >
              Hawkeye ingests security events from your applications, scores them
              against seven detection engines, maps findings to MITRE ATT&CK, and
              puts live incidents in front of you before they escalate.
            </p>

            <div
              className="animate-fade-up mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <Button size="lg" asChild>
                <Link to="/get-started">
                  Get started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">Sign in to dashboard</Link>
              </Button>
            </div>
          </div>

          {/* Ingest example: the actual first integration step */}
          <Reveal delay={200} className="mt-14 max-w-2xl">
            <div className="overflow-hidden rounded-lg border bg-card shadow-card">
              <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Terminal className="h-3.5 w-3.5" />
                  Send your first event
                </div>
                <span className="text-2xs text-muted-foreground">POST /api/v1/events</span>
              </div>
              <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground/90">
                <code>{ingestSnippet}</code>
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t py-20 scroll-mt-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Capabilities</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Everything between raw logs and resolved incidents
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 60}>
                <div className="group h-full rounded-lg border bg-card p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
                  <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 font-semibold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t bg-card/40 py-20 scroll-mt-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Pipeline</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">How it works</h2>
          </Reveal>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {pipeline.map((item, i) => (
              <Reveal key={item.step} delay={i * 80} className="h-full">
                <li className="relative h-full rounded-lg border bg-card p-5 shadow-card">
                  <span className="font-mono text-xs text-primary">{item.step}</span>
                  <h3 className="mt-2 font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Detection */}
      <section id="detection" className="border-t py-20 scroll-mt-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Detections</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Seven engines, mapped to ATT&CK
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Every alert carries the tactics and techniques that triggered it, so
              triage starts with context instead of a raw log line.
            </p>
          </Reveal>
          <div className="mt-10 overflow-hidden rounded-lg border bg-card shadow-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Detection engines and their MITRE ATT&CK mappings</caption>
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Engine</th>
                  <th scope="col" className="px-5 py-3 font-medium">ATT&CK techniques</th>
                </tr>
              </thead>
              <tbody>
                {detectors.map((d, i) => (
                  <tr key={d.name} className={i % 2 === 0 ? "bg-transparent" : "bg-muted/25"}>
                    <td className="px-5 py-3 font-medium">{d.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{d.mitre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="rounded-xl border bg-card p-10 text-center shadow-card sm:p-14">
              <ShieldCheck className="mx-auto h-9 w-9 text-primary" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                Start monitoring in minutes
              </h2>
              <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                Register a source, send an event, watch the pipeline respond.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button size="lg" asChild>
                  <Link to="/get-started">
                    Get started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
