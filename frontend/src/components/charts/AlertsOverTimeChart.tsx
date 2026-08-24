"use client";

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
}: AlertsOverTimeChartProps) {
  // Format data for Recharts
  const formattedData = data.map((point) => ({
    ...point,
    time: format(new Date(point.timestamp), "MMM d HH:mm"),
    shortTime: format(new Date(point.timestamp), "HH:mm"),
  }));

  const customTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length > 0) {
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="font-mono text-sm font-medium">{label}</p>
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
          dataKey="shortTime"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
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