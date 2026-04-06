"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useMemo, useRef, Suspense, memo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ExploreMarket, MarketsResponse, ServerMessage } from "@repo/shared-types";
import { useWebSocket } from "../hooks/useWebSocket";
import { SECTION_LABEL } from "../lib/market-sections";
import { SortDropdown } from "../components/layout/SortDropdown";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

type SortOption = "volume" | "liquidity" | "price" | "newest";
type VenueFilter = "all" | "matched" | "polymarket" | "kalshi";

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "volume", label: "Volume (24h)" },
  { value: "liquidity", label: "Liquidity" },
  { value: "price", label: "Price (high)" },
  { value: "newest", label: "Newest" },
];

function formatNum(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "-";
}

function formatPct(value: number | null): string {
  if (value === null) return "--%";
  return `${Math.round(value * 100)}%`;
}


function MarketAvatar({ market }: { market: ExploreMarket }) {
  const imageUrl = market.imageUrl ?? market.venues.find((v) => v.imageUrl)?.imageUrl ?? null;
  const fallbackLetter = market.category?.trim()?.[0]?.toUpperCase() ?? "M";

  if (imageUrl) {
    return (
      <div className="relative h-11 w-11 shrink-0">
        <img
          src={imageUrl}
          alt={market.question}
          className="h-full w-full rounded-xl object-cover border border-white/10"
        />
        <div className="absolute inset-0 rounded-xl shadow-inner pointer-events-none" />
      </div>
    );
  }

  return (
    <div className="h-11 w-11 rounded-xl border border-white/5 bg-surface-3 flex items-center justify-center text-xs font-bold text-text-muted shrink-0 shadow-sm">
      {fallbackLetter}
    </div>
  );
}

function VenueBadge({ venue }: { venue: "polymarket" | "kalshi" }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${venue === "polymarket"
        ? "bg-slate-600/30 text-slate-200 border border-slate-500/30"
        : "bg-zinc-700/35 text-zinc-200 border border-zinc-500/30"
        }`}
    >
      {venue === "polymarket" ? "Poly" : "Kalshi"}
    </span>
  );
}

function OutcomeButton({
  label,
  pctText,
  color,
}: {
  label: string;
  pctText: string;
  color: "emerald" | "rose" | "neutral";
}) {
  const isEmerald = color === "emerald";
  const isRose = color === "rose";

  return (
    <div className={`flex flex-col justify-between flex-1 p-3.5 rounded-xl border transition-all duration-200 group/btn min-h-[76px] ${
      isEmerald 
        ? "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/20" 
        : isRose 
          ? "bg-rose-500/5 border-rose-500/10 hover:border-rose-500/20" 
          : "bg-surface-3 border-border hover:border-border/80"
    }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{label}</span>
        <div className={`w-1.5 h-1.5 mt-1 rounded-full ${isEmerald ? "bg-emerald-500 shadow-[0_0_4px_var(--color-bid)]" : isRose ? "bg-rose-500 shadow-[0_0_4px_var(--color-ask)]" : "bg-text-muted"}`} />
      </div>
      <div className="flex border-t-0 items-end justify-between">
        <span className={`text-[1.35rem] font-bold tabular-nums leading-none tracking-tight ${isEmerald ? "text-emerald-500" : isRose ? "text-rose-500" : "text-text-primary"}`}>
          {pctText}
        </span>
        <div className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
          isEmerald ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/10" : isRose ? "border-rose-500/20 text-rose-500 bg-rose-500/10" : "border-border text-text-muted bg-surface-2"
        }`}>
          Trade
        </div>
      </div>
    </div>
  );
}

const MarketCard = memo(function MarketCard({ market }: { market: ExploreMarket }) {
  const yesValue = market.yesPrice;
  const noValue = yesValue === null ? null : 1 - yesValue;
  const outcomes = market.outcomes || ["Yes", "No"];
  const yesLabel = outcomes[0] ?? "Yes";
  const noLabel = outcomes[1] ?? "No";
  const yesPct = formatPct(yesValue);
  const noPct = formatPct(noValue);

  return (
    <Link
      href={`/market/${encodeURIComponent(market.id)}`}
      className="depth-card depth-card-hover group relative flex flex-col overflow-hidden rounded-[24px]"
    >
      {/* Header / Meta */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-4 mb-4">
          <MarketAvatar market={market} />
          <div className="flex flex-col items-end gap-1.5 pt-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
              {market.category || "General"}
            </span>
            <div className="flex gap-1.5">
              {market.venues.map((v) => (
                <span key={v.venue} className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase border ${
                  v.venue === 'polymarket' ? 'border-[#3B82F6]/20 text-[#3B82F6] bg-[#3B82F6]/5' : 'border-[#F59E0B]/20 text-[#F59E0B] bg-[#F59E0B]/5'
                }`}>
                  {v.venue === 'polymarket' ? 'Poly' : 'Kalshi'}
                </span>
              ))}
            </div>
          </div>
        </div>
        <h3 className="line-clamp-2 text-[1.125rem] leading-[1.3] font-bold text-text-primary tracking-tight group-hover:text-accent transition-colors">
          {market.question}
        </h3>
      </div>

      {/* Trade Bar (Outcome Buttons) */}
      <div className="px-5 mb-5 mt-1 flex gap-3">
        <OutcomeButton
          label={yesLabel}
          pctText={yesPct}
          color={yesValue !== null && noValue !== null && yesValue >= noValue ? "emerald" : "neutral"}
        />
        <OutcomeButton
          label={noLabel}
          pctText={noPct}
          color={noValue !== null && yesValue !== null && noValue > yesValue ? "emerald" : "neutral"}
        />
      </div>

      {/* Footer Bar */}
      <div className="mt-auto px-4 sm:px-5 py-3 sm:py-4 border-t border-border flex items-center justify-between bg-surface-2/30">
        <div className="flex items-center gap-5 sm:gap-7">
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[13px] text-text-primary font-bold tabular-nums leading-none tracking-tight">{formatNum(market.volume24h)}</span>
            <span className="text-[10px] font-semibold uppercase text-text-muted tracking-widest">Vol</span>
          </div>
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[13px] text-text-primary font-bold tabular-nums leading-none tracking-tight">{formatNum(market.liquidity)}</span>
            <span className="text-[10px] font-semibold uppercase text-text-muted tracking-widest">Liq</span>
          </div>
        </div>
      </div>
    </Link>
  );
});

