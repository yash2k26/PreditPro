import type { VenueOrderBook, PriceLevel } from "@repo/shared-types";
import { BaseVenue } from "../base-venue.ts";

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";
const POLL_INTERVAL_MS = 5_000;

interface KalshiMarketResponse {
  market: {
    yes_bid_dollars: string;
    yes_ask_dollars: string;
    liquidity_dollars: string;
    yes_bid_size_fp: string;
    yes_ask_size_fp: string;
  };
}

/**
 * Live Kalshi venue — polls the public REST API for real bid/ask prices.
 * Only provides top-of-book (1 bid + 1 ask level) because the public API
 * does not expose order book depth without paid authentication.
 */
export class KalshiPollingVenue extends BaseVenue {
  readonly venueId = "kalshi" as const;
  private ticker: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;

  // Last known state
  private lastBid: PriceLevel | null = null;
  private lastAsk: PriceLevel | null = null;
  private polling = false;
  private hasOrderBook = false;
  private orderBookFailed = false;

  constructor(ticker: string) {
    super();
    this.ticker = ticker;
  }

  async connect(): Promise<void> {
    this.intentionalClose = false;
    this.setState("connecting");

    // Initial fetch
    await this.poll();

    // Start polling interval
    this.timer = setInterval(() => {
      this.poll().catch((err) => {
        console.warn(
          `[kalshi-poll:${this.ticker}] Poll failed:`,
          (err as Error)?.message ?? err
        );
      });
    }, POLL_INTERVAL_MS);
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastBid = null;
    this.lastAsk = null;
    this.setState("disconnected");
  }

  getSnapshot(): VenueOrderBook | null {
    if (!this.lastBid && !this.lastAsk) return null;
    return this.buildBook();
  }

  private async fetchOrderBook(): Promise<{ bids: PriceLevel[]; asks: PriceLevel[] } | null> {
    try {
      const res = await fetch(
        `${KALSHI_API}/markets/${this.ticker}/orderbook`,
        { signal: AbortSignal.timeout(5_000) }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        orderbook_fp: {
          yes_dollars: Array<[string, string]>;
          no_dollars: Array<[string, string]>;
        };
      };
      const bids: PriceLevel[] = [];
      const asks: PriceLevel[] = [];
      for (const [p, q] of data.orderbook_fp.yes_dollars ?? []) {
        const price = parseFloat(p);
        const size = parseFloat(q);
        if (price > 0 && size > 0) bids.push({ price, size: Math.round(size) });
      }
      for (const [p, q] of data.orderbook_fp.no_dollars ?? []) {
        const noPrice = parseFloat(p);
        const price = Math.round((1 - noPrice) * 100) / 100;
        const size = parseFloat(q);
        if (price > 0 && price < 1 && size > 0) asks.push({ price, size: Math.round(size) });
      }
      bids.sort((a, b) => b.price - a.price);
      asks.sort((a, b) => a.price - b.price);
      return bids.length || asks.length ? { bids, asks } : null;
    } catch {
      return null;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      // Try real orderbook endpoint first (if it hasn't already failed)
      if (!this.orderBookFailed) {
        const ob = await this.fetchOrderBook();
        if (ob) {
          this.hasOrderBook = true;
          this.setState("connected");
          this.emitBookUpdate({
            venue: "kalshi",
            bids: ob.bids,
            asks: ob.asks,
            timestamp: Date.now(),
          });
          return;
        }
        // Orderbook endpoint didn't work — stop trying
        this.orderBookFailed = true;
        this.hasOrderBook = false;
        console.log(
          `[kalshi-poll:${this.ticker}] Orderbook endpoint unavailable, falling back to market endpoint`
        );
      }

      // Fallback: single-market endpoint with synthetic depth
      const res = await fetch(
        `${KALSHI_API}/markets/${this.ticker}`,
        { signal: AbortSignal.timeout(10_000) }
      );

      if (!res.ok) {
        if (this.health.state === "connected") {
          this.setState("error");
        }
        return;
      }

      const data = (await res.json()) as KalshiMarketResponse;
      const m = data.market;

      const bidPrice = parseFloat(m.yes_bid_dollars);
      const askPrice = parseFloat(m.yes_ask_dollars);
      const bidSize = parseFloat(m.yes_bid_size_fp || "0");
      const askSize = parseFloat(m.yes_ask_size_fp || "0");

      const bidSideSize = Math.max(1, Math.round(bidSize));
      const askSideSize = Math.max(1, Math.round(askSize));

      if (!isNaN(bidPrice) && bidPrice > 0) {
        this.lastBid = { price: bidPrice, size: bidSideSize };
      }
      if (!isNaN(askPrice) && askPrice > 0) {
        this.lastAsk = { price: askPrice, size: askSideSize };
      }

      this.setState("connected");
      this.emitBookUpdate(this.buildBook());
    } catch (err) {
      if (this.intentionalClose) return;
      console.warn(
        `[kalshi-poll:${this.ticker}] Fetch error:`,
        (err as Error)?.message ?? err
      );
      if (this.health.state !== "connected") {
        this.setState("error");
      }
    } finally {
      this.polling = false;
    }
  }

  private buildBook(): VenueOrderBook {
    const DEPTH = 8;
    const TICK = 0.01;
    const DECAY = 0.65;

    const bids: PriceLevel[] = [];
    if (this.lastBid) {
      let size = this.lastBid.size;
      for (let i = 0; i < DEPTH; i++) {
        const price = Math.round((this.lastBid.price - i * TICK) * 100) / 100;
        if (price <= 0) break;
        const jitter = 0.8 + Math.random() * 0.4;
        bids.push({ price, size: Math.max(1, Math.round(size * jitter)) });
        size *= DECAY;
      }
    }

    const asks: PriceLevel[] = [];
    if (this.lastAsk) {
      let size = this.lastAsk.size;
      for (let i = 0; i < DEPTH; i++) {
        const price = Math.round((this.lastAsk.price + i * TICK) * 100) / 100;
        if (price >= 1) break;
        const jitter = 0.8 + Math.random() * 0.4;
        asks.push({ price, size: Math.max(1, Math.round(size * jitter)) });
        size *= DECAY;
      }
    }

    return { venue: "kalshi", bids, asks, timestamp: Date.now() };
  }
}
