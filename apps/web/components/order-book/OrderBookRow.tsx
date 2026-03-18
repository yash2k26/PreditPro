"use client";

import { memo } from "react";
import type { AggregatedLevel, VenueId } from "@repo/shared-types";
import { formatPrice, formatSize } from "../../lib/format";

interface OrderBookRowProps {
  bid: AggregatedLevel | null;
  ask: AggregatedLevel | null;
  maxSize: number;
  showVenues: boolean;
}

function VenueBar({
  venues,
  totalSize,
  maxSize,
  side,
}: {
  venues: Partial<Record<VenueId, number>>;
  totalSize: number;
  maxSize: number;
  side: "bid" | "ask";
}) {
  if (totalSize <= 0 || maxSize <= 0) return null;
  const widthPct = (totalSize / maxSize) * 100;
  const polyPct = ((venues.polymarket ?? 0) / totalSize) * 100;

  return (
    <div
      className={`absolute top-0 bottom-0 ${
        side === "bid" ? "right-0" : "left-0"
      }`}
      style={{ width: `${widthPct}%` }}
    >
      {/* Polymarket portion */}
      <div
        className={`absolute top-0 bottom-0 ${
          side === "bid" ? "right-0" : "left-0"
        } bg-polymarket opacity-15`}
        style={{ width: `${polyPct}%` }}
      />
      {/* Kalshi portion */}
      <div
        className={`absolute top-0 bottom-0 ${
          side === "bid" ? "left-0" : "right-0"
        } bg-kalshi opacity-15`}
        style={{ width: `${100 - polyPct}%` }}
      />
    </div>
  );
}

function SimpleBar({
  totalSize,
  maxSize,
  side,
}: {
  totalSize: number;
  maxSize: number;
  side: "bid" | "ask";
}) {
  if (totalSize <= 0 || maxSize <= 0) return null;
  const widthPct = (totalSize / maxSize) * 100;
  return (
    <div
      className={`absolute top-0 bottom-0 ${
        side === "bid" ? "right-0" : "left-0"
      } ${side === "bid" ? "bg-bid" : "bg-ask"} opacity-10`}
      style={{ width: `${widthPct}%` }}
    />
  );
}

function VenueLabel({ venues }: { venues: Partial<Record<VenueId, number>> }) {
  const parts: string[] = [];
  if (venues.polymarket) parts.push("P");
  if (venues.kalshi) parts.push("K");
  return (
    <span className="text-[10px] text-text-muted">
      {parts.join("+")}
    </span>
  );
}

export const OrderBookRow = memo(function OrderBookRow({
  bid,
  ask,
  maxSize,
  showVenues,
}: OrderBookRowProps) {
  return (
    <div className="grid grid-cols-2 text-xs leading-6 hover:bg-surface-hover transition-colors">
      {/* Bid side */}
      <div className="relative grid grid-cols-3 px-3">
        {bid && (
          <>
            {showVenues ? (
              <VenueBar
                venues={bid.venues}
                totalSize={bid.totalSize}
                maxSize={maxSize}
                side="bid"
              />
            ) : (
              <SimpleBar totalSize={bid.totalSize} maxSize={maxSize} side="bid" />
            )}
            <span className="relative text-left">
              {showVenues && <VenueLabel venues={bid.venues} />}
            </span>
            <span className="relative text-right text-text-secondary">
              {formatSize(bid.totalSize)}
            </span>
            <span className="relative text-right font-medium text-bid">
              {formatPrice(bid.price)}
            </span>
          </>
        )}
      </div>

      {/* Ask side */}
      <div className="relative grid grid-cols-3 px-3 border-l border-border">
        {ask && (
          <>
            {showVenues ? (
              <VenueBar
                venues={ask.venues}
                totalSize={ask.totalSize}
                maxSize={maxSize}
                side="ask"
              />
            ) : (
              <SimpleBar totalSize={ask.totalSize} maxSize={maxSize} side="ask" />
            )}
            <span className="relative text-left font-medium text-ask">
              {formatPrice(ask.price)}
            </span>
            <span className="relative text-left text-text-secondary">
              {formatSize(ask.totalSize)}
            </span>
            <span className="relative text-right">
              {showVenues && <VenueLabel venues={ask.venues} />}
            </span>
          </>
        )}
      </div>
    </div>
  );
});
