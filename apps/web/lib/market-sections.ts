import type { ExploreMarket } from "@repo/shared-types";

export type SectionKey =
  | "trending"
  | "sports"
  | "crypto"
  | "politics"
  | "economy"
  | "tech"
  | "world"
  | "culture"
  | "other";

export const SECTION_LABEL: Record<SectionKey, string> = {
  trending: "Trending",
  sports: "Sports",
  crypto: "Crypto",
  politics: "Politics",
  economy: "Economy",
  tech: "Tech",
  world: "World",
  culture: "Culture",
  other: "Other",
};

export const SECTION_ORDER: SectionKey[] = [
  "trending",
  "sports",
  "crypto",
  "politics",
  "economy",
  "tech",
  "world",
  "culture",
];

export const CATEGORY_SECTIONS: SectionKey[] = [
  "sports",
  "crypto",
  "politics",
  "economy",
  "tech",
  "world",
  "culture",
  "other",
];

function includesAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

export function detectSection(market: Pick<ExploreMarket, "category" | "question">): SectionKey {
  const text = `${market.category ?? ""} ${market.question ?? ""}`.toLowerCase();
  if (
    includesAny(text, [
      "sport", "nba", "wnba", "nfl", "mlb", "nhl", "ncaa", "soccer", "football", "basketball", "tennis",
      "golf", "f1", "formula 1", "cricket", "ufc", "boxing", "champion", "playoff", "world cup",
    ])
  ) return "sports";
  if (
    includesAny(text, [
      "crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "doge", "xrp", "defi", "token",
      "altcoin", "stablecoin", "blockchain",
    ])
  ) return "crypto";
  if (
    includesAny(text, [
      "polit", "election", "president", "senate", "house", "government", "congress", "prime minister",
      "vote", "campaign", "democrat", "republican", "parliament",
    ])
  ) return "politics";
  if (
    includesAny(text, [
      "econom", "finance", "inflation", "cpi", "fed", "fomc", "interest rate", "recession", "gdp", "jobs",
      "unemployment", "stock", "nasdaq", "s&p", "dow", "earnings", "bond", "treasury",
    ])
  ) return "economy";
  if (
    includesAny(text, [
      "tech", "ai", "openai", "chatgpt", "nvidia", "tesla", "apple", "google", "meta", "microsoft",
      "semiconductor", "chip", "robot", "software",
    ])
  ) return "tech";
  if (
    includesAny(text, [
      "world", "geopolit", "international", "war", "conflict", "china", "russia", "ukraine", "israel",
      "iran", "middle east", "europe", "asia", "africa",
    ])
  ) return "world";
  if (
    includesAny(text, [
      "culture", "movie", "music", "oscar", "grammy", "tv", "celebrity", "award", "netflix", "entertainment",
    ])
  ) return "culture";
  return "other";
}

