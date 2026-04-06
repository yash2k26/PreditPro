"use client";

import { memo, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import type { Kline, BinanceTick } from "../../hooks/useBinance";
import type { PricePoint } from "../../hooks/useOrderBook";
import type { AggregatedBook, VenueId, VenueOrderBook } from "@repo/shared-types";
import { ProbabilityChart } from "./ProbabilityChart";

// Liveline uses canvas — must be client-only
const Liveline = dynamic(
  () => import("liveline").then((m) => ({ default: m.Liveline })),
  { ssr: false }
);

type Tab = "chances" | "line" | "candles";

const TABS: { value: Tab; label: string }[] = [
  { value: "chances", label: "Chances" },
  { value: "line", label: "Live" },
  { value: "candles", label: "Candles" },
];

const WINDOWS = [
  { label: "1H", secs: 3600 },
  { label: "4H", secs: 14400 },
  { label: "1D", secs: 86400 },
];

interface Props {
  history: PricePoint[];
  book: AggregatedBook | null;
  venues: Partial<Record<VenueId, VenueOrderBook>>;
  venueHistory?: Record<string, Array<{ t: number; y: number }>>;
  symbol: string;
  klines: Kline[];
  ticks: BinanceTick[];
  currentPrice: number | null;
  liveLineData: BinanceTick[];
}

function fmt(v: number) {
  if (!v || isNaN(v)) return "$—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const CryptoChartPanel = memo(function CryptoChartPanel({
  history, book, venues, venueHistory,
  symbol, klines, ticks, currentPrice, liveLineData,
}: Props) {
  const [tab, setTab] = useState<Tab>("chances");
  const [windowSecs, setWindowSecs] = useState(14400); // default 4H

  const [liveTheme, setLiveTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const get = () => document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    setLiveTheme(get());
    const obs = new MutationObserver(() => setLiveTheme(get()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const lineData = useMemo(
    () => liveLineData.map((p) => ({ time: Math.floor(p.time / 1000), value: p.price })),
    [liveLineData]
  );

  const candleData = useMemo(
    () => klines.map((k) => ({
      time: Math.floor(k.time / 1000),
      open: k.open, high: k.high, low: k.low, close: k.close,
    })),
    [klines]
  );

  const liveCandle = useMemo(() => {
    if (ticks.length === 0 || !currentPrice) return undefined;
    let high = -Infinity;
    let low = Infinity;
    for (const t of ticks) {
      if (t.price > high) high = t.price;
      if (t.price < low) low = t.price;
    }
    return {
      time: Math.floor(ticks[0]!.time / 1000),
      open: ticks[0]!.price,
      high,
      low,
      close: currentPrice,
    };
  }, [ticks, currentPrice]);

  const hasData = lineData.length >= 2 && currentPrice !== null;

  return (
    <div className="depth-card rounded-xl overflow-hidden">
      {/* Single header row: tabs | window pills | price */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0">
        {/* Chart type tabs */}
        {TABS.map((t) => (
          <motion.button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t.value ? "text-accent" : "text-text-muted hover:text-text"
            }`}
          >
            {tab === t.value && (
              <motion.div
                layoutId="crypto-tab"
                className="absolute inset-0 rounded-md bg-accent/10 border border-accent/20"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </motion.button>
        ))}

        {/* Time window buttons — only when on a chart tab */}
        {tab !== "chances" && (
          <div className="flex items-center gap-0.5 ml-3">
            {WINDOWS.map((w) => (
              <button
                key={w.secs}
                onClick={() => setWindowSecs(w.secs)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                  windowSecs === w.secs
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {/* Live price */}
        {tab !== "chances" && currentPrice !== null && (
          <div className="ml-auto flex items-baseline gap-1.5">
            <span className="text-sm font-bold tabular-nums text-amber-400">{fmt(currentPrice)}</span>
            <span className="text-[10px] text-text-muted">{symbol}</span>
          </div>
        )}
      </div>

      {/* Charts */}
      {tab === "chances" && (
        <ProbabilityChart history={history} book={book} venues={venues} venueHistory={venueHistory} />
      )}

      {tab === "line" && (
        <div style={{ height: 320 }}>
          <Liveline
            data={hasData ? lineData : []}
            value={hasData ? currentPrice! : 0}
            window={windowSecs}
            loading={!hasData}
            emptyText="Connecting to Binance…"
            theme={liveTheme}
            color="#f59e0b"
            fill
            badge
            badgeTail
            pulse
            momentum
            scrub
            grid
            formatValue={fmt}
            lineWidth={2}
            degen
          />
        </div>
      )}

      {tab === "candles" && (
        <div style={{ height: 320 }}>
          <Liveline
            data={hasData ? lineData : []}
            value={hasData ? currentPrice! : 0}
            window={windowSecs}
            mode="candle"
            candles={candleData.length > 0 ? candleData : []}
            candleWidth={300}
            liveCandle={liveCandle}
            lineData={hasData ? lineData : []}
            lineValue={hasData ? currentPrice! : 0}
            loading={candleData.length === 0}
            emptyText="Loading candle data…"
            theme={liveTheme}
            badge
            scrub
            grid
            formatValue={fmt}
          />
        </div>
      )}
    </div>
  );
});
