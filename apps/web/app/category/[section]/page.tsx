"use client";
/* eslint-disable @next/next/no-img-element */

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ExploreMarket, MarketsResponse } from "@repo/shared-types";
import {
  CATEGORY_SECTIONS,
  detectSection,
  SECTION_LABEL,
  type SectionKey,
} from "../../../lib/market-sections";
import { SortDropdown } from "../../../components/layout/SortDropdown";

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
  const isYes = label.toLowerCase().includes("yes") || emphasis === "yes";
  const isNo = label.toLowerCase().includes("no") || emphasis === "no";

  const colorClass = isYes
    ? "text-emerald-400"
    : isNo
      ? "text-rose-400"
      : "text-text-primary";

  const bgClass = isYes
    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
    : isNo
      ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
      : "bg-surface-3 border-border text-text-secondary";

  return (
    <div className="flex items-center justify-between py-2 group/row transition-colors duration-200">
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-1.5 rounded-full ${isYes ? "bg-emerald-500" : isNo ? "bg-rose-500" : "bg-text-muted"}`} />
        <span className="text-base text-text-secondary font-medium truncate max-w-[140px]">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className={`text-xl leading-none font-bold tabular-nums ${colorClass}`}>{pctText}</span>
        <div className="flex gap-1.5">
          <button className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg border transition-all duration-200 active:scale-95 ${bgClass} hover:brightness-125`}>
            Bet
          </button>
        </div>
      </div>
    </div>
  );
}

function MarketCard({ market }: { market: ExploreMarket }) {
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
      className="market-depth depth-card-hover group relative block overflow-hidden rounded-[24px] p-5"
    >
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <MarketAvatar market={market} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-surface-3 text-text-muted rounded-md border border-border">
                  {market.category || "General"}
                </span>
                <div className="flex gap-1">
                  {market.venues.map((v) => (
                    <VenueBadge key={v.venue} venue={v.venue} />
                  ))}
                </div>
              </div>
              <h3 className="line-clamp-2 text-lg leading-[1.3] font-bold text-text-primary transition-colors">
                {market.question}
              </h3>
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-1 divide-y divide-border">
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

        <div className="mt-5 flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Volume</span>
              <span className="text-xs text-text-secondary font-semibold">{formatNum(market.volume24h)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Liquidity</span>
              <span className="text-xs text-text-secondary font-semibold">{formatNum(market.liquidity)}</span>
            </div>
          </div>
          <div className="h-8 w-8 rounded-full bg-surface-3 flex items-center justify-center border border-border group-hover:bg-accent/10 group-hover:border-accent/30 transition-all">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-text-muted group-hover:text-accent transform transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function CategoryPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = use(params);
  const normalized = decodeURIComponent(section).toLowerCase();
  const category = (CATEGORY_SECTIONS.includes(normalized as SectionKey)
    ? (normalized as SectionKey)
    : "other") as SectionKey;

  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams?.get("q") || "";
  const venue = (searchParams?.get("venue") as VenueFilter) || "all";
  const [sort, setSort] = useState<SortOption>("volume");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MarketsResponse | null>(null);
  const limit = 120;

  const hasMoreMarkets = (data?.markets.length ?? 0) < (data?.total ?? 0);

  const marketsInCategory = useMemo(() => {
    if (!data?.markets) return [];
    return data.markets.filter((market) => detectSection(market) === category);
  }, [data?.markets, category]);

  const handleVenue = (nextVenue: VenueFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextVenue === "all") params.delete("venue");
    else params.set("venue", nextVenue);
    params.set("offset", "0");
    router.push(`?${params.toString()}`);
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
  }, [offset, search, sort, venue]);

  useEffect(() => {
    setLoading(true);
    fetchMarkets();
  }, [fetchMarkets]);

  useEffect(() => {
    setOffset(0);
  }, [search, sort, venue, category]);

  return (
    <main className="page-shell min-h-screen">
      <div className="mb-6">
        <div className="page-header-block">
          <Link href="/" className="text-[13px] text-text-muted hover:text-text-primary transition-colors">
            ← Back to all markets
          </Link>
          <h1 className="page-title">{SECTION_LABEL[category]}</h1>
        </div>

        <div className="controls-row mt-5 mb-0">
          <div className="nav-depth-wrap flex gap-1 w-fit rounded-xl p-1">
            {(["all", "polymarket", "kalshi"] as const).map((v) => (
              <button
                key={v}
                onClick={() => handleVenue(v)}
                className={`nav-depth-pill w-20 text-[11px] font-bold uppercase tracking-wider ${
                  venue === v ? "nav-depth-pill-active" : ""
                }`}
              >
                {v === "all" ? "All" : v === "polymarket" ? "Poly" : "Kalshi"}
              </button>
            ))}
          </div>
          <SortDropdown<SortOption>
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-ask-muted border border-ask/30 rounded-xl text-sm text-ask">
          Failed to load markets: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {marketsInCategory.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>

      {!loading && marketsInCategory.length === 0 && (
        <div className="depth-card mt-8 rounded-xl p-4 text-sm text-text-muted">
          No markets available in {SECTION_LABEL[category]} yet.
        </div>
      )}

      <div className="mt-10 flex items-center justify-between gap-4">
        <span className="text-sm text-text-muted">
          Showing {offset + 1}-{Math.min(offset + limit, data?.total ?? 0)} of {(data?.total ?? 0).toLocaleString()}
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
    </main>
  );
}
