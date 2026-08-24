"use client";

import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, KeyRound, Server, Terminal, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/**
 * GetStartedPage - explains how to obtain dashboard access.
 *
 * Hawkeye authenticates with per-source API keys rather than user accounts.
 * This page walks through the honest path to getting one: stand up an
 * instance, bootstrap a source, ingest events, sign in with the key.
 */

const steps = [
  {
    icon: Server,
    title: "Run Hawkeye",
    description:
      "Install and start the backend. SQLite works out of the box; point DATABASE_URL at PostgreSQL for production.",
    snippet: `pip install -e .
uvicorn hawkeye.main:app --port 8000`,
    language: "Register the first source while the instance has none",
  },
  {
    icon: KeyRound,
    title: "Bootstrap your source",
    description:
      "The first source can be registered without credentials. Generate its API key right after; it is shown once.",
    snippet: `# Register the first source (open until one exists)
curl -X POST http://localhost:8000/api/v1/sources \\
  -H "Content-Type: application/json" \\
  -d '{"name": "production-web", "description": "Public web app"}'

# Create its API key
curl -X POST http://localhost:8000/api/v1/sources/1/api-keys \\
  -H "X-API-Key: <key-from-source-1>" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "dashboard"}`,
    language: "",
  },
  {
    icon: Upload,
    title: "Send events",
    description:
      "Point your application at the ingestion endpoint. Events are normalized, scored by all detection engines, and correlated into incidents.",
    snippet: `curl -X POST http://localhost:8000/api/v1/events/batch \\
  -H "X-API-Key: hawk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"events": [ ... ]}'`,
    language: "",
  },
];

export function GetStartedPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2" aria-label="Hawkeye home">
            <Logo size={26} />
            <span className="text-base font-semibold tracking-tight">Hawkeye</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">
              Sign in
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Get started</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Get your dashboard credential
        </h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Hawkeye authenticates with per-source API keys instead of user accounts.
          Each application you monitor is registered as a source, and its keys act
          as both the ingestion credential and the dashboard login. Here is the
          path from zero to a live dashboard.
        </p>

        <ol className="mt-10 space-y-6">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="animate-fade-up rounded-lg border bg-card p-5 shadow-card sm:p-6"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <step.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <span className="font-mono text-xs text-muted-foreground">Step {i + 1}</span>
                  <h2 className="font-semibold leading-tight">{step.title}</h2>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
              {step.snippet && (
                <div className="mt-4 overflow-hidden rounded-md border">
                  <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                    <Terminal className="h-3 w-3" />
                    Shell
                  </div>
                  <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-foreground/90">
                    <code>{step.snippet}</code>
                  </pre>
                </div>
              )}
            </li>
          ))}
        </ol>

        <div className="animate-fade-up mt-10 rounded-lg border border-primary/25 bg-primary/5 p-5" style={{ animationDelay: "300ms" }}>
          <h2 className="font-semibold">Already have an API key?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in directly with any active source key. On an existing deployment,
            ask whoever manages the sources to issue you a key from the Sources page.
          </p>
          <Button className="mt-4" asChild>
            <Link to="/login">
              Sign in with an API key
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-8 text-sm">
          <Link to="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to overview
          </Link>
        </div>
      </main>
    </div>
  );
}
