import type { ExploreMarket, MarketsResponse } from "@repo/shared-types";
import type { VenueWorkerHandle } from "../workers/venue-worker-handle.ts";
import { mergeMatchingMarkets } from "./matcher.ts";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class MarketCache {
  private markets: ExploreMarket[] = [];
  private byId = new Map<string, ExploreMarket>();
  private sorted = new Map<string, ExploreMarket[]>();
  private polymarketCount = 0;
  private kalshiCount = 0;
  private matchedCount = 0;
  private lastUpdated = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshPromise: Promise<void> | null = null;

  private polyHandle: VenueWorkerHandle;
  private kalshiHandle: VenueWorkerHandle;

  constructor(polyHandle: VenueWorkerHandle, kalshiHandle: VenueWorkerHandle) {
    this.polyHandle = polyHandle;
    this.kalshiHandle = kalshiHandle;
  }

  getById(id: string): ExploreMarket | undefined {
    return this.byId.get(id);
  }

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((err) =>
        console.error("[market-cache] Refresh failed:", err)
      );
    }, REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getResponse(opts?: {
    q?: string;
    venue?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  }): MarketsResponse {
    const sort = opts?.sort ?? "volume";
    const source = this.sorted.get(sort) ?? this.markets;

    let filtered: ExploreMarket[] = source;

    // Search filter
    if (opts?.q) {
      const query = opts.q.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.question.toLowerCase().includes(query) ||
          m.category.toLowerCase().includes(query)
      );
    }

    // Venue filter
    const venue = opts?.venue;
    if (venue && venue !== "all") {
      if (venue === "matched") {
        filtered = filtered.filter((m) => m.venues.length > 1);
      } else if (venue === "polymarket") {
        filtered = filtered.filter(
          (m) => m.venues.length === 1 && m.venues[0]?.venue === "polymarket"
        );
      } else if (venue === "kalshi") {
        filtered = filtered.filter(
          (m) => m.venues.length === 1 && m.venues[0]?.venue === "kalshi"
        );
      }
    }

    const total = filtered.length;

    // Copy if we need to reorder for matched-float
    if (!venue || venue === "all") {
      filtered = [...filtered];
    }

    // For "all" view, float matched markets to the top within each sort
    if (!venue || venue === "all") {
      filtered.sort((a, b) => {
        const aMatched = a.venues.length > 1 ? 1 : 0;
        const bMatched = b.venues.length > 1 ? 1 : 0;
        return bMatched - aMatched;
      });
    }

    // Pagination
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 50;
    const page = filtered.slice(offset, offset + limit);

    return {
      markets: page,
      total,
      polymarketCount: this.polymarketCount,
      kalshiCount: this.kalshiCount,
      matchedCount: this.matchedCount,
      lastUpdated: this.lastUpdated,
    };
  }

  private async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    console.log("[market-cache] Refreshing markets...");

    const [polymarkets, kalshiMarkets] = await Promise.all([
      this.polyHandle.discover().catch((err) => {
        console.error(
          "[market-cache] Polymarket discover failed:",
          (err as Error).message
        );
        return [] as ExploreMarket[];
      }),
      this.kalshiHandle.discover().catch((err) => {
        console.error(
          "[market-cache] Kalshi discover failed:",
          (err as Error).message
        );
        return [] as ExploreMarket[];
      }),
    ]);

    const { merged, matchCount } = mergeMatchingMarkets(
      polymarkets,
      kalshiMarkets
    );

    this.polymarketCount = polymarkets.length;
    this.kalshiCount = kalshiMarkets.length;
    this.matchedCount = matchCount;

    this.markets = merged.sort((a, b) => b.volume24h - a.volume24h);

    // Build ID lookup — register alias IDs for merged markets
    this.byId = new Map();
    for (const market of this.markets) {
      this.byId.set(market.id, market);

      if (market.venues.length > 1) {
        const kalshiVenue = market.venues.find((v) => v.venue === "kalshi");
        if (kalshiVenue?.ticker) {
          this.byId.set(`kalshi-${kalshiVenue.ticker}`, market);
        }
      }
    }

    // Pre-build sorted arrays for each sort key
    this.sorted = new Map();
    this.sorted.set("volume", [...this.markets]); // already sorted by volume
    this.sorted.set(
      "liquidity",
      [...this.markets].sort((a, b) => b.liquidity - a.liquidity)
    );
    this.sorted.set(
      "price",
      [...this.markets].sort(
        (a, b) => (b.yesPrice ?? 0) - (a.yesPrice ?? 0)
      )
    );
    this.sorted.set("newest", [...this.markets].reverse());

    this.lastUpdated = Date.now();
    console.log(
      `[market-cache] Cached ${this.markets.length} markets ` +
        `(${this.polymarketCount} Polymarket, ${this.kalshiCount} Kalshi, ` +
        `${this.matchedCount} matched pairs)`
    );
  }
}
