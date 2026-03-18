"use client";

import type { AggregatedBook, MarketInfo } from "@repo/shared-types";
import { formatPrice, formatSpread } from "../../lib/format";

interface MarketHeaderProps {
  market: MarketInfo | null;
  book: AggregatedBook | null;
}

export function MarketHeader({ market, book }: MarketHeaderProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">
        {market?.question ?? "Loading market..."}
      </h1>

      {book && book.mid !== null && (
        <div className="flex items-center gap-8 text-sm">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">Mid </span>
            <span className="font-medium text-text-primary">
              {formatPrice(book.mid)}
            </span>
          </div>
          {book.spread !== null && (
            <div>
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">Spread </span>
              <span className="font-medium text-text-primary">
                {formatSpread(book.spread)}
              </span>
            </div>
          )}
          {book.bestBid !== null && (
            <div>
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">Bid </span>
              <span className="font-medium text-bid">
                {formatPrice(book.bestBid)}
              </span>
            </div>
          )}
          {book.bestAsk !== null && (
            <div>
              <span className="text-[11px] uppercase tracking-wider font-semibold text-text-muted">Ask </span>
              <span className="font-medium text-ask">
                {formatPrice(book.bestAsk)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
