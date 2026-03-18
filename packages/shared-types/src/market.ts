export interface MarketInfo {
  id: string;
  question: string;
  outcomes: [string, string];
}

/** A market card for the explore page */
export interface ExploreMarket {
  id: string;
  slug: string;
  question: string;
  category: string;
  /** Optional card image from venue metadata */
  imageUrl?: string | null;
  outcomes: [string, string];
  /** YES price as probability 0-1 */
  yesPrice: number | null;
  noPrice: number | null;
  volume24h: number;
  liquidity: number;
  /** Which venues this market is available on */
  venues: ExploreMarketVenue[];
}

export interface ExploreMarketVenue {
  venue: "polymarket" | "kalshi";
  /** Venue-specific identifier */
  slug?: string; // polymarket
  tokenIds?: [string, string]; // polymarket YES/NO token IDs
  ticker?: string; // kalshi
  imageUrl?: string | null;
  yesPrice: number | null;
  noPrice: number | null;
  volume24h: number;
  liquidity: number;
}

export interface MarketsResponse {
  markets: ExploreMarket[];
  total: number;
  polymarketCount: number;
  kalshiCount: number;
  matchedCount: number;
  lastUpdated: number;
}
