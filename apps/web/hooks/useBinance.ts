"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const BINANCE_REST = "https://api.binance.com/api/v3";
const BINANCE_WS = "wss://stream.binance.com:9443/ws";

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BinanceTick {
  time: number;
  price: number;
}

/**
 * Detect which Binance symbol a market question refers to.
 */
export function detectBinanceSymbol(question: string): string | null {
  const q = ` ${question.toLowerCase()} `;
  const symbols: [string[], string][] = [
    [["bitcoin", "btc"], "BTCUSDT"],
    [["ethereum", "eth"], "ETHUSDT"],
    [["solana", "sol"], "SOLUSDT"],
    [["dogecoin", "doge"], "DOGEUSDT"],
    [["xrp", "ripple"], "XRPUSDT"],
  ];
  for (const [keywords, symbol] of symbols) {
    if (keywords.some((k) => q.includes(k))) return symbol;
  }
  return null;
}

/**
 * Fetch historical klines from Binance REST API.
 */
export async function fetchKlines(
  symbol: string,
  interval = "5m",
  limit = 200
): Promise<Kline[]> {
  const url = `${BINANCE_REST}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<
      [number, string, string, string, string, string, ...unknown[]]
    >;
    return data.map((k) => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch {
    return [];
  }
}

/**
 * Hook: live Binance price via WebSocket + historical klines.
 */
export function useBinance(symbol: string | null) {
  const [klines, setKlines] = useState<Kline[]>([]);
  const [ticks, setTicks] = useState<BinanceTick[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ticksRef = useRef<BinanceTick[]>([]);

  // Fetch klines on mount
  useEffect(() => {
    if (!symbol) return;
    console.log(`[binance] Fetching klines for ${symbol}...`);
    fetchKlines(symbol, "5m", 200).then((data) => {
      console.log(`[binance] Got ${data.length} klines`);
      if (data.length > 0) {
        setKlines(data);
        setCurrentPrice(data[data.length - 1]!.close);
      }
    });
  }, [symbol]);

  // WebSocket for live trades
  useEffect(() => {
    if (!symbol) return;

    let ws: WebSocket;
    let syncTimer: ReturnType<typeof setInterval>;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${BINANCE_WS}/${symbol.toLowerCase()}@aggTrade`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[binance] Connected to ${symbol}`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { p: string; T: number };
          const price = parseFloat(data.p);
          const time = data.T;
          setCurrentPrice(price);

          const arr = ticksRef.current;
          // Throttle: only store if >300ms since last tick
          if (arr.length === 0 || time - arr[arr.length - 1]!.time > 300) {
            arr.push({ time, price });
            if (arr.length > 1000) arr.splice(0, arr.length - 1000);
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    // Sync ticks ref → state every 500ms
    syncTimer = setInterval(() => {
      if (ticksRef.current.length > 0) {
        setTicks([...ticksRef.current]);
      }
    }, 500);

    return () => {
      closed = true;
      clearInterval(syncTimer);
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol]);

  // Combined live line: kline closes (history) + live ticks (recent)
  const liveLineData = useMemo(() => {
    const points: BinanceTick[] = klines.map((k) => ({ time: k.time, price: k.close }));
    // Dedupe: only add ticks that are after the last kline
    const lastKlineTime = klines.length > 0 ? klines[klines.length - 1]!.time : 0;
    const recentTicks = ticks.filter((t) => t.time > lastKlineTime);
    return [...points, ...recentTicks];
  }, [klines, ticks]);

  return { klines, ticks, currentPrice, liveLineData };
}
