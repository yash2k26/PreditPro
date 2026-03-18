"use client";

import { useMemo } from "react";
import type { PricePoint } from "../../hooks/useOrderBook";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PriceChartProps {
  history: PricePoint[];
  animationKey?: string;
}

const YES_COLOR = "#22c55e";
const YES_FILL = "rgba(34, 197, 94, 0.1)";
const NO_COLOR = "#ef4444";
const NO_FILL = "rgba(239, 68, 68, 0.1)";

function formatCents(value: number): string {
  return `${(value * 100).toFixed(1)}c`;
}

function formatElapsed(ms: number): string {
  const elapsed = ms / 1000;
  if (elapsed < 120) return `Last ${Math.round(elapsed)}s`;
  if (elapsed < 3600) return `Last ${Math.round(elapsed / 60)}m`;
  return `Last ${(elapsed / 3600).toFixed(1)}h`;
}

export function PriceChart({ history, animationKey = "default" }: PriceChartProps) {
  const chartData = useMemo(
    () =>
      history.map((point) => ({
        time: point.time,
        yes: point.yes,
        no: point.no,
      })),
    [history]
  );

  const elapsedLabel = useMemo(() => {
    if (history.length < 2) return "";
    return formatElapsed(history[history.length - 1]!.time - history[0]!.time);
  }, [history]);

  if (history.length < 2) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Price History
          </h2>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-bid" /> Yes</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-ask" /> No</span>
          </div>
        </div>
        <div className="h-32 flex items-center justify-center text-xs text-text-muted">
          Collecting price data...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Price History
        </h2>
        <div className="flex items-center gap-3 text-[10px] text-text-muted">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-bid" /> Yes</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-ask" /> No</span>
        </div>
      </div>

      <div className="h-36 px-2 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart key={animationKey} data={chartData} margin={{ top: 8, right: 10, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.14)" />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={false}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatCents}
              tick={{ fill: "rgba(148,163,184,0.8)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              labelFormatter={() => ""}
              formatter={(value: number, name: string) => [formatCents(value), name.toUpperCase()]}
              contentStyle={{
                background: "rgba(10, 14, 23, 0.95)",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 10,
                color: "white",
              }}
            />
            <Area
              type="monotone"
              dataKey="no"
              stroke={NO_COLOR}
              strokeWidth={2}
              fill={NO_FILL}
              fillOpacity={1}
              isAnimationActive
              animationDuration={1200}
              animationEasing="ease-in-out"
            />
            <Area
              type="monotone"
              dataKey="yes"
              stroke={YES_COLOR}
              strokeWidth={2}
              fill={YES_FILL}
              fillOpacity={1}
              isAnimationActive
              animationBegin={260}
              animationDuration={1200}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="px-5 pb-3 text-[10px] text-text-muted">{elapsedLabel}</div>
    </div>
  );
}
