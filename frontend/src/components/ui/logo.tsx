"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

/**
 * Hawkeye Logo Component
 * Renders the Hawkeye logo from PNG asset
 */
export function Logo({ className, size = 32 }: LogoProps) {
  return (
    <img
      src="/hawkeyelogo.png"
      alt="Hawkeye"
      className={cn("text-primary", className)}
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}

/**
 * Logo with text for header/sidebar
 */
export function LogoWithText({ className, size = 32 }: LogoProps) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Logo size={size} />
      <span className="text-xl font-bold tracking-tight text-foreground">Hawkeye</span>
    </span>
  );
}