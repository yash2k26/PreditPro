"use client";

import { memo, useMemo, useRef, useState, useEffect } from "react";
import type { PricePoint } from "../../hooks/useOrderBook";
import type { AggregatedBook, VenueId, VenueOrderBook } from "@repo/shared-types";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ProbabilityChartProps {
  history: PricePoint[];
  book: AggregatedBook | null;
  venues: Partial<Record<VenueId, VenueOrderBook>>;
  /** Pre-fetched historical data from venue APIs (Polymarket CLOB / Kalshi) */
  venueHistory?: Record<string, Array<{ t: number; y: number }>>;
}

type TimeRange = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";
type Source = "combined" | "polymarket" | "kalshi";

const RANGES: TimeRange[] = ["1H", "6H", "1D", "1W", "1M", "ALL"];
const SOURCES: { value: Source; label: string; color: string }[] = [
  { value: "combined", label: "Combined", color: "#3b82f6" },
  { value: "polymarket", label: "Polymarket", color: "#8b5cf6" },
  { value: "kalshi", label: "Kalshi", color: "#f59e0b" },
];

const RANGE_MS: Record<TimeRange, number> = {
  "1H": 60 * 60 * 1000,
  "6H": 6 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  ALL: Infinity,
};

function formatTime(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === "1H" || range === "6H" || range === "1D") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatSpan(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

interface VenuePoint {
  time: number;
  pct: number;
}

export const ProbabilityChart = memo(function ProbabilityChart({ history, book, venues, venueHistory }: ProbabilityChartProps) {
  const [range, setRange] = useState<TimeRange>("ALL");
  const [source, setSource] = useState<Source>("combined");

  // Initial draw-in animation — disable after first play for performance
  const [hasAnimated, setHasAnimated] = useState(false);

  // Track per-venue price history in refs (accumulated from live venue data)
  const polyHistoryRef = useRef<VenuePoint[]>([]);
  const kalshiHistoryRef = useRef<VenuePoint[]>([]);
  const venueSeeded = useRef(false);
  const [venueHistoryVersion, setVenueHistoryVersion] = useState(0);

  // Seed venue history refs from pre-fetched API data (once)
  useEffect(() => {
    if (venueSeeded.current || !venueHistory) return;
    let changed = false;

    if (venueHistory.polymarket?.length && polyHistoryRef.current.length === 0) {
      polyHistoryRef.current = venueHistory.polymarket.map((p) => ({ time: p.t, pct: p.y * 100 }));
      changed = true;
    }
    if (venueHistory.kalshi?.length && kalshiHistoryRef.current.length === 0) {
      kalshiHistoryRef.current = venueHistory.kalshi.map((p) => ({ time: p.t, pct: p.y * 100 }));
      changed = true;
    }

    if (changed) {
      venueSeeded.current = true;
      setVenueHistoryVersion((v) => v + 1);
    }
  }, [venueHistory]);

  // Append live venue prices on every WS update
  useEffect(() => {
    const now = Date.now();
    let changed = false;

    const polyBook = venues.polymarket;
    if (polyBook && polyBook.bids.length > 0) {
      const bestBid = polyBook.bids[0]!.price;
      const arr = polyHistoryRef.current;
      if (arr.length === 0 || arr[arr.length - 1]!.pct !== bestBid * 100) {
        arr.push({ time: now, pct: bestBid * 100 });
        if (arr.length > 2000) arr.splice(0, arr.length - 2000);
        changed = true;
      }
    }

    const kalshiBook = venues.kalshi;
    if (kalshiBook && kalshiBook.bids.length > 0) {
      const bestBid = kalshiBook.bids[0]!.price;
      const arr = kalshiHistoryRef.current;
      if (arr.length === 0 || arr[arr.length - 1]!.pct !== bestBid * 100) {
        arr.push({ time: now, pct: bestBid * 100 });
        if (arr.length > 2000) arr.splice(0, arr.length - 2000);
        changed = true;
      }
    }

    if (changed) setVenueHistoryVersion((v) => v + 1);
  }, [venues]);

  // Source color
  const lineColor = SOURCES.find((s) => s.value === source)?.color ?? "#3b82f6";

  // Data span
  const dataSpanMs = useMemo(() => {
    if (history.length < 2) return 0;
    return history[history.length - 1]!.time - history[0]!.time;
  }, [history]);

  // Range availability
  const rangeAvailability = useMemo(() => {
    const avail: Record<TimeRange, boolean> = {
      "1H": false, "6H": false, "1D": false, "1W": false, "1M": false, ALL: history.length >= 2,
    };
    for (const r of RANGES) {
      if (r === "ALL") continue;
      const cutoff = Date.now() - RANGE_MS[r];
      avail[r] = history.filter((p) => p.time >= cutoff).length >= 2;
    }
    return avail;
  }, [history]);

  // Filter by time range
  const filtered = useMemo(() => {
    if (history.length === 0) return [];
    if (range === "ALL") return history;
    const cutoff = Date.now() - RANGE_MS[range];
    return history.filter((p) => p.time >= cutoff);
  }, [history, range]);

  // Build chart data based on source
  const chartData = useMemo(() => {
    // force re-compute on venue history changes
    void venueHistoryVersion;

    if (source === "combined") {
      return filtered.map((p) => ({ time: p.time, pct: p.yes * 100 }));
    }

    const venueArr = source === "polymarket" ? polyHistoryRef.current : kalshiHistoryRef.current;
    if (venueArr.length === 0) return [];
    if (range === "ALL") return venueArr;
    const cutoff = Date.now() - RANGE_MS[range];
    return venueArr.filter((p) => p.time >= cutoff);
  }, [filtered, source, range, venueHistoryVersion]);

  // Current probability
  const currentPct = useMemo(() => {
    if (source === "combined") {
      return book?.bestBid ?? (filtered.length > 0 ? filtered[filtered.length - 1]!.yes : null);
    }
    const venueBook = venues[source === "polymarket" ? "polymarket" : "kalshi"];
    if (venueBook && venueBook.bids.length > 0) return venueBook.bids[0]!.price;
    return null;
  }, [source, book, venues, filtered]);

  // Change over period
  const startPct = chartData.length > 0 ? chartData[0]!.pct / 100 : null;
  const change = currentPct !== null && startPct !== null ? currentPct - startPct : null;

  // Y-axis auto-scale
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    let min = Infinity;
    let max = -Infinity;
    for (const d of chartData) {
      if (d.pct < min) min = d.pct;
      if (d.pct > max) max = d.pct;
    }
    const dataRange = max - min;
    const pad = Math.max(dataRange * 0.15, 3);
    return [
      Math.max(0, Math.floor((min - pad) / 5) * 5),
      Math.min(100, Math.ceil((max + pad) / 5) * 5),
    ];
  }, [chartData]);

  // Mark initial animation as done after first play
  useEffect(() => {
    if (!hasAnimated && chartData.length >= 2) {
      const timer = setTimeout(() => setHasAnimated(true), 2100);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated, chartData.length]);

  // Which sources are available (have venue data)
  const sourceAvailability: Record<Source, boolean> = {
    combined: true,
    polymarket: !!venues.polymarket && venues.polymarket.bids.length > 0,
    kalshi: !!venues.kalshi && venues.kalshi.bids.length > 0,
  };

  return (
    <div className="flex flex-col w-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums" style={{ color: lineColor }}>
              {currentPct !== null ? `${Math.round(currentPct * 100)}%` : "—"}{" "}
              <span className="text-base font-medium text-text-muted">chance</span>
            </span>
            {change !== null && change !== 0 && (
              <span
                className={`text-[13px] font-semibold tabular-nums ${change > 0 ? "text-emerald-400" : "text-rose-400"}`}
              >
                {change > 0 ? "\u25B2" : "\u25BC"} {Math.abs(Math.round(change * 100))}%
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            {dataSpanMs > 0 ? `${formatSpan(dataSpanMs)} of data` : "Collecting..."}
          </div>
        </div>

        {/* Source toggle */}
        <div className="depth-segment flex rounded-lg p-0.5 gap-0.5">
          {SOURCES.map((s) => {
            const available = sourceAvailability[s.value];
            const active = source === s.value;
            return (
              <button
                key={s.value}
                onClick={() => available && setSource(s.value)}
                disabled={!available}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                  active
                    ? "text-text-primary bg-surface-3"
                    : available
                      ? "text-text-muted hover:text-text-secondary"
                      : "text-text-muted/25 cursor-not-allowed"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: available ? s.color : "var(--color-text-muted)" , opacity: available ? 1 : 0.25 }}
                  />
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.value === "combined" ? "All" : s.value === "polymarket" ? "Poly" : "Kalshi"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="h-48 px-1">
        {chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ts: number) => formatTime(ts, range)}
                tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={60}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                labelFormatter={(ts: number) => {
                  const d = new Date(ts);
                  return d.toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                }}
                formatter={(value: number) => [
                  `${value.toFixed(1)}%`,
                  source === "combined" ? "Combined" : source === "polymarket" ? "Polymarket" : "Kalshi",
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
              <Line
                type="stepAfter"
                dataKey="pct"
                stroke={lineColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={!hasAnimated}
                animationDuration={2000}
                animationEasing="ease-out"
                activeDot={{
                  r: 4,
                  fill: lineColor,
                  stroke: "var(--color-surface-2)",
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[13px] text-text-muted">
            {source !== "combined" && !sourceAvailability[source]
              ? `No ${source === "polymarket" ? "Polymarket" : "Kalshi"} data for this market`
              : "Waiting for live price data..."}
          </div>
        )}
      </div>

      {/* Footer: time range pills */}
      <div className="px-4 py-2.5 flex items-center justify-end border-t border-border">
        <div className="flex items-center gap-1">
          {RANGES.map((r) => {
            const available = rangeAvailability[r];
            const active = range === r;
            return (
              <button
                key={r}
                onClick={() => available && setRange(r)}
                disabled={!available}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                  active
                    ? "bg-blue-500/15 text-blue-400"
                    : available
                      ? "text-text-muted hover:text-text-secondary hover:bg-surface-3"
                      : "text-text-muted/30 cursor-not-allowed"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
