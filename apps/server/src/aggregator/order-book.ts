import type {
  VenueId,
  VenueOrderBook,
  AggregatedBook,
  AggregatedLevel,
  PriceLevel,
} from "@repo/shared-types";
import { roundToTick, roundDecimals } from "./tick-utils.ts";

const TICK_SIZE = 0.01;
const DECIMALS = 2;

/**
 * Merge price levels from multiple venues into aggregated levels.
 * Buckets by tick-rounded price, sums sizes, tracks per-venue attribution.
 */
function mergeLevels(
  venueBooks: Map<VenueId, PriceLevel[]>
): Map<number, AggregatedLevel> {
  const levels = new Map<number, AggregatedLevel>();

  for (const [venue, priceLevels] of venueBooks) {
    for (const { price, size } of priceLevels) {
      const rounded = roundDecimals(roundToTick(price, TICK_SIZE), DECIMALS);

      let level = levels.get(rounded);
      if (!level) {
        level = { price: rounded, totalSize: 0, venues: {} };
        levels.set(rounded, level);
      }

      level.totalSize += size;
      level.venues[venue] = (level.venues[venue] ?? 0) + size;
    }
  }

  return levels;
}

/**
 * Pure function: merge venue order books into a single aggregated book.
 */
export function aggregateBooks(
  books: Map<VenueId, VenueOrderBook>
): AggregatedBook {
  const bidsByVenue = new Map<VenueId, PriceLevel[]>();
  const asksByVenue = new Map<VenueId, PriceLevel[]>();

  for (const [venue, book] of books) {
    bidsByVenue.set(venue, book.bids);
    asksByVenue.set(venue, book.asks);
  }

  const mergedBids = mergeLevels(bidsByVenue);
  const mergedAsks = mergeLevels(asksByVenue);

  // Sort bids descending, asks ascending
  const bids = Array.from(mergedBids.values()).sort(
    (a, b) => b.price - a.price
  );
  const asks = Array.from(mergedAsks.values()).sort(
    (a, b) => a.price - b.price
  );

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;

  let mid: number | null = null;
  let spread: number | null = null;

  if (bestBid !== null && bestAsk !== null) {
    mid = roundDecimals((bestBid + bestAsk) / 2, 4);
    spread = roundDecimals(bestAsk - bestBid, 4);
  }

  return {
    bids,
    asks,
    bestBid,
    bestAsk,
    mid,
    spread,
    timestamp: Date.now(),
  };
}

/**
 * Stateful aggregator that holds per-venue books and re-merges on updates.
 * Throttles downstream emissions.
 */
export class Aggregator {
  private books = new Map<VenueId, VenueOrderBook>();
  private lastEmit = 0;
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  private listener: ((book: AggregatedBook, venues: Map<VenueId, VenueOrderBook>) => void) | null = null;
  private readonly throttleMs: number;

  constructor(throttleMs: number = 100) {
    this.throttleMs = throttleMs;
  }

  onUpdate(
    fn: (book: AggregatedBook, venues: Map<VenueId, VenueOrderBook>) => void
  ): void {
    this.listener = fn;
  }

  handleVenueUpdate(book: VenueOrderBook): void {
    this.books.set(book.venue, book);
    this.scheduleEmit();
  }

  getAggregated(): AggregatedBook {
    return aggregateBooks(this.books);
  }

  getVenueBooks(): Map<VenueId, VenueOrderBook> {
    return new Map(this.books);
  }

  private scheduleEmit(): void {
    const now = Date.now();
    const elapsed = now - this.lastEmit;

    if (elapsed >= this.throttleMs) {
      this.doEmit();
    } else if (!this.pendingTimeout) {
      this.pendingTimeout = setTimeout(() => {
        this.pendingTimeout = null;
        this.doEmit();
      }, this.throttleMs - elapsed);
    }
  }

  private doEmit(): void {
    this.lastEmit = Date.now();
    if (this.listener) {
      this.listener(this.getAggregated(), this.getVenueBooks());
    }
  }

  destroy(): void {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    this.books.clear();
    this.listener = null;
  }
}
