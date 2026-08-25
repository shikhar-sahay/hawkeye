"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TooltipProps } from "recharts";
import { format } from "date-fns";

interface AlertsOverTimeChartProps {
  /** Array of time series data points */
  data: Array<{ timestamp: string; value: number }>;
  /** Chart height */
  height?: number | string;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Line color */
  color?: string;
  /** Show legend */
  showLegend?: boolean;
  /** Y-axis label */
  yAxisLabel?: string;
  /** Requested range in hours: selects the x-axis tick granularity.
   *  24h → HH:mm, 7d → day + time, 30d → dates. Inferred from the data
   *  span when omitted. */
  hours?: number;
}

/**
 * Picks x-axis tick formatting that matches the data granularity so the
 * axis stays chronological and readable:
 * - ≤ 24h of data  → "14:00"
 * - ≤ 7d of data   → "Mon 14:00" (4-hourly buckets)
 * - > 7d of data   → "Aug 01" (daily buckets)
 */
function axisFormatters(spanHours: number) {
  if (spanHours <= 25) {
    return {
      tick: (t: Date) => format(t, "HH:mm"),
      tooltip: (t: Date) => format(t, "eee d MMM, HH:mm"),
    };
  }
  if (spanHours <= 24 * 8) {
    return {
      tick: (t: Date) => format(t, "eee HH:mm"),
      tooltip: (t: Date) => format(t, "eee d MMM, HH:mm"),
    };
  }
  return {
    tick: (t: Date) => format(t, "MMM d"),
    tooltip: (t: Date) => format(t, "eee d MMM yyyy"),
  };
}

/**
 * AlertsOverTimeChart - Time-series area chart for alerts over time
 * Shows alert volume trends over a time period (24h, 7d, 30d)
 */
export default function AlertsOverTimeChart({
  data,
  height = 300,
  isLoading = false,
  error = null,
  color = "hsl(var(--primary))",
  showLegend = false,
  yAxisLabel = "Alerts",
  hours,
}: AlertsOverTimeChartProps) {
  // Format data for Recharts; keep the raw Date for the custom tick/tooltip
  const formattedData = data.map((point) => ({
    ...point,
    date: new Date(point.timestamp),
  }));

  // Span of the series (fall back to the requested range, then 24h)
  const spanHours = React.useMemo(() => {
    if (data.length >= 2) {
      const first = new Date(data[0].timestamp).getTime();
      const last = new Date(data[data.length - 1].timestamp).getTime();
      return Math.max(1, Math.round((last - first) / 3_600_000));
    }
    return hours ?? 24;
  }, [data, hours]);
  const formatters = axisFormatters(spanHours);

  const customTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (active && payload && payload.length > 0) {
      const pointDate = payload[0].payload?.date as Date | undefined;
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="font-mono text-sm font-medium">
            {pointDate ? formatters.tooltip(pointDate) : ""}
          </p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-medium">{entry.value}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading || error || data.length === 0) {
    return (
      <div className="h-full w-full" style={{ height }}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {isLoading ? "Loading..." : error ? "Error loading data" : "No data available"}
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorAlerts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
        <XAxis
          dataKey="date"
          tickFormatter={formatters.tick}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          label={{ value: yAxisLabel, angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip content={customTooltip} />
        {showLegend && <Legend />}
        <Area
          type="monotone"
          dataKey="value"
          name="Alerts"
          stroke={color}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorAlerts)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}