function MarketCardSkeleton() {
  return (
    <div className="depth-card rounded-[24px] p-5 animate-pulse">
      <div className="mb-5 flex gap-4">
        <div className="h-12 w-12 rounded-xl bg-surface-3" />
        <div className="flex-1 space-y-3">
          <div className="h-3 rounded bg-surface-3 w-24" />
          <div className="h-5 rounded bg-surface-3 w-full" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-10 rounded-xl bg-surface-3" />
        <div className="h-10 rounded-xl bg-surface-3" />
      </div>
      <div className="mt-6 pt-4 border-t border-border flex justify-between">
        <div className="h-4 rounded bg-surface-3 w-20" />
        <div className="h-8 w-8 rounded-full bg-surface-3" />
      </div>
    </div>
  );
}

const TrendingCarousel = memo(function TrendingCarousel({
  markets,
  activeIndex,
  onSelect,
  liveHistory,
}: {
  markets: ExploreMarket[];
  activeIndex: number;
  onSelect: (index: number) => void;
  liveHistory: Record<string, { time: number; yes: number }[]>;
}) {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set<string>());

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bookmarked-markets");
      if (saved) setBookmarks(new Set(JSON.parse(saved) as string[]));
    } catch { /* ignore */ }
  }, []);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleBookmark = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("bookmarked-markets", JSON.stringify([...next]));
      return next;
    });
  };

  const copyLink = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/market/${encodeURIComponent(id)}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => prev === id ? null : prev), 2000);
  };

  if (markets.length === 0) return null;

  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-4 px-1">
        <h2 className="text-[13px] font-semibold text-text-primary">
          Trending
        </h2>
        <span className="text-[11px] font-medium text-text-muted">Live data</span>
      </div>

      <div className="relative overflow-hidden">
        <div
          className="flex transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {markets.map((market) => {
            const history = liveHistory[market.id] ?? [];
            const yesValue = market.yesPrice;
            const noValue = yesValue === null ? null : 1 - yesValue;
            const latestLive = history.length > 0 ? history[history.length - 1] : null;
            const currentYes = latestLive ? latestLive.yes : yesValue;
            const currentNo = currentYes === null ? null : 1 - currentYes;
            const outcomes = market.outcomes || ["Yes", "No"];
            const yesLabel = outcomes[0] ?? "Yes";
            const noLabel = outcomes[1] ?? "No";
            const imageUrl = market.imageUrl ?? market.venues.find((v) => v.imageUrl)?.imageUrl ?? null;
            const yesSeries = history.length >= 2
              ? history.map(p => Math.round(p.yes * 100))
              : Array(2).fill(Math.round((yesValue ?? 0.5) * 100));
            const noSeries = history.length >= 2
              ? history.map(p => Math.round((1 - p.yes) * 100))
              : Array(2).fill(Math.round((noValue ?? 0.5) * 100));
            // Auto-scale Y-axis for recharts domain
            const allValues = [...yesSeries, ...noSeries];
            const dataMin = Math.min(...allValues);
            const dataMax = Math.max(...allValues);
            const range = dataMax - dataMin;
            const padding = Math.max(range * 0.2, 5);
            const yMin = Math.max(0, Math.floor((dataMin - padding) / 5) * 5);
            const yMax = Math.min(100, Math.ceil((dataMax + padding) / 5) * 5);

            return (
              <div key={market.id} className="min-w-full">
                <Link
                  href={`/market/${encodeURIComponent(market.id)}`}
                  className="depth-card block relative rounded-[20px] p-5 active:scale-[0.995] transition-transform"
                >
                  {/* Header row: image + meta + title | actions */}
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={market.question}
                          className="h-10 w-10 rounded-lg object-cover border border-white/10 shrink-0 mt-0.5"
                          loading="eager"
                          decoding="async"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg border border-border bg-surface-3 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[12px] font-medium text-text-muted">
                            {(market.category || "Other")} · {market.venues[0]?.venue === "kalshi" ? "Kalshi" : "Polymarket"}
                          </span>
                          {market.venues.map((v) => (
                            <span key={v.venue} className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border ${v.venue === "polymarket" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-orange-500/10 text-orange-400 border-orange-500/20"}`}>
                              {v.venue === "polymarket" ? "Poly" : "Kalshi"}
                            </span>
                          ))}
                        </div>
                        <h3 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight tracking-tight text-text-primary line-clamp-2">
                          {market.question}
                        </h3>
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => copyLink(e, market.id)}
                        title={copiedId === market.id ? "Copied!" : "Copy link"}
                        className={`h-8 w-8 rounded-lg border transition-colors flex items-center justify-center ${copiedId === market.id ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-border bg-surface-2 hover:bg-surface-3"}`}
                      >
                        {copiedId === market.id ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={(e) => toggleBookmark(e, market.id)}
                        title={bookmarks.has(market.id) ? "Remove bookmark" : "Bookmark"}
                        className={`h-8 w-8 rounded-lg border transition-colors flex items-center justify-center ${bookmarks.has(market.id) ? "border-amber-500/50 bg-amber-500/10 text-amber-400" : "border-border bg-surface-2 hover:bg-surface-3"}`}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill={bookmarks.has(market.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Outcomes + Chart */}
                  <div className="grid grid-cols-1 sm:grid-cols-[0.3fr_0.7fr] gap-4 sm:gap-5 items-stretch">
                    {/* Left: outcomes once, clean */}
                    <div className="min-w-0 flex flex-row sm:flex-col gap-3">
                      <div className="flex-1 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex flex-col justify-center transition-colors hover:bg-emerald-500/10">
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500/80 mb-1">{yesLabel}</div>
                        <div key={`y-${formatPct(currentYes)}`} className="live-value text-3xl font-bold text-emerald-500 tabular-nums">{formatPct(currentYes)}</div>
                      </div>
                      <div className="flex-1 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex flex-col justify-center transition-colors hover:bg-rose-500/10">
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-rose-500/80 mb-1">{noLabel}</div>
                        <div key={`n-${formatPct(currentNo)}`} className="live-value text-3xl font-bold text-rose-500 tabular-nums">{formatPct(currentNo)}</div>
                      </div>
                      <div className="hidden sm:flex items-center gap-5 px-1 pt-1 opacity-80">
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-text-muted mb-0.5 tracking-wide">Vol 24H</div>
                          <div className="text-sm font-semibold text-text-primary">{formatNum(market.volume24h)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-semibold text-text-muted mb-0.5 tracking-wide">Liquidity</div>
                          <div className="text-sm font-semibold text-text-primary">{formatNum(market.liquidity)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Right: recharts live chart */}
                    <div className="depth-card rounded-xl p-4 flex flex-col">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {yesLabel} <span key={`ly-${formatPct(currentYes)}`} className="live-value font-semibold text-emerald-500">{formatPct(currentYes)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            {noLabel} <span key={`ln-${formatPct(currentNo)}`} className="live-value font-semibold text-rose-500">{formatPct(currentNo)}</span>
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          LIVE
                        </span>
                      </div>
                      <div className="flex-1 min-h-40 sm:min-h-55">
                        {history.length >= 2 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={history.map(p => ({ time: p.time, yes: p.yes * 100, no: (1 - p.yes) * 100 }))}
                              margin={{ top: 6, right: 10, bottom: 4, left: -6 }}
                            >
                              <XAxis
                                dataKey="time"
                                type="number"
                                domain={["dataMin", "dataMax"]}
                                tickFormatter={(ts: number) => {
                                  const d = new Date(ts);
                                  const spanH = history.length >= 2 ? (history[history.length - 1]!.time - history[0]!.time) / 3600000 : 0;
                                  return spanH > 6
                                    ? d.toLocaleDateString([], { month: "short", day: "numeric" })
                                    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                }}
                                tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
                                axisLine={{ stroke: "var(--color-border)" }}
                                tickLine={false}
                                minTickGap={60}
                                dy={10}
                              />
                              <YAxis
                                domain={[yMin, yMax]}
                                tickFormatter={(v: number) => `${v}%`}
                                tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                width={36}
                              />
                              <Tooltip
                                labelFormatter={(ts: number) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === "yes" ? yesLabel : noLabel]}
                                contentStyle={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 10, color: "var(--color-text-primary)", fontSize: 12 }}
                              />
                              <Line type="stepAfter" dataKey="yes" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "#10b981", stroke: "var(--color-surface)", strokeWidth: 2 }} />
                              <Line type="stepAfter" dataKey="no" stroke="#f43f5e" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={{ r: 4, fill: "#f43f5e", stroke: "var(--color-surface)", strokeWidth: 2 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-[13px] text-text-muted">
                            Collecting live data...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mt-6">
        {markets.map((m, i) => (
          <button
            key={m.id}
            onClick={() => onSelect(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === activeIndex ? "w-10 bg-text-primary" : "w-1.5 bg-text-muted/40 hover:bg-text-muted/70"}`}
            aria-label={`Show trending market ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
});

const VENUE_OPTIONS = ["all", "polymarket", "kalshi"] as const;

// pill width (w-22.5 = 90px), gap (gap-1 = 4px), container padding (p-1 = 4px)
const PILL_W = 90;
const PILL_GAP = 4;
const PILL_PAD = 4;

const VenueFilterPills = memo(function VenueFilterPills({
  active,
  onChange,
}: {
  active: VenueFilter;
  onChange: (v: VenueFilter) => void;
}) {
  const activeIdx = Math.max(0, VENUE_OPTIONS.indexOf(active as typeof VENUE_OPTIONS[number]));
  return (
    <div className="nav-depth-wrap relative flex gap-1 w-fit rounded-xl p-1">
      <div
        className="absolute top-1 bottom-1 rounded-[10px] nav-depth-pill-active pointer-events-none"
        style={{
          width: PILL_W,
          left: PILL_PAD,
          transform: `translateX(${activeIdx * (PILL_W + PILL_GAP)}px)`,
          transition: "transform 220ms cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
      {VENUE_OPTIONS.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`relative z-10 w-22.5 h-8 flex items-center justify-center text-[11px] font-bold uppercase tracking-wider transition-colors duration-150 ${
            active === v ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {v === "all" ? "All" : v}
        </button>
      ))}
    </div>
  );
});

function ExploreContent() {
  const searchParams = useSearchParams();
  const search = searchParams?.get("q") || "";

  // Venue filter is local state — no URL navigation, no scroll jump
  const [venue, setVenue] = useState<VenueFilter>("all");

  const [data, setData] = useState<MarketsResponse | null>(null);
  const [trendingData, setTrendingData] = useState<ExploreMarket[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("volume");
  const [offset, setOffset] = useState(0);
  const [trendingIndex, setTrendingIndex] = useState(0);
  const limit = 180;

  // --- Live chart WebSocket ---
  // Accumulate price history per market in a ref (no re-render per tick),
  // then sync to state every 500ms so the chart redraws at a steady 2fps.
  const liveHistoryRef = useRef<Record<string, { time: number; yes: number }[]>>({});
  const [liveHistory, setLiveHistory] = useState<Record<string, { time: number; yes: number }[]>>({});

  const trendingMarkets = useMemo(() => {
    if (!trendingData?.length) return [];
    return [...trendingData]
      .sort((a, b) => {
        if (b.volume24h !== a.volume24h) return b.volume24h - a.volume24h;
        return b.liquidity - a.liquidity;
      })
      .slice(0, 5);
  }, [trendingData]);

  const hasMoreMarkets = (data?.markets.length ?? 0) < (data?.total ?? 0);

  const handleVenue = (nextVenue: VenueFilter) => {
    setVenue(nextVenue);
    setOffset(0);
  };

  const fetchMarkets = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        sort,
      });
      if (search) params.set("q", search);
      if (venue !== "all") params.set("venue", venue);

      const res = await fetch(`${API_URL}/api/markets?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MarketsResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch markets");
    } finally {
      setLoading(false);
    }
  }, [search, sort, venue, offset]);

  // Fetch unfiltered trending data once on mount
  useEffect(() => {
    if (trendingData) return;
    fetch(`${API_URL}/api/markets?limit=50&offset=0&sort=volume`)
      .then((res) => res.ok ? res.json() as Promise<MarketsResponse> : null)
      .then((json) => { if (json) setTrendingData(json.markets); })
      .catch(() => { });
  }, [trendingData]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchMarkets, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchMarkets, search]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [search, sort, venue]);

  useEffect(() => {
    setTrendingIndex(0);
  }, [trendingMarkets.length]); // only reset when trending list itself changes, not on venue/sort/offset

  useEffect(() => {
    if (trendingMarkets.length < 2) return;
    const timer = setInterval(() => {
      setTrendingIndex((prev) => (prev + 1) % trendingMarkets.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [trendingMarkets.length]);

  // Fetch venue price history (Polymarket CLOB / Kalshi) for all trending markets
  const historyFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (trendingMarkets.length === 0) return;
    let cancelled = false;

    const fetchHistory = async () => {
      const toFetch = trendingMarkets.filter(
        (m) => !historyFetchedRef.current.has(m.id)
      );
      if (toFetch.length === 0) return;

      const results = await Promise.allSettled(
        toFetch.map(async (m) => {
          // Fetch real venue history (weeks/months of data from Polymarket/Kalshi APIs)
          const res = await fetch(
            `${API_URL}/api/markets/${encodeURIComponent(m.id)}/venue-history?interval=all`
          );
          if (!res.ok) return { id: m.id, points: [] as { t: number; y: number }[] };
          const json = (await res.json()) as Record<string, Array<{ t: number; y: number }>>;
          // Use Polymarket data if available, otherwise Kalshi
          const points = json.polymarket?.length ? json.polymarket : json.kalshi ?? [];
          return { id: m.id, points };
        })
      );

      if (cancelled) return;

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { id, points } = result.value;
        if (points.length === 0) continue;
        historyFetchedRef.current.add(id);
        const existing = liveHistoryRef.current[id] ?? [];
        const historical = points.map((p) => ({ time: p.t, yes: p.y }));
        liveHistoryRef.current[id] = [...historical, ...existing].slice(-2000);
      }

      setLiveHistory({ ...liveHistoryRef.current });
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [trendingMarkets]);

  // Which trending market is currently visible → connect WS to it
  const activeMarketId = trendingMarkets.length > 0
    ? trendingMarkets[Math.min(trendingIndex, trendingMarkets.length - 1)]?.id ?? null
    : null;
  const activeMarketIdRef = useRef<string | null>(null);
  activeMarketIdRef.current = activeMarketId;

  // WS message handler: extract bestBid → push into the ref (no re-render)
  const handleTrendingWs = useCallback((msg: ServerMessage) => {
    if (msg.type !== "book_snapshot" && msg.type !== "book_update") return;
    const bid = msg.data.aggregated.bestBid;
    if (bid === null) return;
    const id = activeMarketIdRef.current;
    if (!id) return;
    const existing = liveHistoryRef.current[id] ?? [];
    liveHistoryRef.current[id] = [...existing.slice(-1999), { time: Date.now(), yes: bid }];
  }, []);

  // Connect to the currently visible trending market
  useWebSocket(activeMarketId, handleTrendingWs);

  // Sync ref → state every 800ms, only for the active market and only if data changed
  useEffect(() => {
    if (!activeMarketId) return;
    const id = activeMarketId;
    let lastLen = liveHistoryRef.current[id]?.length ?? 0;
    const timer = setInterval(() => {
      const next = liveHistoryRef.current[id];
      if (!next) return;
      const newLen = next.length;
      if (newLen !== lastLen) {
        lastLen = newLen;
        setLiveHistory(prev => ({ ...prev, [id]: next }));
      }
    }, 800);
    return () => clearInterval(timer);
  }, [activeMarketId]);

  return (
    <main className="page-shell min-h-screen">
      {/* Trending carousel — always uses unfiltered data, independent of venue filter */}
      {trendingMarkets.length > 0 && (
        <div id="trending" className="scroll-mt-40">
          <TrendingCarousel
            markets={trendingMarkets}
            activeIndex={Math.min(trendingIndex, trendingMarkets.length - 1)}
            onSelect={setTrendingIndex}
            liveHistory={liveHistory}
          />
        </div>
      )}

      {/* Header */}
      <div className="page-header-block mb-6">
        <h1 className="page-title">All markets</h1>
        <p className="page-subtitle">
          Aggregated order books across Polymarket and Kalshi
          {data && (
            <span className="text-text-muted">
              {" "}&middot; {data.polymarketCount.toLocaleString()} Polymarket &middot; {data.kalshiCount.toLocaleString()} Kalshi &middot; {data.matchedCount} Matched
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="controls-row">
        <VenueFilterPills active={venue} onChange={handleVenue} />
        <SortDropdown<SortOption>
          value={sort}
          onChange={setSort}
          options={SORT_OPTIONS}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-ask-muted border border-ask/30 rounded-xl text-sm text-ask">
          Failed to load markets: {error}. Make sure the server is running on port 3001.
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Market grid — flat, no category sections */}
      {data && (
        <>
          {data.markets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.markets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-text-muted">
              No markets found
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            <span className="text-[13px] text-text-muted">
              Showing {offset + 1}-{Math.min(offset + limit, data.total)} of {data.total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="h-9 px-3.5 text-[13px] font-medium bg-surface-2 border border-border rounded-xl disabled:opacity-30 hover:bg-surface-hover transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={!hasMoreMarkets}
                className="h-9 px-3.5 text-[13px] font-medium bg-surface-2 border border-border rounded-xl disabled:opacity-30 hover:bg-surface-hover transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={
      <div className="page-shell min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex gap-2">
          <div className="w-2 h-2 bg-text-muted rounded-full"></div>
          <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce"></div>
          <div className="w-2 h-2 bg-text-muted rounded-full"></div>
        </div>
      </div>
    }>
      <ExploreContent />
    </Suspense>
  );
}
