/**
 * Fetches historical price data from venue APIs (Polymarket CLOB, Kalshi).
 * Returns normalized { t: timestamp_ms, y: yes_price_0_to_1 } points.
 */

const POLY_CLOB = "https://clob.polymarket.com";
const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

export interface HistoryPoint {
  t: number; // timestamp ms
  y: number; // yes price 0-1
}

// Fidelity = minutes per data point
const INTERVAL_FIDELITY: Record<string, number> = {
  "1h": 1,
  "6h": 5,
  "1d": 10,
  "1w": 60,
  "1m": 360,
  all: 720,
};

/**
 * Fetch Polymarket CLOB price history for a YES token.
 */
export async function fetchPolymarketHistory(
  tokenId: string,
  interval = "all"
): Promise<HistoryPoint[]> {
  const fidelity = INTERVAL_FIDELITY[interval] ?? 60;
  const url = `${POLY_CLOB}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { history: Array<{ t: number; p: number }> };
    if (!data.history || !Array.isArray(data.history)) return [];

    return data.history.map((pt) => ({
      t: pt.t * 1000, // Polymarket returns seconds → convert to ms
      y: pt.p,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch Kalshi market history for a ticker.
 */
export async function fetchKalshiHistory(
  ticker: string,
  _interval = "all"
): Promise<HistoryPoint[]> {
  // Kalshi v2 API: /markets/{ticker}/candlesticks
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60;
  const url = `${KALSHI_API}/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${sevenDaysAgo}&end_ts=${now}&period_interval=60`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      candlesticks?: Array<{
        end_period_ts: number;
        yes_bid: number;
        price: number;
      }>;
    };
    if (!data.candlesticks || !Array.isArray(data.candlesticks)) return [];

    return data.candlesticks
      .filter((c) => c.price > 0)
      .map((c) => ({
        t: c.end_period_ts * 1000,
        y: c.price / 100, // Kalshi prices are in cents → convert to 0-1
      }));
  } catch {
    return [];
  }
}
