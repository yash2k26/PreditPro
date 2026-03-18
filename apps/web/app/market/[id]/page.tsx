"use client";

import { use, useEffect, useState } from "react";
import { useWebSocket } from "../../../hooks/useWebSocket";
import { useOrderBook } from "../../../hooks/useOrderBook";
import { useQuote } from "../../../hooks/useQuote";
import { MarketHeader } from "../../../components/market/MarketHeader";
import { VenueStatus } from "../../../components/market/VenueStatus";
import { OrderBook } from "../../../components/order-book/OrderBook";
import { DepthChart } from "../../../components/order-book/DepthChart";
import { QuotePanel } from "../../../components/quote/QuotePanel";
import { PriceChart } from "../../../components/market/PriceChart";

function HeaderSkeleton() {
  return (
    <div className="rounded-xl bg-surface-2 border border-border p-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-6 bg-surface-3 rounded w-3/4" />
        <div className="flex gap-8">
          <div className="h-4 bg-surface-3 rounded w-20" />
          <div className="h-4 bg-surface-3 rounded w-20" />
          <div className="h-4 bg-surface-3 rounded w-20" />
          <div className="h-4 bg-surface-3 rounded w-20" />
        </div>
      </div>
    </div>
  );
}

function OrderBookSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-2 overflow-hidden animate-pulse">
      <div className="px-5 py-3 border-b border-border flex justify-between">
        <div className="h-4 bg-surface-3 rounded w-20" />
        <div className="flex gap-1">
          <div className="h-6 bg-surface-3 rounded w-16" />
          <div className="h-6 bg-surface-3 rounded w-16" />
          <div className="h-6 bg-surface-3 rounded w-16" />
        </div>
      </div>
      <div className="p-3 space-y-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <div className="h-6 bg-surface-3 rounded" style={{ opacity: 1 - i * 0.08 }} />
            <div className="h-6 bg-surface-3 rounded" style={{ opacity: 1 - i * 0.08 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function QuotePanelSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-2 overflow-hidden animate-pulse">
      <div className="px-5 py-3 border-b border-border">
        <div className="h-4 bg-surface-3 rounded w-16" />
      </div>
      <div className="p-5 space-y-5">
        <div className="flex gap-2">
          <div className="flex-1 h-12 bg-surface-3 rounded-xl" />
          <div className="flex-1 h-12 bg-surface-3 rounded-xl" />
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-surface-3 rounded w-24" />
          <div className="h-12 bg-surface-3 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1 h-9 bg-surface-3 rounded-lg" />
          <div className="flex-1 h-9 bg-surface-3 rounded-lg" />
          <div className="flex-1 h-9 bg-surface-3 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const marketId = decodeURIComponent(id);
  const { state, handleMessage } = useOrderBook();
  const { status, send } = useWebSocket(marketId, handleMessage);
  const { requestQuote } = useQuote(send);
  const [chartsVisible, setChartsVisible] = useState(false);

  useEffect(() => {
    setChartsVisible(false);
    const timer = setTimeout(() => setChartsVisible(true), 140);
    return () => clearTimeout(timer);
  }, [marketId]);

  const isLoading = !state.market;

  return (
    <main className="min-h-screen p-8 max-w-[1400px] mx-auto space-y-6">
      {isLoading ? (
        <HeaderSkeleton />
      ) : (
        <div className="rounded-xl bg-surface-2 border border-border p-6">
          <div className="flex items-start justify-between gap-4">
            <MarketHeader market={state.market} book={state.aggregated} />
            <VenueStatus health={state.health} wsStatus={status} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {isLoading ? (
            <OrderBookSkeleton />
          ) : (
            <>
              <OrderBook
                aggregated={state.aggregated}
                venues={state.venues}
              />
              <div
                className={`transition-all duration-900 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                  chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <DepthChart book={state.aggregated} animationKey={`depth-${marketId}`} />
              </div>
              <div
                className={`transition-all duration-900 delay-250 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                  chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <PriceChart history={state.priceHistory} animationKey={`price-${marketId}`} />
              </div>
            </>
          )}
        </div>

        <div>
          {isLoading ? (
            <QuotePanelSkeleton />
          ) : (
            <QuotePanel
              onRequestQuote={requestQuote}
              quote={state.lastQuote}
            />
          )}
        </div>
      </div>
    </main>
  );
}
