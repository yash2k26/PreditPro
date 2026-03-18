"use client";

import { useCallback, useState } from "react";
import type {
  AggregatedBook,
  VenueId,
  VenueOrderBook,
  VenueHealthInfo,
  MarketInfo,
  ServerMessage,
  QuoteResult,
} from "@repo/shared-types";

export interface PricePoint {
  time: number;
  yes: number; // best bid (YES price)
  no: number;  // 1 - bestBid (NO price)
}

const MAX_HISTORY = 300;

export interface OrderBookState {
  market: MarketInfo | null;
  aggregated: AggregatedBook | null;
  venues: Partial<Record<VenueId, VenueOrderBook>>;
  health: Record<string, VenueHealthInfo>;
  lastQuote: QuoteResult | null;
  priceHistory: PricePoint[];
}

const INITIAL_STATE: OrderBookState = {
  market: null,
  aggregated: null,
  venues: {},
  health: {},
  lastQuote: null,
  priceHistory: [],
};

function extractPricePoint(book: AggregatedBook): PricePoint | null {
  if (book.bestBid === null) return null;
  return {
    time: Date.now(),
    yes: book.bestBid,
    no: 1 - book.bestBid,
  };
}

export function useOrderBook() {
  const [state, setState] = useState<OrderBookState>(INITIAL_STATE);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "book_snapshot": {
        const pt = extractPricePoint(msg.data.aggregated);
        setState(prev => ({
          ...prev,
          market: msg.data.market,
          aggregated: msg.data.aggregated,
          venues: msg.data.venues,
          health: {},
          lastQuote: null,
          priceHistory: pt ? [pt] : [],
        }));
        break;
      }

      case "book_update": {
        const pt = extractPricePoint(msg.data.aggregated);
        setState(prev => {
          const updated = pt
            ? [...prev.priceHistory.slice(-(MAX_HISTORY - 1)), pt]
            : prev.priceHistory;
          return {
            ...prev,
            aggregated: msg.data.aggregated,
            venues: msg.data.venues,
            priceHistory: updated,
          };
        });
        break;
      }

      case "health":
        setState(prev => ({ ...prev, health: { ...prev.health, ...msg.data.venues } }));
        break;

      case "quote_result":
        setState(prev => ({ ...prev, lastQuote: msg.data }));
        break;

      case "error":
        console.error("[ws] Server error:", msg.data.message);
        break;
    }
  }, []);

  return { state, handleMessage };
}
