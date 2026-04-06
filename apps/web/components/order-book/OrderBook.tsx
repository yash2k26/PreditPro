"use client";

import { memo, useMemo, useState } from "react";
import type { AggregatedBook, VenueId, VenueOrderBook } from "@repo/shared-types";

type ViewMode = "combined" | "polymarket" | "kalshi";

interface OrderBookProps {
  aggregated: AggregatedBook | null;
  venues: Partial<Record<VenueId, VenueOrderBook>>;
}

type DisplayLevel = {
  price: number;
  totalSize: number;
};

type BookRow = {
  price: number;
  size: number;
  total: number;
  barPct: number;
};
type RawBookRow = Omit<BookRow, "barPct">;

const MAX_ROWS = 8;

function formatPrice(price: number | null): string {
  if (price === null) return "-";
  return `${(price * 100).toFixed(2)}`;
}

function formatSize(size: number): string {
  return size.toFixed(2);
}

function buildAskRows(levels: DisplayLevel[]): RawBookRow[] {
  if (levels.length === 0) return [];

  let running = 0;
  const withTotals = levels.map((level) => {
    running += level.totalSize;
    return {
      price: level.price,
      size: level.totalSize,
      total: running,
    };
  });

  return withTotals.reverse();
}

function buildBidRows(levels: DisplayLevel[]): RawBookRow[] {
  if (levels.length === 0) return [];

  let running = 0;
  return levels.map((level) => {
    running += level.totalSize;
    return {
      price: level.price,
      size: level.totalSize,
      total: running,
    };
  });
}

export const OrderBook = memo(function OrderBook({ aggregated, venues }: OrderBookProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("combined");

  const { displayBids, displayAsks } = useMemo(() => {
    if (!aggregated) {
      return { displayBids: [] as DisplayLevel[], displayAsks: [] as DisplayLevel[] };
    }

    if (viewMode === "combined") {
      return {
        displayBids: aggregated.bids.slice(0, MAX_ROWS).map((l) => ({ price: l.price, totalSize: l.totalSize })),
        displayAsks: aggregated.asks.slice(0, MAX_ROWS).map((l) => ({ price: l.price, totalSize: l.totalSize })),
      };
    }

    const venueBook = venues[viewMode];
    if (!venueBook) {
      return { displayBids: [] as DisplayLevel[], displayAsks: [] as DisplayLevel[] };
    }

    return {
      displayBids: venueBook.bids.slice(0, MAX_ROWS).map((l) => ({ price: l.price, totalSize: l.size })),
      displayAsks: venueBook.asks.slice(0, MAX_ROWS).map((l) => ({ price: l.price, totalSize: l.size })),
    };
  }, [aggregated, venues, viewMode]);

  const { askRows, bidRows, maxTotal } = useMemo(() => {
    const asks = buildAskRows(displayAsks);
    const bids = buildBidRows(displayBids);
    const max = Math.max(
      ...asks.map((r) => r.total),
      ...bids.map((r) => r.total),
      1
    );

    return {
      askRows: asks.map((r) => ({ ...r, barPct: (r.total / max) * 100 })),
      bidRows: bids.map((r) => ({ ...r, barPct: (r.total / max) * 100 })),
      maxTotal: max,
    };
  }, [displayAsks, displayBids]);

  return (
    <div className="depth-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
          Order Book
        </h2>
        <div className="depth-segment flex gap-1 rounded-xl p-1">
          {(["combined", "polymarket", "kalshi"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-[13px] font-medium rounded-lg transition-colors ${
                viewMode === mode
                  ? "bg-surface-3 text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <span className="sm:hidden">{mode === "combined" ? "All" : mode === "polymarket" ? "Poly" : "Kalshi"}</span>
              <span className="hidden sm:inline">{mode === "combined" ? "Combined" : mode === "polymarket" ? "Polymarket" : "Kalshi"}</span>
            </button>
          ))}
        </div>
      </div>

      {!aggregated ? (
        <div className="py-12 text-center text-sm text-text-muted">Waiting for data...</div>
      ) : askRows.length === 0 && bidRows.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-muted">No orders</div>
      ) : (
        <div className="px-1.5 py-1.5">
          <div className="grid grid-cols-3 text-[10px] uppercase tracking-wider font-semibold text-text-muted px-2 py-1.5 border-b border-border">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total</span>
          </div>

          <div className="space-y-0.5 pt-1.5">
            {askRows.map((row) => (
              <div key={`ask-${row.price}`} className="relative grid grid-cols-3 items-center px-2 py-1 text-[12px] font-medium tabular-nums">
                <div
                  className="absolute inset-y-px right-1 rounded-sm bg-rose-500/18 transition-[width] duration-300 ease-out"
                  style={{ width: `${row.barPct}%` }}
                />
                <span className="relative z-10 text-ask">{formatPrice(row.price)}</span>
                <span className="relative z-10 text-right text-text-primary">{formatSize(row.size)}</span>
                <span className="relative z-10 text-right text-text-primary">{formatSize(row.total)}</span>
              </div>
            ))}
          </div>

          <div className="my-1.5 border-t border-b border-border px-2 py-1.5 text-center text-[13px] font-semibold tabular-nums text-bid">
            {formatPrice(aggregated.mid)}
          </div>

          <div className="space-y-0.5 pb-0.5">
            {bidRows.map((row) => (
              <div key={`bid-${row.price}`} className="relative grid grid-cols-3 items-center px-2 py-1 text-[12px] font-medium tabular-nums">
                <div
                  className="absolute inset-y-px left-1 rounded-sm bg-emerald-500/20 transition-[width] duration-300 ease-out"
                  style={{ width: `${row.barPct}%` }}
                />
                <span className="relative z-10 text-bid">{formatPrice(row.price)}</span>
                <span className="relative z-10 text-right text-text-primary">{formatSize(row.size)}</span>
                <span className="relative z-10 text-right text-text-primary">{formatSize(row.total)}</span>
              </div>
            ))}
          </div>

          <div className="px-2 pt-1.5 text-[11px] text-text-muted border-t border-border">
            Max cumulative depth: {formatSize(maxTotal)}
          </div>
        </div>
      )}
    </div>
  );
});
