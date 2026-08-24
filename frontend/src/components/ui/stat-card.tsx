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
    <Card className={cn("transition-shadow hover:shadow-md", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", color)} aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {badge && <div className="mt-1">{badge}</div>}
        {trend && (
          <div
            className={cn(
              "text-xs mt-1 flex items-center gap-1",
              trend.positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            )}
          >
            <span className="font-medium">{trend.value}</span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}