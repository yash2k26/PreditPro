export type VenueId = "polymarket" | "kalshi";

export interface PriceLevel {
  price: number;
  size: number;
}

export interface VenueOrderBook {
  venue: VenueId;
  bids: PriceLevel[]; // sorted descending by price
  asks: PriceLevel[]; // sorted ascending by price
  timestamp: number;
}

export interface AggregatedLevel {
  price: number;
  totalSize: number;
  venues: Partial<Record<VenueId, number>>; // size per venue
}

export interface AggregatedBook {
  bids: AggregatedLevel[]; // sorted descending by price
  asks: AggregatedLevel[]; // sorted ascending by price
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  spread: number | null;
  timestamp: number;
}
