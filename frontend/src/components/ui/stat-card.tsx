"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ComponentType, SVGProps } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  color?: string;
  /** Secondary line shown under the main value */
  subtitle?: string;
  trend?: {
    value: string;
    label: string;
    positive?: boolean;
  };
  badge?: React.ReactNode;
  description?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  color = "text-primary",
  subtitle,
  trend,
  badge,
  description,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "surface-highlight shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover",
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("h-4 w-4", color)} aria-hidden="true" />
      </CardHeader>
      <CardContent className="pb-3">
        <div className="tabular text-2xl font-semibold leading-none tracking-tight">{value}</div>
        {subtitle && (
          <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
        {badge && <div className="mt-2">{badge}</div>}
        {trend && (
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1 text-xs",
              trend.positive ? "text-success" : "text-destructive"
            )}
          >
            <span className="font-medium">{trend.value}</span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}
