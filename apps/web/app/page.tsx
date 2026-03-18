"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { ExploreMarket, MarketsResponse } from "@repo/shared-types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

type SortOption = "volume" | "liquidity" | "price" | "newest";
type VenueFilter = "all" | "matched" | "polymarket" | "kalshi";

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
      <img
        src={imageUrl}
        alt={market.question}
        className="h-12 w-12 rounded-xl object-cover border border-white/15 shadow-sm"
      />
    );
  }

  return (
    <div className="h-12 w-12 rounded-xl border border-slate-500/30 bg-gradient-to-br from-slate-700/80 to-slate-900/80 flex items-center justify-center text-sm font-semibold text-slate-100 shadow-sm">
      {fallbackLetter}
    </div>
  );
}

function VenueBadge({ venue }: { venue: "polymarket" | "kalshi" }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${
        venue === "polymarket"
          ? "bg-slate-600/30 text-slate-200 border border-slate-500/30"
          : "bg-zinc-700/35 text-zinc-200 border border-zinc-500/30"
      }`}
    >
      {venue === "polymarket" ? "Poly" : "Kalshi"}
    </span>
  );
}

function OutcomeRow({
  label,
  pctText,
  emphasis,
}: {
  label: string;
  pctText: string;
  emphasis: "yes" | "no" | "neutral";
}) {
  const pctClass =
    emphasis === "yes"
      ? "text-emerald-300"
      : emphasis === "no"
        ? "text-rose-300"
        : "text-slate-100";

  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
      <span className="text-[17px] text-slate-100/90 truncate">{label}</span>
      <span className={`text-2xl leading-none font-semibold tabular-nums ${pctClass}`}>{pctText}</span>
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 text-xs rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
          Yes
        </span>
        <span className="px-3 py-1 text-xs rounded-lg bg-rose-500/15 text-rose-300 border border-rose-400/20">
          No
        </span>
      </div>
    </div>
  );
}

function MarketCard({ market }: { market: ExploreMarket }) {
  const yesValue = market.yesPrice;
  const noValue = yesValue === null ? null : 1 - yesValue;
  const yesLabel = market.outcomes[0] ?? "Yes";
  const noLabel = market.outcomes[1] ?? "No";
  const yesPct = formatPct(yesValue);
  const noPct = formatPct(noValue);

  return (
    <Link
      href={`/market/${encodeURIComponent(market.id)}`}
      className="group relative block overflow-hidden rounded-[22px] border border-slate-700/60 bg-[radial-gradient(130%_140%_at_0%_0%,rgba(100,116,139,0.12),rgba(9,12,18,0.98)_45%,rgba(3,6,12,1)_100%)] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset,0_12px_28px_rgba(0,0,0,0.55)] transition-all duration-300 hover:-translate-y-1 hover:border-slate-300/25 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_18px_34px_rgba(0,0,0,0.75)]"
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_100%_0%,rgba(148,163,184,0.14),transparent_40%)]" />

      <div className="relative z-10">
        <div className="mb-5 flex items-start gap-3">
          <MarketAvatar market={market} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-lg md:text-xl leading-tight font-semibold text-slate-100">
              {market.question}
            </h3>
          </div>
          <div className="ml-2 flex gap-1 shrink-0">
            {market.venues.map((v) => (
              <VenueBadge key={v.venue} venue={v.venue} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <OutcomeRow
            label={yesLabel}
            pctText={yesPct}
            emphasis={yesValue !== null && yesValue >= 0.6 ? "yes" : "neutral"}
          />
          <OutcomeRow
            label={noLabel}
            pctText={noPct}
            emphasis={noValue !== null && noValue >= 0.6 ? "no" : "neutral"}
          />
        </div>

        <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
          <span className="uppercase tracking-[0.16em] text-[10px] text-slate-300/70">{market.category || "Other"}</span>
          <div className="flex items-center gap-3">
            <span className="text-slate-300/80">{formatNum(market.volume24h)} Vol.</span>
            <span className="text-slate-500/70">•</span>
            <span className="text-slate-300/80">{formatNum(market.liquidity)} Liq.</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function MarketCardSkeleton() {
  return (
    <div className="rounded-[22px] border border-slate-700/45 bg-slate-950/80 p-5 animate-pulse">
      <div className="mb-5 flex gap-3">
        <div className="h-12 w-12 rounded-xl bg-slate-800/80" />
        <div className="flex-1 space-y-2">
          <div className="h-4 rounded bg-slate-800/75 w-full" />
          <div className="h-4 rounded bg-slate-800/60 w-3/4" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-11 rounded bg-slate-800/55" />
        <div className="h-11 rounded bg-slate-800/45" />
      </div>
      <div className="mt-4 h-3 rounded bg-slate-800/45 w-2/3" />
    </div>
  );
}

export default function ExplorePage() {
  const [data, setData] = useState<MarketsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("volume");
  const [venue, setVenue] = useState<VenueFilter>("all");
  const [offset, setOffset] = useState(0);
  const limit = 30;

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

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchMarkets, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchMarkets, search]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [search, sort, venue]);

  return (
    <main className="min-h-screen p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-1">Markets</h1>
        <p className="text-sm text-text-secondary">
          Aggregated order books across Polymarket and Kalshi
          {data && (
            <span className="text-text-muted">
              {" "}&middot; {data.polymarketCount.toLocaleString()} Polymarket &middot; {data.kalshiCount.toLocaleString()} Kalshi &middot; {data.matchedCount} Matched
            </span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search markets..."
          className="flex-1 min-w-[200px] px-4 py-2.5 bg-surface-2 border border-border rounded-xl text-sm shadow-sm placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
        />

        <div className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1">
          {(["all", "matched", "polymarket", "kalshi"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                venue === v
                  ? "bg-surface-3 text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {v === "all" ? "All" : v === "matched" ? "Matched" : v === "polymarket" ? "Polymarket" : "Kalshi"}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-xs text-text-secondary focus:outline-none focus:border-accent"
        >
          <option value="volume">Volume (24h)</option>
          <option value="liquidity">Liquidity</option>
          <option value="price">Price (high)</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-ask-muted border border-ask/30 rounded-xl text-sm text-ask">
          Failed to load markets: {error}. Make sure the server is running on port 3001.
        </div>
      )}

      {/* Loading skeletons */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Market grid */}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>

          {data.markets.length === 0 && (
            <div className="text-center py-20 text-text-muted">
              No markets found
            </div>
          )}

          {/* Pagination */}
          {data.total > limit && (
            <div className="flex items-center justify-between mt-8">
              <span className="text-xs text-text-muted">
                Showing {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-4 py-2 text-xs font-medium bg-surface-2 border border-border rounded-xl disabled:opacity-30 hover:bg-surface-hover transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= data.total}
                  className="px-4 py-2 text-xs font-medium bg-surface-2 border border-border rounded-xl disabled:opacity-30 hover:bg-surface-hover transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

