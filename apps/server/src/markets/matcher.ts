import type { ExploreMarket } from "@repo/shared-types";

/**
 * Fuzzy-matches markets across Polymarket and Kalshi to find the same
 * real-world event listed on both venues, then merges them into a single
 * ExploreMarket with both venues in the `venues` array.
 */

const STOP_WORDS = new Set([
  "the", "will", "does", "did", "has", "have", "had", "was", "were",
  "are", "been", "being", "and", "but", "for", "not", "you", "all",
  "can", "her", "his", "its", "our", "out", "own", "she", "who",
  "with", "that", "this", "from", "they", "than", "what", "when",
  "which", "would", "about", "could", "into", "more", "other",
  "should", "their", "there", "these", "those", "before", "after",
  "during", "each", "some", "such", "through", "under", "over",
  "between", "both", "same", "any", "how", "most", "very",
  "just", "also", "only", "still", "even", "back", "too",
  "end", "yes", "market", "markets",
]);

/** Normalize a question to significant lowercase tokens */
function tokenize(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Jaccard similarity between two token sets */
function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

const MATCH_THRESHOLD = 0.3;
const MIN_OVERLAP = 3;

/** Extract all numbers from a string (e.g. "$64,000" → ["64000"]) */
function extractNumbers(text: string): Set<string> {
  const nums = new Set<string>();
  const matches = text.match(/[\d,]+/g);
  if (matches) {
    for (const m of matches) {
      const clean = m.replace(/,/g, "");
      if (clean.length >= 2) nums.add(clean); // skip single digits
    }
  }
  return nums;
}

/**
 * Reject matches where both venues have YES prices that differ by more
 * than 25¢ — a large price gap means different underlying events.
 */
function pricesCompatible(a: ExploreMarket, b: ExploreMarket): boolean {
  const priceA = a.yesPrice;
  const priceB = b.yesPrice;
  if (priceA === null || priceB === null) return true;
  return Math.abs(priceA - priceB) <= 0.25;
}

/**
 * When both questions contain significant numbers (like price thresholds),
 * at least one number must appear in both. This prevents
 * "Bitcoin above $64,000" matching "Bitcoin above $82,000".
 */
function numbersCompatible(qA: string, qB: string): boolean {
  const numsA = extractNumbers(qA);
  const numsB = extractNumbers(qB);
  // If either has no numbers, no conflict
  if (numsA.size === 0 || numsB.size === 0) return true;
  // At least one number must match
  for (const n of numsA) {
    if (numsB.has(n)) return true;
  }
  return false;
}

/**
 * Match Polymarket and Kalshi markets, merge matched pairs, and return
 * a unified list. Unmatched markets are preserved as-is.
 */
export function mergeMatchingMarkets(
  polymarkets: ExploreMarket[],
  kalshiMarkets: ExploreMarket[]
): { merged: ExploreMarket[]; matchCount: number } {
  // Build an inverted index: word → list of kalshi market indices
  const kalshiTokenSets: Set<string>[] = [];
  const invertedIndex = new Map<string, number[]>();

  for (let i = 0; i < kalshiMarkets.length; i++) {
    const tokens = tokenize(kalshiMarkets[i]!.question);
    const tokenSet = new Set(tokens);
    kalshiTokenSets.push(tokenSet);

    for (const token of tokenSet) {
      let list = invertedIndex.get(token);
      if (!list) {
        list = [];
        invertedIndex.set(token, list);
      }
      list.push(i);
    }
  }

  const matchedKalshiIndices = new Set<number>();
  const mergedMarkets: ExploreMarket[] = [];
  let matchCount = 0;

  // For each Polymarket market, find the best Kalshi match
  for (const polyMarket of polymarkets) {
    const polyTokens = tokenize(polyMarket.question);
    const polySet = new Set(polyTokens);

    // Collect candidate Kalshi indices that share at least one token
    const candidateCounts = new Map<number, number>();
    for (const token of polySet) {
      const indices = invertedIndex.get(token);
      if (!indices) continue;
      for (const idx of indices) {
        if (matchedKalshiIndices.has(idx)) continue;
        candidateCounts.set(idx, (candidateCounts.get(idx) ?? 0) + 1);
      }
    }

    // Score candidates — only consider those with enough overlap
    let bestIdx = -1;
    let bestScore = 0;

    for (const [idx, overlapCount] of candidateCounts) {
      if (overlapCount < MIN_OVERLAP) continue;
      // Reject if numeric thresholds conflict (e.g. different Bitcoin prices)
      if (!numbersCompatible(polyMarket.question, kalshiMarkets[idx]!.question)) continue;
      if (!pricesCompatible(polyMarket, kalshiMarkets[idx]!)) continue;
      const score = jaccard(polySet, kalshiTokenSets[idx]!);
      if (score > bestScore && score >= MATCH_THRESHOLD) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    if (bestIdx >= 0) {
      // Merge: use Polymarket question as canonical
      const kalshiMarket = kalshiMarkets[bestIdx]!;
      matchedKalshiIndices.add(bestIdx);
      matchCount++;

      const polyVenue = polyMarket.venues[0]!;
      const kalshiVenue = kalshiMarket.venues[0]!;

      mergedMarkets.push({
        id: polyMarket.id, // canonical ID is polymarket's
        slug: polyMarket.slug,
        question: polyMarket.question,
        category: polyMarket.category,
        imageUrl: polyMarket.imageUrl ?? kalshiMarket.imageUrl ?? null,
        outcomes: polyMarket.outcomes,
        yesPrice: polyVenue.yesPrice, // use Polymarket as primary price
        noPrice: polyVenue.noPrice,
        volume24h: polyVenue.volume24h + kalshiVenue.volume24h,
        liquidity: polyVenue.liquidity + kalshiVenue.liquidity,
        venues: [polyVenue, kalshiVenue],
      });
    } else {
      // No match — keep polymarket market as-is
      mergedMarkets.push(polyMarket);
    }
  }

  // Add unmatched Kalshi markets
  for (let i = 0; i < kalshiMarkets.length; i++) {
    if (!matchedKalshiIndices.has(i)) {
      mergedMarkets.push(kalshiMarkets[i]!);
    }
  }

  return { merged: mergedMarkets, matchCount };
}
