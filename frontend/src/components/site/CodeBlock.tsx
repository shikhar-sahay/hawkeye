"use client";

import * as React from "react";
import { Check, Copy, Terminal } from "lucide-react";

interface CodeBlockProps {
  code: string;
  /** Header label, e.g. "Shell" or "POST /api/v1/events" */
  label?: string;
  /** Right-aligned meta text (e.g. the endpoint) */
  meta?: string;
  className?: string;
}

/**
 * CodeBlock - copyable, horizontally-scrollable code panel with a
 * visible scroll affordance on narrow screens.
 */
export function CodeBlock({ code, label = "Shell", meta, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/insecure context) - ignore
    }
  };

  return (
    <div className={`overflow-hidden rounded-md border ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="h-3 w-3" aria-hidden="true" />
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[28px] items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={copied ? "Copied" : "Copy to clipboard"}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-success" aria-hidden="true" />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="code-scroll overflow-x-auto p-3 text-xs leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
      {meta && (
        <div className="border-t bg-muted/30 px-3 py-1.5 font-mono text-2xs text-muted-foreground">
          {meta}
        </div>
      )}
    </div>
  );
}
