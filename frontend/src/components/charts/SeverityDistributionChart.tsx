"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--secondary))",
  low: "hsl(var(--info))",
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
  const customTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string }> }) => {
    if (active && payload && payload.length > 0) {
      const entry = payload[0];
      const total = data.reduce((sum, d) => sum + d.value, 0);
      const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-sm" style={{ color: SEVERITY_COLORS[entry.name] }}>
            {SEVERITY_LABELS[entry.name] || entry.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {entry.value} alerts ({percentage}%)
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
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          label={({ percent }) => (
            total > 0 && percent > 0.05 ? (
              <span className="font-mono text-xs">{`${(percent * 100).toFixed(0)}%`}</span>
            ) : null
          )}
          labelLine={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
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
            formatter={(name) => SEVERITY_LABELS[name] || name}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}