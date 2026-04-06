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

export function useBinance(symbol: string | null) {
  const [klines, setKlines] = useState<Kline[]>([]);
  const [ticks, setTicks] = useState<BinanceTick[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // Mutable refs — never trigger renders directly
  const ticksRef = useRef<BinanceTick[]>([]);
  const currentPriceRef = useRef<number | null>(null);
  const prevTicksLenRef = useRef(0);

  useEffect(() => {
    if (!symbol) return;
    fetchKlines(symbol, "5m", 200).then((data) => {
      if (data.length > 0) {
        setKlines(data);
        const last = data[data.length - 1]!.close;
        setCurrentPrice(last);
        currentPriceRef.current = last;
      }
    });
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;

    let ws: WebSocket;
    let syncTimer: ReturnType<typeof setInterval>;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${BINANCE_WS}/${symbol.toLowerCase()}@aggTrade`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { p: string; T: number };
          const price = parseFloat(data.p);
          const time = data.T;

          // Store in ref — never call setState here (too frequent)
          currentPriceRef.current = price;

          const arr = ticksRef.current;
          if (arr.length === 0 || time - arr[arr.length - 1]!.time > 300) {
            arr.push({ time, price });
            if (arr.length > 1000) arr.splice(0, arr.length - 1000);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    // Single sync interval: flush ticks + currentPrice to state at 500ms
    syncTimer = setInterval(() => {
      const cp = currentPriceRef.current;
      const len = ticksRef.current.length;
      // Only update state if data actually changed
      if (cp !== null) setCurrentPrice(cp);
      if (len !== prevTicksLenRef.current) {
        prevTicksLenRef.current = len;
        setTicks([...ticksRef.current]);
      }
    }, 500);

    return () => {
      closed = true;
      clearInterval(syncTimer);
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [symbol]);

  // Combined live line: kline closes + live ticks after last kline
  const liveLineData = useMemo(() => {
    const points: BinanceTick[] = klines.map((k) => ({ time: k.time, price: k.close }));
    const lastKlineTime = klines.length > 0 ? klines[klines.length - 1]!.time : 0;
    for (const t of ticks) {
      if (t.time > lastKlineTime) points.push(t);
    }
    return points;
  }, [klines, ticks]);

  return { klines, ticks, currentPrice, liveLineData };
}
