"use client";

import { useCallback, useRef, useState } from "react";
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
  yes: number;
  no: number;
}

const MAX_HISTORY = 600;
// Min ms between price history points — avoids creating huge arrays at high tick rates
const MIN_PT_INTERVAL_MS = 1000;
// Max fps for book re-renders — keeps UI smooth without over-rendering
const FLUSH_MS = 150;

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
  return { time: Date.now(), yes: book.bestBid, no: 1 - book.bestBid };
}

export function useOrderBook() {
  // Single source of truth held in a ref — mutated freely without triggering renders
  const currentRef = useRef<OrderBookState>(INITIAL_STATE);
  const [state, setState] = useState<OrderBookState>(INITIAL_STATE);

  // Book-update dirty flag + throttle timer
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      // Snapshot the ref so React gets a stable new object
      setState({ ...currentRef.current });
    }, FLUSH_MS);
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "book_snapshot": {
        const pt = extractPricePoint(msg.data.aggregated);
        const cur = currentRef.current;
        const marketChanged = cur.market?.id !== msg.data.market.id;

        let priceHistory: PricePoint[];
        if (marketChanged) {
          priceHistory = pt ? [pt] : [];
        } else if (pt) {
          const last = cur.priceHistory[cur.priceHistory.length - 1];
          const shouldAppend = !last || pt.time - last.time >= MIN_PT_INTERVAL_MS;
          priceHistory = shouldAppend
            ? [...cur.priceHistory.slice(-(MAX_HISTORY - 1)), pt]
            : cur.priceHistory;
        } else {
          priceHistory = cur.priceHistory;
        }

        currentRef.current = {
          ...cur,
          market: msg.data.market,
          aggregated: msg.data.aggregated,
          venues: msg.data.venues,
          health: marketChanged ? {} : cur.health,
          lastQuote: marketChanged ? null : cur.lastQuote,
          priceHistory,
        };
        dirtyRef.current = true;
        scheduleFlush();
        break;
      }

      case "book_update": {
        const pt = extractPricePoint(msg.data.aggregated);
        const cur = currentRef.current;

        let priceHistory = cur.priceHistory;
        if (pt) {
          const last = priceHistory[priceHistory.length - 1];
          const shouldAppend = !last || pt.time - last.time >= MIN_PT_INTERVAL_MS;
          if (shouldAppend) {
            priceHistory = [...priceHistory.slice(-(MAX_HISTORY - 1)), pt];
          }
        }

        currentRef.current = {
          ...cur,
          aggregated: msg.data.aggregated,
          venues: msg.data.venues,
          priceHistory,
        };
        dirtyRef.current = true;
        scheduleFlush();
        break;
      }

      case "health":
        currentRef.current = {
          ...currentRef.current,
          health: { ...currentRef.current.health, ...msg.data.venues },
        };
        // Health changes are infrequent — update immediately
        setState({ ...currentRef.current });
        break;

      case "quote_result":
        currentRef.current = { ...currentRef.current, lastQuote: msg.data };
        setState({ ...currentRef.current });
        break;

      case "error":
        console.error("[ws] Server error:", msg.data.message);
        break;
    }
  }, [scheduleFlush]);

  const seedHistory = useCallback((points: PricePoint[]) => {
    if (points.length === 0) return;
    currentRef.current = {
      ...currentRef.current,
      priceHistory: [...points, ...currentRef.current.priceHistory].slice(-MAX_HISTORY),
    };
    setState({ ...currentRef.current });
  }, []);

  return { state, handleMessage, seedHistory };
}
