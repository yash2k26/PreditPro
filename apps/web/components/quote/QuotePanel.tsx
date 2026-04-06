"use client";

import { memo, useState, useEffect } from "react";
import type { AggregatedBook, QuoteResult } from "@repo/shared-types";
import { formatDollars, formatPrice, formatSize } from "../../lib/format";
import { FillBreakdown } from "./FillBreakdown";

interface QuotePanelProps {
  onRequestQuote: (amount: number, side: "yes" | "no") => void;
  quote: QuoteResult | null;
  book?: AggregatedBook | null;
}

const PRESET_AMOUNTS = [100, 500, 1000];

export const QuotePanel = memo(function QuotePanel({ onRequestQuote, quote, book }: QuotePanelProps) {
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<"yes" | "no">("yes");

  const numAmount = parseFloat(amount);
  const isValid = !isNaN(numAmount) && numAmount > 0;

  useEffect(() => {
    if (isValid) {
      onRequestQuote(numAmount, side);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numAmount, side, onRequestQuote]);

  const hasQuote = isValid && quote && quote.totalShares > 0;

  // Derived stats
  const potentialReturn = hasQuote ? quote.totalShares - quote.totalCost : null;
  const roi = hasQuote && quote.totalCost > 0
    ? ((quote.totalShares - quote.totalCost) / quote.totalCost) * 100
    : null;
  const priceImpact = hasQuote && quote.avgPrice > 0 && quote.slippage > 0
    ? (quote.slippage / quote.avgPrice) * 100
    : 0;

  return (
    <div className="depth-card rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">
          Get Quote
        </h2>
      </div>

      <div className="p-4 space-y-4">
        {/* Side toggle */}
        <div className="depth-segment flex gap-2 rounded-xl p-1">
          <button
            onClick={() => setSide("yes")}
            className={`flex-1 h-10 flex items-center justify-center gap-1.5 text-[13px] font-semibold rounded-xl transition-colors ${
              side === "yes"
                ? "bg-bid/15 text-bid border-2 border-bid"
                : "bg-transparent text-text-secondary border-2 border-transparent hover:text-text-primary"
            }`}
          >
            Buy Yes
            {book?.bestAsk != null && (
              <span className={`text-[11px] font-medium tabular-nums ${side === "yes" ? "text-bid/70" : "text-text-muted"}`}>
                {(book.bestAsk * 100).toFixed(0)}¢
              </span>
            )}
          </button>
          <button
            onClick={() => setSide("no")}
            className={`flex-1 h-10 flex items-center justify-center gap-1.5 text-[13px] font-semibold rounded-xl transition-colors ${
              side === "no"
                ? "bg-ask/15 text-ask border-2 border-ask"
                : "bg-transparent text-text-secondary border-2 border-transparent hover:text-text-primary"
            }`}
          >
            Buy No
            {book?.bestBid != null && (
              <span className={`text-[11px] font-medium tabular-nums ${side === "no" ? "text-ask/70" : "text-text-muted"}`}>
                {((1 - book.bestBid) * 100).toFixed(0)}¢
              </span>
            )}
          </button>
        </div>

        {/* Amount input */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-1.5">
            Amount to spend
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-[13px] font-medium">
              $
            </span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              min="0"
              step="10"
              className="w-full h-9 pl-7 pr-3.5 bg-surface-3 border border-border rounded-xl text-[13px] font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            />
          </div>

          {/* Preset amounts */}
          <div className="flex gap-2 mt-2">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className="depth-segment flex-1 h-9 text-[13px] font-semibold rounded-xl text-text-secondary hover:text-text-primary transition-colors active:scale-95"
              >
                ${preset >= 1000 ? `${preset / 1000}k` : preset}
              </button>
            ))}
          </div>
        </div>

        {/* Quote result — always visible */}
        <div className="space-y-3 pt-3 border-t border-border">
          {/* Primary stats */}
          <div className="grid grid-cols-2 gap-2.5 text-[13px]">
            <div className="depth-segment p-2.5 rounded-xl">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Shares</div>
              <div className="font-semibold">{hasQuote ? formatSize(quote.totalShares) : "—"}</div>
            </div>
            <div className="depth-segment p-2.5 rounded-xl">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Avg Price</div>
              <div className="font-semibold">{hasQuote ? formatPrice(quote.avgPrice) : "—"}</div>
            </div>
            <div className="depth-segment p-2.5 rounded-xl">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Total Cost</div>
              <div className="font-semibold">{hasQuote ? formatDollars(quote.totalCost) : "—"}</div>
            </div>
            <div className="depth-segment p-2.5 rounded-xl">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Slippage</div>
              <div className={`font-semibold ${hasQuote && quote.slippage > 0.005 ? "text-ask" : ""}`}>
                {hasQuote ? `${(quote.slippage * 100).toFixed(2)}¢` : "—"}
              </div>
            </div>
          </div>

          {/* Return & impact — always visible */}
          <div className="depth-card p-3.5 rounded-xl text-[13px] space-y-2.5">
            <div className="flex justify-between">
              <span className="text-text-muted">Potential Return</span>
              {potentialReturn !== null && roi !== null ? (
                <span className={`font-semibold ${potentialReturn >= 0 ? "text-bid" : "text-ask"}`}>
                  {formatDollars(potentialReturn)} ({roi >= 0 ? "+" : ""}{roi.toFixed(1)}%)
                </span>
              ) : (
                <span className="font-semibold text-text-muted">—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Price Impact</span>
              {hasQuote ? (
                <span className={`font-semibold ${priceImpact > 1 ? "text-ask" : priceImpact > 0.1 ? "text-accent" : ""}`}>
                  {priceImpact < 0.01 ? "< 0.01%" : `${priceImpact.toFixed(2)}%`}
                </span>
              ) : (
                <span className="font-semibold text-text-muted">—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Max Payout</span>
              <span className="font-semibold">
                {hasQuote ? formatDollars(quote.totalShares) : "—"}
              </span>
            </div>
          </div>

          {/* Unfilled warning */}
          {hasQuote && quote.unfilled > 0 && (
            <div className="text-[13px] text-ask bg-ask-muted px-3 py-2 rounded-xl">
              Insufficient liquidity: {formatDollars(quote.unfilled)} unfilled
            </div>
          )}

          {/* Fill breakdown */}
          {hasQuote && <FillBreakdown fills={quote.fills} totalCost={quote.totalCost} />}
        </div>
      </div>
    </div>
  );
});
