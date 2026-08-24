"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function PageContainer({
  children,
  className,
  title,
  description,
  action,
}: PageContainerProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {(title || description || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            {title && (
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="mt-4 sm:mt-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}