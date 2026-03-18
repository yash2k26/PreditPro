"use client";

import { useState, useEffect } from "react";
import type { QuoteResult } from "@repo/shared-types";
import { formatDollars, formatPrice, formatSize } from "../../lib/format";
import { FillBreakdown } from "./FillBreakdown";

interface QuotePanelProps {
  onRequestQuote: (amount: number, side: "yes" | "no") => void;
  quote: QuoteResult | null;
}

const PRESET_AMOUNTS = [100, 500, 1000];

export function QuotePanel({ onRequestQuote, quote }: QuotePanelProps) {
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
    <div className="rounded-xl border border-border bg-surface-2 overflow-hidden shadow-md">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Get Quote
        </h2>
      </div>

      <div className="p-5 space-y-5">
        {/* Side toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setSide("yes")}
            className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-colors ${
              side === "yes"
                ? "bg-bid/15 text-bid border-2 border-bid"
                : "bg-surface-3 text-text-secondary border-2 border-transparent hover:text-text-primary"
            }`}
          >
            Buy Yes
          </button>
          <button
            onClick={() => setSide("no")}
            className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-colors ${
              side === "no"
                ? "bg-ask/15 text-ask border-2 border-ask"
                : "bg-surface-3 text-text-secondary border-2 border-transparent hover:text-text-primary"
            }`}
          >
            Buy No
          </button>
        </div>

        {/* Amount input */}
        <div>
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-text-muted mb-2">
            Amount to spend
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">
              $
            </span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              min="0"
              step="10"
              className="w-full pl-8 pr-4 py-3 bg-surface-3 border border-border rounded-xl text-sm font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
            />
          </div>

          {/* Preset amounts */}
          <div className="flex gap-2 mt-2">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(String(preset))}
                className="flex-1 py-2 text-xs font-semibold rounded-lg bg-surface-3 text-text-secondary hover:text-text-primary hover:border-border border border-transparent transition-colors"
              >
                ${preset >= 1000 ? `${preset / 1000}k` : preset}
              </button>
            ))}
          </div>
        </div>

        {/* Quote result — always visible */}
        <div className="space-y-4 pt-4 border-t border-border">
          {/* Primary stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-surface-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Shares</div>
              <div className="font-semibold">{hasQuote ? formatSize(quote.totalShares) : "—"}</div>
            </div>
            <div className="p-3 rounded-lg bg-surface-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Avg Price</div>
              <div className="font-semibold">{hasQuote ? formatPrice(quote.avgPrice) : "—"}</div>
            </div>
            <div className="p-3 rounded-lg bg-surface-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Total Cost</div>
              <div className="font-semibold">{hasQuote ? formatDollars(quote.totalCost) : "—"}</div>
            </div>
            <div className="p-3 rounded-lg bg-surface-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-text-muted mb-0.5">Slippage</div>
              <div className={`font-semibold ${hasQuote && quote.slippage > 0.005 ? "text-ask" : ""}`}>
                {hasQuote ? `${(quote.slippage * 100).toFixed(2)}¢` : "—"}
              </div>
            </div>
          </div>

          {/* Return & impact — always visible */}
          <div className="p-4 rounded-xl bg-surface border border-border text-sm space-y-3">
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
            <div className="text-xs text-ask bg-ask-muted px-3 py-2 rounded-xl">
              Insufficient liquidity: {formatDollars(quote.unfilled)} unfilled
            </div>
          )}

          {/* Fill breakdown */}
          {hasQuote && <FillBreakdown fills={quote.fills} totalCost={quote.totalCost} />}
        </div>
      </div>
    </div>
  );
}
