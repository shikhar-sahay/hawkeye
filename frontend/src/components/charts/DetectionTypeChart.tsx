"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { TooltipProps } from "recharts";

// Categorical palette mapped to semantic theme tokens so both themes get
// legible, consistent colors. Surface tokens (secondary/accent) are not used
// for data series.
const DETECTION_TYPE_COLORS: Record<string, string> = {
  brute_force: "hsl(var(--severity-critical))",
  credential_stuffing: "hsl(var(--severity-high))",
  enumeration: "hsl(var(--warning))",
  bot: "hsl(var(--severity-low))",
  sensitive_action: "hsl(var(--success))",
  session_hijacking: "hsl(var(--primary))",
  api_abuse: "hsl(var(--muted-foreground))",
};

const DETECTION_TYPE_LABELS: Record<string, string> = {
  brute_force: "Brute Force",
  credential_stuffing: "Credential Stuffing",
  enumeration: "Enumeration",
  bot: "Bot Activity",
  sensitive_action: "Sensitive Action",
  session_hijacking: "Session Hijacking",
  api_abuse: "API Abuse",
};

interface DetectionTypeData {
  name: string;
  value: number;
}

interface DetectionTypeChartProps {
  /** Detection type distribution data */
  data: DetectionTypeData[];
  /** Chart height */
  height?: number | string;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Show legend */
  showLegend?: boolean;
  /** Orientation: vertical or horizontal */
  layout?: "vertical" | "horizontal";
  /** Max number of bars to show */
  maxBars?: number;
}

/**
 * DetectionTypeChart - Bar chart for alerts by detection type
 * Shows distribution of detection engine types that triggered alerts
 */
export default function DetectionTypeChart({
  data,
  height = 250,
  isLoading = false,
  error = null,
  showLegend = false,
  layout = "vertical",
  maxBars = 10,
}: DetectionTypeChartProps) {
  const customTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (active && payload && payload.length > 0) {
      const entry = payload[0];
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-sm" style={{ color: entry.color }}>
            {DETECTION_TYPE_LABELS[String(entry.name)] || entry.name}
          </p>
          <p className="text-sm text-muted-foreground">{entry.value} alerts</p>
        </div>
      );
    }
    return null;
  };

  // Sort by value descending and limit
  const sortedData = [...data]
    .sort((a, b) => b.value - a.value)
    .slice(0, maxBars)
    .map((d) => ({
      ...d,
      label: DETECTION_TYPE_LABELS[d.name] || d.name,
      color: DETECTION_TYPE_COLORS[d.name] || DETECTION_TYPE_COLORS.brute_force,
    }));

  const total = sortedData.reduce((sum, d) => sum + d.value, 0);

  if (isLoading || error || total === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ height }}>
        <div className="text-center text-muted-foreground">
          {isLoading ? (
            "Loading..."
          ) : error ? (
            "Error loading data"
          ) : (
            <>
              <p className="font-medium">No detection data</p>
              <p className="text-sm">No alerts to display detection types</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (layout === "horizontal") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 5, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={customTooltip} />
          {showLegend && <Legend />}
          <Bar dataKey="value" name="Alerts" radius={[0, 4, 4, 0]}>
            {sortedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={sortedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={customTooltip} />
        {showLegend && <Legend />}
        <Bar dataKey="value" name="Alerts" radius={[4, 4, 0, 0]}>
          {sortedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}