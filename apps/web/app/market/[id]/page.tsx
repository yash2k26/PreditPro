"use client";

import { use, useEffect, useRef, useState } from "react";
import { useWebSocket } from "../../../hooks/useWebSocket";
import { useOrderBook, type PricePoint } from "../../../hooks/useOrderBook";
import { useQuote } from "../../../hooks/useQuote";
import { MarketHeader } from "../../../components/market/MarketHeader";
import { VenueStatus } from "../../../components/market/VenueStatus";
import { OrderBook } from "../../../components/order-book/OrderBook";
import { DepthChart } from "../../../components/order-book/DepthChart";
import { QuotePanel } from "../../../components/quote/QuotePanel";
import { PriceChart } from "../../../components/market/PriceChart";
import { ProbabilityChart } from "../../../components/market/ProbabilityChart";
import { CryptoChartPanel } from "../../../components/market/CryptoChartPanel";
import { useBinance, detectBinanceSymbol } from "../../../hooks/useBinance";
import { useMemo } from "react";

function HeaderSkeleton() {
  return (
    <div className="market-depth rounded-xl p-5 animate-pulse">
      <div className="flex items-start gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-surface-3 shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="h-5 bg-surface-3 rounded w-3/4" />
          <div className="flex gap-2">
            <div className="h-7 bg-surface-3 rounded-lg w-20" />
            <div className="h-7 bg-surface-3 rounded-lg w-20" />
            <div className="h-7 bg-surface-3 rounded-lg w-20" />
            <div className="h-7 bg-surface-3 rounded-lg w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderBookSkeleton() {
  return (
    <div className="depth-card rounded-xl overflow-hidden animate-pulse">
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
    <div className="depth-card rounded-xl overflow-hidden animate-pulse">
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
  const { state, handleMessage, seedHistory } = useOrderBook();
  const { status, send } = useWebSocket(marketId, handleMessage);
  const { requestQuote } = useQuote(send);
  const [chartsVisible, setChartsVisible] = useState(false);
  const historyFetched = useRef<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    setChartsVisible(false);
    const timer = setTimeout(() => setChartsVisible(true), 140);
    return () => clearTimeout(timer);
  }, [marketId]);

  // Venue history from actual Polymarket/Kalshi APIs
  const [venueHistory, setVenueHistory] = useState<Record<string, Array<{ t: number; y: number }>>>({});

  // Fetch price history on mount — both our internal store AND venue APIs
  useEffect(() => {
    if (historyFetched.current === marketId) return;
    historyFetched.current = marketId;
    const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

    // Fetch our internal 24h history
    fetch(`${API_URL}/api/markets/${encodeURIComponent(marketId)}/history?hours=24`)
      .then((res) => res.ok ? res.json() as Promise<{ points: { t: number; y: number }[] }> : null)
      .then((data) => {
        if (!data?.points?.length) return;
        const points: PricePoint[] = data.points.map((p) => ({
          time: p.t,
          yes: p.y,
          no: 1 - p.y,
        }));
        seedHistory(points);
      })
      .catch(() => {});

    // Fetch actual venue price history (Polymarket CLOB / Kalshi)
    fetch(`${API_URL}/api/markets/${encodeURIComponent(marketId)}/venue-history?interval=all`)
      .then((res) => res.ok ? res.json() as Promise<Record<string, Array<{ t: number; y: number }>>> : null)
      .then((data) => {
        if (!data) return;
        setVenueHistory(data);
        // Also seed combined history from Polymarket data if we have it (better than our 5-min snapshots)
        const polyPoints = data.polymarket;
        if (polyPoints && polyPoints.length > 0) {
          seedHistory(polyPoints.map((p) => ({ time: p.t, yes: p.y, no: 1 - p.y })));
        }
      })
      .catch(() => {});
  }, [marketId, seedHistory]);

  const isLoading = !state.market;

  // Detect if this is a crypto market → show Binance charts
  const binanceSymbol = useMemo(
    () => state.market?.question ? detectBinanceSymbol(state.market.question) : null,
    [state.market?.question]
  );
  const { klines, ticks: binanceTicks, currentPrice, liveLineData } = useBinance(binanceSymbol);

  return (
    <main className="page-shell min-h-screen space-y-3 sm:space-y-4">
      {isLoading ? (
        <HeaderSkeleton />
      ) : (
        <div className="market-depth rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <MarketHeader market={state.market} book={state.aggregated} />
            <div className="shrink-0">
              <VenueStatus health={state.health} wsStatus={status} />
            </div>
          </div>
        </div>
      )}

      {!isLoading && binanceSymbol ? (
        <CryptoChartPanel
          history={state.priceHistory}
          book={state.aggregated}
          venues={state.venues}
          venueHistory={venueHistory}
          symbol={binanceSymbol}
          klines={klines}
          ticks={binanceTicks}
          currentPrice={currentPrice}
          liveLineData={liveLineData}
        />
      ) : !isLoading ? (
        <div className="depth-card rounded-xl overflow-hidden">
          <ProbabilityChart history={state.priceHistory} book={state.aggregated} venues={state.venues} venueHistory={venueHistory} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quote panel — top on mobile, right column on desktop */}
        <div className="lg:col-start-3 lg:row-start-1">
          {isLoading ? (
            <QuotePanelSkeleton />
          ) : (
            <QuotePanel
              onRequestQuote={requestQuote}
              quote={state.lastQuote}
              book={state.aggregated}
            />
          )}
        </div>

        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1 space-y-4">
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
                <DepthChart book={state.aggregated} />
              </div>
              <div
                className={`transition-all duration-900 delay-250 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                  chartsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <PriceChart history={state.priceHistory} />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
