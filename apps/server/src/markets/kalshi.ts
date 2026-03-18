import type { ExploreMarket } from "@repo/shared-types";

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";
const PAGE_SIZE = 200;
const MAX_PAGES = 30; // safety limit

interface KalshiRawMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle: string;
  category: string;
  image?: string | null;
  icon?: string | null;
  image_url?: string | null;
  event_image?: string | null;
  status: string;
  market_type: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  no_bid_dollars: string;
  no_ask_dollars: string;
  last_price_dollars: string;
  volume_24h_fp: string;
  liquidity_dollars: string;
}

function pickImageUrl(market: KalshiRawMarket): string | null {
  const candidate =
    market.image ??
    market.image_url ??
    market.event_image ??
    market.icon ??
    null;
  if (!candidate) return null;
  return candidate.startsWith("http") ? candidate : null;
}

function parseDollars(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export async function fetchKalshiMarkets(): Promise<ExploreMarket[]> {
  const markets: ExploreMarket[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    let url = `${KALSHI_API}/markets?limit=${PAGE_SIZE}&status=open&mve_filter=exclude`;
    if (cursor) url += `&cursor=${cursor}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`[kalshi-fetch] HTTP ${res.status} at page ${page}`);
      break;
    }

    const data = (await res.json()) as {
      markets: KalshiRawMarket[];
      cursor: string | null;
    };

    if (!data.markets || data.markets.length === 0) break;

    for (const m of data.markets) {
      // Skip any remaining multivariate parlays
      if (m.ticker.includes("KXMVE")) continue;
      // Skip markets with no meaningful title
      if (!m.title || m.title.length < 5) continue;

      const yesBid = parseDollars(m.yes_bid_dollars);
      const yesAsk = parseDollars(m.yes_ask_dollars);
      const noBid = parseDollars(m.no_bid_dollars);
      const noAsk = parseDollars(m.no_ask_dollars);
      const yesPrice = yesBid !== null && yesAsk !== null
        ? Math.round(((yesBid + yesAsk) / 2) * 100) / 100
        : yesBid ?? yesAsk;
      const noPrice = noBid !== null && noAsk !== null
        ? Math.round(((noBid + noAsk) / 2) * 100) / 100
        : noBid ?? noAsk;
      const volume24h = parseFloat(m.volume_24h_fp || "0");
      const liquidity = parseFloat(m.liquidity_dollars || "0");

      const question = m.subtitle
        ? `${m.title} - ${m.subtitle}`
        : m.title;
      const imageUrl = pickImageUrl(m);

      markets.push({
        id: `kalshi-${m.ticker}`,
        slug: m.ticker.toLowerCase(),
        question,
        category: m.category || "Other",
        imageUrl,
        outcomes: ["Yes", "No"],
        yesPrice,
        noPrice,
        volume24h,
        liquidity,
        venues: [
          {
            venue: "kalshi",
            ticker: m.ticker,
            imageUrl,
            yesPrice,
            noPrice,
            volume24h,
            liquidity,
          },
        ],
      });
    }

    cursor = data.cursor ?? null;
    if (!cursor) break;
  }

  console.log(`[kalshi-fetch] Fetched ${markets.length} active markets`);
  return markets;
}
