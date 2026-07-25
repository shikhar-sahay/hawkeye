import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "severity-critical" | "severity-high" | "severity-medium" | "severity-low";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const baseStyles = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

  const variants = {
    default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
    outline: "text-foreground",
    "severity-critical": "border-transparent bg-red-500/20 text-red-500 dark:bg-red-500/30 dark:text-red-400",
    "severity-high": "border-transparent bg-orange-500/20 text-orange-500 dark:bg-orange-500/30 dark:text-orange-400",
    "severity-medium": "border-transparent bg-yellow-500/20 text-yellow-600 dark:bg-yellow-500/30 dark:text-yellow-400",
    "severity-low": "border-transparent bg-green-500/20 text-green-600 dark:bg-green-500/30 dark:text-green-400",
  };

  return <div className={cn(baseStyles, variants[variant], className)} {...props} />;
}

export { Badge };