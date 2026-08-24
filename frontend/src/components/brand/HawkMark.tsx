"use client";

import { cn } from "@/lib/utils";

interface HawkMarkProps {
  className?: string;
  size?: number;
  /** "brand" uses the crimson hawk color, "current" inherits text color */
  colorMode?: "brand" | "current";
  /** Enables the subtle idle animation (breathing + eye pulse) */
  animated?: boolean;
}

/**
 * HawkMark - the Hawkeye bird as an inline SVG.
 *
 * A geometric hawk with layered, raised wings and a watching eye.
 * Drawn on a 100x100 grid, symmetric around x=50. The wing tiers are
 * grouped so they can be animated (flap) and the eye can pulse.
 */
export function HawkMark({
  className,
  size = 32,
  colorMode = "brand",
  animated = false,
}: HawkMarkProps) {
  const fill = colorMode === "brand" ? "#e11d48" : "currentColor";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("hawk-mark", animated && "hawk-mark-animated", className)}
      aria-hidden="true"
      focusable="false"
    >
      <g className="hawk-wing hawk-wing-left" fill={fill}>
        {/* Left wing: three layered tiers */}
        <path d="M47 40 L18 22 L23 33 L45 48 Z" />
        <path d="M45 50 L14 37 L20 48 L43 61 Z" />
        <path d="M43 62 L12 52 L19 63 L41 72 Z" />
      </g>
      <g className="hawk-wing hawk-wing-right" fill={fill}>
        {/* Right wing: mirror of left */}
        <path d="M53 40 L82 22 L77 33 L55 48 Z" />
        <path d="M55 50 L86 37 L80 48 L57 61 Z" />
        <path d="M57 62 L88 52 L81 63 L59 72 Z" />
      </g>
      {/* Body + head + tail */}
      <g fill={fill}>
        <path d="M50 34 L56 50 L50 90 L44 50 Z" />
        <path d="M50 24 L56 34 L50 41 L44 34 Z" />
      </g>
      {/* The watching eye */}
      <circle className="hawk-eye" cx="50" cy="32.5" r="2" fill="var(--background, #fff)" />
    </svg>
  );
}
