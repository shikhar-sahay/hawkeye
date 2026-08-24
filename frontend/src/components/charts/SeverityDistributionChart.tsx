"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TooltipProps } from "recharts";

// Semantic severity palette from the theme tokens. Each theme (light/dark)
// provides legible values, so charts stay correct when the mode switches.
const SEVERITY_COLORS: Record<string, string> = {
  critical: "hsl(var(--severity-critical))",
  high: "hsl(var(--severity-high))",
  medium: "hsl(var(--severity-medium))",
  low: "hsl(var(--severity-low))",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface SeverityData {
  name: string;
  value: number;
}

interface SeverityDistributionChartProps {
  /** Severity distribution data */
  data: SeverityData[];
  /** Chart height */
  height?: number | string;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Show legend */
  showLegend?: boolean;
}

/**
 * SeverityDistributionChart - Donut chart for alerts by severity
 * Shows distribution of Critical, High, Medium, Low severity alerts
 */
export default function SeverityDistributionChart({
  data,
  height = 250,
  isLoading = false,
  error = null,
  showLegend = true,
}: SeverityDistributionChartProps) {
  const customTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (active && payload && payload.length > 0) {
      const entry = payload[0];
      const name = String(entry.name ?? "");
      const value = Number(entry.value ?? 0);
      const total = data.reduce((sum, d) => sum + d.value, 0);
      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-sm" style={{ color: SEVERITY_COLORS[name] }}>
            {SEVERITY_LABELS[name] || name}
          </p>
          <p className="text-sm text-muted-foreground">
            {value} alerts ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  // Ensure all severities are present with correct colors
  const chartData = [
    { name: "critical", label: "Critical", color: SEVERITY_COLORS.critical },
    { name: "high", label: "High", color: SEVERITY_COLORS.high },
    { name: "medium", label: "Medium", color: SEVERITY_COLORS.medium },
    { name: "low", label: "Low", color: SEVERITY_COLORS.low },
  ].map((severity) => {
    const found = data.find((d) => d.name.toLowerCase() === severity.name);
    return {
      name: severity.name,
      value: found?.value || 0,
      fill: severity.color,
    };
  });

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

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
              <p className="font-medium">No severity data</p>
              <p className="text-sm">No alerts to display severity distribution</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          // Percentage callouts sit outside the ring in muted text so they
          // stay legible over both light and dark surfaces.
          label={({ percent }) =>
            total > 0 && percent > 0.05 ? (
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-muted-foreground font-mono"
                fontSize={11}
              >
                {(percent * 100).toFixed(0)}%
              </text>
            ) : null
          }
          labelLine={{ stroke: "hsl(var(--border))" }}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
          ))}
        </Pie>
        <Tooltip content={customTooltip} />
        {showLegend && (
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            formatter={(name) => (
              <span className="text-2xs font-medium text-foreground/90">
                {SEVERITY_LABELS[name] || name}
              </span>
            )}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}