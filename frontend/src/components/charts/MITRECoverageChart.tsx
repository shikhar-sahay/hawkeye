"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MITREDataPoint {
  name: string;
  value: number;
  type: "tactic" | "technique";
}

interface MITRECoverageChartProps {
  /** MITRE tactics/techniques data */
  data: MITREDataPoint[];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Chart height */
  height?: number;
  /** Maximum number of bars to show */
  maxBars?: number;
  /** Show only tactics or techniques */
  filterType?: "tactic" | "technique" | "all";
}

/**
 * MITRECoverageChart - Horizontal bar chart for MITRE ATT&CK coverage
 */
export function MITRECoverageChart({
  data,
  isLoading = false,
  error = null,
  height = 300,
  maxBars = 15,
  filterType = "all",
}: MITRECoverageChartProps) {
  const TACTIC_LABELS: Record<string, string> = {
    reconnaissance: "Reconnaissance",
    resource_development: "Resource Development",
    initial_access: "Initial Access",
    execution: "Execution",
    persistence: "Persistence",
    privilege_escalation: "Privilege Escalation",
    defense_evasion: "Defense Evasion",
    credential_access: "Credential Access",
    discovery: "Discovery",
    lateral_movement: "Lateral Movement",
    collection: "Collection",
    command_and_control: "Command & Control",
    exfiltration: "Exfiltration",
    impact: "Impact",
  };

  const TACTIC_COLORS: Record<string, string> = {
    reconnaissance: "#3b82f6",
    resource_development: "#6366f1",
    initial_access: "#8b5cf6",
    execution: "#a855f7",
    persistence: "#d946ef",
    privilege_escalation: "#ec4899",
    defense_evasion: "#f43f5e",
    credential_access: "#ef4444",
    discovery: "#f97316",
    lateral_movement: "#f59e0b",
    collection: "#eab308",
    command_and_control: "#84cc16",
    exfiltration: "#22c55e",
    impact: "#10b981",
  };

  const customTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }> }) => {
    if (active && payload && payload.length > 0) {
      const entry = payload[0];
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-sm" style={{ color: entry.color }}>
            {TACTIC_LABELS[entry.name] || entry.name}
          </p>
          <p className="text-sm text-muted-foreground">
            Count: <span className="font-mono font-medium">{entry.value}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  // Filter and sort data
  const filteredData = data
    .filter((d) => filterType === "all" || d.type === filterType)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxBars)
    .map((d) => ({
      ...d,
      label: d.type === "tactic" ? (TACTIC_LABELS[d.name] || d.name) : d.name,
      color: d.type === "tactic" ? (TACTIC_COLORS[d.name] || "#6366f1") : "#6366f1",
    }));

  const total = filteredData.reduce((sum, d) => sum + d.value, 0);

  if (isLoading || error || total === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ height }}>
        <div className="text-center text-muted-foreground">
          {isLoading ? (
            "Loading..."
          ) : error ? (
            "Error loading MITRE data"
          ) : (
            <>
              <p className="font-medium">No MITRE ATT&CK data</p>
              <p className="text-sm">No alerts with MITRE tags found</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={filteredData}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 5, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} horizontal={true} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={160}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={customTooltip} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
          {filteredData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}