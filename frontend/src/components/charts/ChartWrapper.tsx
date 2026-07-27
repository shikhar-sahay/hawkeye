"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ChartWrapperProps {
  /** Chart title */
  title: string;
  /** Optional description */
  description?: string;
  /** Chart content to render */
  children: ReactNode;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Empty state message */
  emptyMessage?: string;
  /** Whether to show the card wrapper */
  withCard?: boolean;
  /** Additional className for the card */
  className?: string;
  /** Optional action button */
  action?: ReactNode;
  /** Height of the chart area */
  height?: number;
}

/**
 * ChartWrapper - Reusable wrapper for chart components
 * Provides consistent loading, error, and empty states with a card container
 */
export function ChartWrapper({
  title,
  description,
  children,
  isLoading = false,
  error = null,
  emptyMessage = "No data available",
  withCard = true,
  className,
  action,
  height = 300,
}: ChartWrapperProps) {
  const content = (
    <div className={cn("h-full", height && `min-h-[${height}px]`)} style={{ height: height }}>
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse space-y-4 w-full max-w-md">
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-[300px] w-full" />
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
          <AlertCircle className="h-12 w-12 text-destructive/50 mb-4" />
          <p className="text-destructive font-medium">Failed to load chart</p>
          <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      ) : children ? (
        <div className="w-full h-full">{children}</div>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );

  if (withCard) {
    return (
      <Card className={cn(className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {description && <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>}
          </div>
          {action && <div>{action}</div>}
        </CardHeader>
        <CardContent className="p-0 pt-2">{content}</CardContent>
      </Card>
    );
  }

  return <div className={cn(className)}>{content}</div>;
}