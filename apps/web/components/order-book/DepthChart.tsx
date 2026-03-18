"use client";

import { useMemo } from "react";
import type { AggregatedBook } from "@repo/shared-types";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DepthChartProps {
  book: AggregatedBook | null;
  animationKey?: string;
}

type DepthPoint = {
  price: number;
  bidDepth: number;
  askDepth: number;
};

function formatCents(value: number): string {
  return `${(value * 100).toFixed(0)}c`;
}

export function DepthChart({ book, animationKey = "default" }: DepthChartProps) {
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

    const allPrices = [...new Set([...bidByPrice.keys(), ...askByPrice.keys()])].sort((a, b) => a - b);

    const points: DepthPoint[] = allPrices.map((price) => ({
      price,
      bidDepth: bidByPrice.get(price) ?? 0,
      askDepth: askByPrice.get(price) ?? 0,
    }));

    const maxDepth = Math.max(...points.map((p) => Math.max(p.bidDepth, p.askDepth)), 1);
    return { points, maxDepth, mid: book.mid };
  }, [book]);

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Depth Chart
          </h2>
        </div>
        <div className="h-32 flex items-center justify-center text-xs text-text-muted">
          No data for depth chart
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Depth Chart
        </h2>
      </div>

      <div className="h-40 px-2 py-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={animationKey} data={data.points} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.14)" />
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatCents}
              tick={{ fill: "rgba(148,163,184,0.8)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={40}
              tick={{ fill: "rgba(148,163,184,0.8)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(value: number) => `Price ${formatCents(value)}`}
              formatter={(value: number, name: string) => [Number(value).toFixed(2), name === "bidDepth" ? "Bid depth" : "Ask depth"]}
              contentStyle={{
                background: "rgba(10, 14, 23, 0.95)",
                border: "1px solid rgba(148,163,184,0.2)",
                borderRadius: 10,
                color: "white",
              }}
            />
            <Legend
              verticalAlign="top"
              height={24}
              wrapperStyle={{ fontSize: 10, color: "rgba(148,163,184,0.9)" }}
            />
            <ReferenceLine
              x={data.mid}
              stroke="rgba(255,255,255,0.25)"
              strokeDasharray="4 4"
              label={{ value: "Mid", fill: "rgba(148,163,184,0.85)", fontSize: 10, position: "insideTopRight" }}
            />
            <Area
              type="stepAfter"
              dataKey="bidDepth"
              name="Bid"
              stroke="#22c55e"
              fill="rgba(34, 197, 94, 0.18)"
              isAnimationActive
              animationDuration={1100}
              animationEasing="ease-in-out"
            />
            <Area
              type="stepAfter"
              dataKey="askDepth"
              name="Ask"
              stroke="#ef4444"
              fill="rgba(239, 68, 68, 0.18)"
              isAnimationActive
              animationBegin={220}
              animationDuration={1100}
              animationEasing="ease-in-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
