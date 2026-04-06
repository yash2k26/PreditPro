"use client";
/* eslint-disable @next/next/no-img-element */

import { memo } from "react";
import type { AggregatedBook, MarketInfo } from "@repo/shared-types";
import { formatPrice, formatSpread } from "../../lib/format";

interface MarketHeaderProps {
  market: MarketInfo | null;
  book: AggregatedBook | null;
}

function MarketAvatar({ market }: { market: MarketInfo }) {
  const fallbackLetter = market.question?.trim()?.[0]?.toUpperCase() ?? "M";

  if (market.imageUrl) {
    return (
      <img
        src={market.imageUrl}
        alt={market.question}
        className="h-11 w-11 rounded-xl object-cover border border-white/15 shadow-sm shrink-0"
      />
    );
  }

  return (
    <div className="h-11 w-11 rounded-xl border border-border bg-linear-to-br from-accent/20 to-accent/5 flex items-center justify-center text-sm font-bold text-accent shrink-0 shadow-sm">
      {fallbackLetter}
    </div>
  );
}

export const MarketHeader = memo(function MarketHeader({ market, book }: MarketHeaderProps) {
  return (
    <div className="flex items-start gap-3.5">
      {market && <MarketAvatar market={market} />}
      <div className="space-y-2 min-w-0 flex-1">
        <h1 className="text-sm sm:text-base font-bold text-text-primary leading-snug">
          {market?.question ?? "Loading market..."}
        </h1>

        {book && book.mid !== null && (
          <div className="flex items-center flex-wrap gap-2 text-[13px]">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-3/60 border border-border/50">
              <span className="text-[11px] uppercase tracking-wider font-bold text-text-muted">Mid</span>
              <span className="font-semibold text-text-primary tabular-nums">
                {formatPrice(book.mid)}
              </span>
            </div>
            {book.spread !== null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-3/60 border border-border/50">
                <span className="text-[11px] uppercase tracking-wider font-bold text-text-muted">Spread</span>
                <span className="font-semibold text-text-primary tabular-nums">
                  {formatSpread(book.spread)}
                </span>
              </div>
            )}
            {book.bestBid !== null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bid/5 border border-bid/15">
                <span className="text-[11px] uppercase tracking-wider font-bold text-text-muted">Bid</span>
                <span className="font-semibold text-bid tabular-nums">
                  {formatPrice(book.bestBid)}
                </span>
              </div>
            )}
            {book.bestAsk !== null && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-ask/5 border border-ask/15">
                <span className="text-[11px] uppercase tracking-wider font-bold text-text-muted">Ask</span>
                <span className="font-semibold text-ask tabular-nums">
                  {formatPrice(book.bestAsk)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
