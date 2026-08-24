"use client";

import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * MobileStickyCta - a subtle bottom CTA on mobile, shown only after the
 * visitor has scrolled past the hero and hidden near the footer so it
 * never blocks content or navigation.
 */
export function MobileStickyCta() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => {
      const pastHero = window.scrollY > 480;
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 400;
      setVisible(pastHero && !nearBottom);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-2.5 backdrop-blur transition-transform duration-200 md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Self-hosted monitoring<span className="sr-only"> — get started</span>
        </p>
        <Link
          to="/get-started"
          tabIndex={visible ? 0 : -1}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Get started
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
