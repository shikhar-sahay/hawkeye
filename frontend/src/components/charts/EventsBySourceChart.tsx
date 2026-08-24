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
} from "recharts";
import type { TooltipProps } from "recharts";

interface SourceDataPoint {
  name: string;
  events: number;
  alerts: number;
  incidents: number;
  isActive: boolean;
}

interface EventsBySourceChartProps {
  /** Source data with event/alert/incident counts */
  data: SourceDataPoint[];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Chart height */
  height?: number | string;
  /** Maximum number of sources to show */
  maxSources?: number;
  /** Show stacked or grouped bars */
  stacked?: boolean;
}

/**
 * EventsBySourceChart - Stacked bar chart showing events, alerts, incidents by source
 */
export default function EventsBySourceChart({
  data,
  isLoading = false,
  error = null,
  height = 250,
  maxSources = 10,
  stacked = true,
}: EventsBySourceChartProps) {
  const customTooltip = ({ active, payload }: TooltipProps<number, string>) => {
    if (active && payload && payload.length > 0) {
      const sourceData = payload[0].payload as unknown as SourceDataPoint;
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-sm">{sourceData.name}</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
              <span>Events: <span className="font-mono font-medium">{sourceData.events.toLocaleString()}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(var(--destructive))" }} />
              <span>Alerts: <span className="font-mono font-medium">{sourceData.alerts.toLocaleString()}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "hsl(var(--warning))" }} />
              <span>Incidents: <span className="font-mono font-medium">{sourceData.incidents.toLocaleString()}</span></span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Sort by total (events + alerts + incidents) and limit
  const sortedData = [...data]
    .sort((a, b) => (b.events + b.alerts + b.incidents) - (a.events + a.alerts + a.incidents))
    .slice(0, maxSources)
    .map((d) => ({
      ...d,
      shortName: d.name.length > 20 ? d.name.substring(0, 17) + "..." : d.name,
    }));

  if (isLoading || error || sortedData.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ height }}>
        <div className="text-center text-muted-foreground">
          {isLoading ? (
            "Loading..."
          ) : error ? (
            "Error loading data"
          ) : (
            <>
              <p className="font-medium">No source data</p>
              <p className="text-sm">No sources with event data found</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={sortedData}
        layout="vertical"
        margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
        stackOffset={stacked ? "expand" : "none"}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} horizontal={true} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => stacked ? `${(value * 100).toFixed(0)}%` : value.toLocaleString()}
        />
        <YAxis
          type="category"
          dataKey="shortName"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={180}
        />
        <Tooltip content={customTooltip} />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ paddingBottom: 10 }}
        />
        <Bar
          dataKey="events"
          name="Events"
          stackId="a"
          radius={[0, 4, 4, 0]}
          fill="hsl(var(--primary))"
        />
        <Bar
          dataKey="alerts"
          name="Alerts"
          stackId="a"
          radius={[0, 4, 4, 0]}
          fill="hsl(var(--destructive))"
        />
        <Bar
          dataKey="incidents"
          name="Incidents"
          stackId="a"
          radius={[0, 4, 4, 0]}
          fill="hsl(var(--warning))"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}