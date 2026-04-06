"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { AggregatedBook } from "@repo/shared-types";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DepthChartProps {
  book: AggregatedBook | null;
}

type DepthPoint = {
  price: number;
  bidDepth: number;
  askDepth: number;
};

const BID_COLOR = "#22c55e";
const ASK_COLOR = "#ef4444";

function formatCents(value: number): string {
  return `${(value * 100).toFixed(0)}¢`;
}

function formatDepth(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(0);
}

export const DepthChart = memo(function DepthChart({ book }: DepthChartProps) {
  const [hasAnimated, setHasAnimated] = useState(false);

  // Only render chart when scrolled into view
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

  const data = useMemo(() => {
    if (!book || book.mid === null) return null;

    let bidCum = 0;
    const bidByPrice = new Map<number, number>();
    for (const level of book.bids) {
      bidCum += level.totalSize;
      bidByPrice.set(level.price, bidCum);
    }

    let askCum = 0;
    const askByPrice = new Map<number, number>();
    for (const level of book.asks) {
      askCum += level.totalSize;
      askByPrice.set(level.price, askCum);
    }

    const allPrices = [...new Set([...bidByPrice.keys(), ...askByPrice.keys()])].sort(
      (a, b) => a - b
    );

    const points: DepthPoint[] = allPrices.map((price) => ({
      price,
      bidDepth: bidByPrice.get(price) ?? 0,
      askDepth: askByPrice.get(price) ?? 0,
    }));

    return { points, mid: book.mid };
  }, [book]);

  useEffect(() => {
    if (!hasAnimated && data && inView) {
      const timer = setTimeout(() => setHasAnimated(true), 2100);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated, data, inView]);

  if (!data) {
    return (
      <div ref={containerRef} className="depth-card rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
            Depth Chart
          </h2>
        </div>
        <div className="h-32 flex items-center justify-center text-[13px] text-text-muted">
          No data for depth chart
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="depth-card rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
          Depth Chart
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Bid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Ask
          </span>
        </div>
      </div>

      <div className="h-48 px-1 py-2">
        {inView ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="bidFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BID_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={BID_COLOR} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="askFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ASK_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={ASK_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatCents}
              tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={50}
            />
            <YAxis
              tickFormatter={formatDepth}
              tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              labelFormatter={(value: number) => `Price: ${formatCents(value)}`}
              formatter={(value: number, name: string) => [
                formatDepth(Number(value)),
                name === "bidDepth" ? "Bid depth" : "Ask depth",
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
            <ReferenceLine
              x={data.mid}
              stroke="var(--color-text-muted)"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            <Area
              type="stepAfter"
              dataKey="bidDepth"
              stroke={BID_COLOR}
              strokeWidth={1.5}
              fill="url(#bidFill)"
              fillOpacity={1}
              isAnimationActive={!hasAnimated}
              animationDuration={2000}
              animationEasing="ease-out"
              dot={false}
            />
            <Area
              type="stepAfter"
              dataKey="askDepth"
              stroke={ASK_COLOR}
              strokeWidth={1.5}
              fill="url(#askFill)"
              fillOpacity={1}
              isAnimationActive={!hasAnimated}
              animationDuration={2000}
              animationEasing="ease-out"
              dot={false}
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
