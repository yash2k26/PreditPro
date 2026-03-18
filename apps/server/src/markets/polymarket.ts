import type { ExploreMarket } from "@repo/shared-types";

const GAMMA_API = "https://gamma-api.polymarket.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // safety limit

interface PolymarketRawMarket {
  id: number;
  slug: string;
  question: string;
  category: string;
  image?: string | null;
  icon?: string | null;
  imageUrl?: string | null;
  outcomes: string;
  outcomePrices: string;
  clobTokenIds: string;
  volumeNum: number;
  volume24hr: number;
  liquidityNum: number;
  active: boolean;
  closed: boolean;
}

function pickImageUrl(market: PolymarketRawMarket): string | null {
  const candidate = market.image ?? market.imageUrl ?? market.icon ?? null;
  if (!candidate) return null;
  return candidate.startsWith("http") ? candidate : null;
}

function parseOutcomes(raw: string): [string, string] {
  try {
    const arr = JSON.parse(raw) as string[];
    return [arr[0] ?? "Yes", arr[1] ?? "No"];
  } catch {
    return ["Yes", "No"];
  }
}

function parsePrices(raw: string): [number, number] {
  try {
    const arr = JSON.parse(raw) as string[];
    return [parseFloat(arr[0] ?? "0"), parseFloat(arr[1] ?? "0")];
  } catch {
    return [0, 0];
  }
}

function parseTokenIds(raw: string): [string, string] | undefined {
  try {
    const arr = JSON.parse(raw) as string[];
    if (arr.length >= 2 && arr[0] && arr[1]) {
      return [arr[0], arr[1]];
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPolymarketMarkets(): Promise<ExploreMarket[]> {
  const markets: ExploreMarket[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${GAMMA_API}/markets?limit=${PAGE_SIZE}&offset=${offset}&active=true&closed=false&order=volumeNum&ascending=false`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error(`[polymarket-fetch] HTTP ${res.status} at offset ${offset}`);
      break;
    }

    const data = (await res.json()) as PolymarketRawMarket[];
    if (!Array.isArray(data) || data.length === 0) break;

    for (const m of data) {
      if (!m.active || m.closed) continue;

      const outcomes = parseOutcomes(m.outcomes);
      const [yesPrice, noPrice] = parsePrices(m.outcomePrices);
      const tokenIds = parseTokenIds(m.clobTokenIds);
      const imageUrl = pickImageUrl(m);

      markets.push({
        id: `poly-${m.id}`,
        slug: m.slug,
        question: m.question,
        category: m.category || "Other",
        imageUrl,
        outcomes,
        yesPrice: yesPrice || null,
        noPrice: noPrice || null,
        volume24h: m.volume24hr ?? 0,
        liquidity: m.liquidityNum ?? 0,
        venues: [
          {
            venue: "polymarket",
            slug: m.slug,
            tokenIds,
            imageUrl,
            yesPrice: yesPrice || null,
            noPrice: noPrice || null,
            volume24h: m.volume24hr ?? 0,
            liquidity: m.liquidityNum ?? 0,
          },
        ],
      });
    }

    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }

  console.log(`[polymarket-fetch] Fetched ${markets.length} active markets`);
  return markets;
}
