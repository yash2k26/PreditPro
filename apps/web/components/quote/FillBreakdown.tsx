"use client";

import type { FillLeg } from "@repo/shared-types";
import { formatDollars, formatPrice, formatSize } from "../../lib/format";

interface FillBreakdownProps {
  fills: FillLeg[];
  totalCost: number;
}

const VENUE_COLORS: Record<string, string> = {
  polymarket: "var(--color-polymarket)",
  kalshi: "var(--color-kalshi)",
};

const VENUE_LABELS: Record<string, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
};

export function FillBreakdown({ fills, totalCost }: FillBreakdownProps) {
  if (fills.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">Fill breakdown</div>

      {/* Visual proportion bar */}
      <div className="flex h-2 rounded-xl overflow-hidden gap-px">
        {fills.map((fill) => {
          const pct = totalCost > 0 ? (fill.cost / totalCost) * 100 : 0;
          return (
            <div
              key={fill.venue}
              className="rounded-sm opacity-70"
              style={{
                width: `${pct}%`,
                backgroundColor: VENUE_COLORS[fill.venue] ?? "#666",
              }}
            />
          );
        })}
      </div>

      {/* Per-venue details */}
      <div className="space-y-1.5">
        {fills.map((fill) => (
          <div key={fill.venue} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: VENUE_COLORS[fill.venue] ?? "#666" }}
              />
              <span className="text-text-secondary">
                {VENUE_LABELS[fill.venue] ?? fill.venue}
              </span>
            </div>
            <div className="flex items-center gap-3 text-text-secondary">
              <span>{formatSize(fill.shares)} shares</span>
              <span>@ {formatPrice(fill.avgPrice)}</span>
              <span className="text-text-primary">
                {formatDollars(fill.cost)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
