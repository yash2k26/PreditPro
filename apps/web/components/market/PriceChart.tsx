"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { PricePoint } from "../../hooks/useOrderBook";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PriceChartProps {
  history: PricePoint[];
}

const YES_COLOR = "#22c55e";
const NO_COLOR = "#ef4444";

function formatCents(value: number): string {
  return `${(value * 100).toFixed(1)}¢`;
}

function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 120) return `Last ${Math.round(s)}s`;
  if (s < 3600) return `Last ${Math.round(s / 60)}m`;
  return `Last ${(s / 3600).toFixed(1)}h`;
}

export const PriceChart = memo(function PriceChart({ history }: PriceChartProps) {
  const [hasAnimated, setHasAnimated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) setInView(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    if (!hasAnimated && chartData.length >= 2 && inView) {
      const timer = setTimeout(() => setHasAnimated(true), 2100);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated, chartData.length, inView]);

  // Auto-scale Y domain
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const d of chartData) {
      if (d.yes < min) min = d.yes;
      if (d.yes > max) max = d.yes;
      if (d.no < min) min = d.no;
      if (d.no > max) max = d.no;
    }
    const range = max - min;
    const pad = Math.max(range * 0.15, 0.03);
    return [Math.max(0, min - pad), Math.min(1, max + pad)];
  }, [chartData]);

  if (history.length < 2) {
    return (
      <div ref={containerRef} className="depth-card rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
            Price History
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Yes
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> No
            </span>
          </div>
        </div>
        <div className="h-32 flex items-center justify-center text-[13px] text-text-muted">
          Collecting price data...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="depth-card rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
          Price History
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Yes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> No
          </span>
          {elapsedLabel && (
            <span className="text-text-muted/60">{elapsedLabel}</span>
          )}
        </div>
      </div>

      <div className="h-48 px-1 py-2">
        {inView ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="yesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={YES_COLOR} stopOpacity={0.2} />
                <stop offset="100%" stopColor={YES_COLOR} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="noFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NO_COLOR} stopOpacity={0.2} />
                <stop offset="100%" stopColor={NO_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={false}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={formatCents}
              tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              labelFormatter={(ts: number) => {
                const d = new Date(ts);
                return d.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
              }}
              formatter={(value: number, name: string) => [
                formatCents(value),
                name === "yes" ? "Yes" : "No",
              ]}
              contentStyle={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 10,
                color: "var(--color-text-primary)",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              }}
            />
            <Area
              type="monotone"
              dataKey="yes"
              stroke={YES_COLOR}
              strokeWidth={2}
              fill="url(#yesFill)"
              fillOpacity={1}
              isAnimationActive={!hasAnimated}
              animationDuration={2000}
              animationEasing="ease-out"
              dot={false}
              activeDot={{
                r: 3.5,
                fill: YES_COLOR,
                stroke: "var(--color-surface-2)",
                strokeWidth: 2,
              }}
            />
            <Area
              type="monotone"
              dataKey="no"
              stroke={NO_COLOR}
              strokeWidth={2}
              fill="url(#noFill)"
              fillOpacity={1}
              isAnimationActive={!hasAnimated}
              animationDuration={2000}
              animationEasing="ease-out"
              dot={false}
              activeDot={{
                r: 3.5,
                fill: NO_COLOR,
                stroke: "var(--color-surface-2)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
        ) : (
          <div className="h-full" />
        )}
      </div>
    </div>
  );
});
