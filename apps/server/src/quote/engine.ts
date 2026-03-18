import type {
  AggregatedBook,
  AggregatedLevel,
  QuoteRequest,
  QuoteResult,
  FillLeg,
  VenueId,
} from "@repo/shared-types";

/**
 * Compute a quote by walking the aggregated order book.
 *
 * For "yes" side: walk asks (buying YES shares from sellers).
 * For "no" side: walk bids (buying NO is equivalent to selling YES;
 *   the user pays (1 - bidPrice) per NO share from each bid level).
 */
export function computeQuote(
  book: AggregatedBook,
  request: QuoteRequest
): QuoteResult {
  const { requestId, amount, side } = request;

  if (!book || !Number.isFinite(amount) || amount <= 0) {
    return emptyResult(requestId, side, amount || 0);
  }

  // For YES: walk asks from best (lowest) price up
  // For NO: walk bids from best (highest) price down
  //   - buying NO at a bid means: bid is at price P (YES),
  //     so NO costs (1 - P), and you get 1 NO share per contract
  const levels = side === "yes" ? (book.asks ?? []) : (book.bids ?? []);
  const venueFills = new Map<VenueId, { shares: number; cost: number }>();

  let remainingBudget = amount;
  let totalShares = 0;
  let totalCost = 0;
  let bestPrice: number | null = null;

  for (const level of levels) {
    if (remainingBudget <= 0.001) break; // epsilon for floating point

    const pricePerShare = side === "yes" ? level.price : 1 - level.price;
    if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) continue;
    if (!Number.isFinite(level.totalSize) || level.totalSize <= 0) continue;

    if (bestPrice === null) bestPrice = pricePerShare;

    const maxSharesAtLevel = level.totalSize;
    const costForFullLevel = pricePerShare * maxSharesAtLevel;

    let sharesAtLevel: number;
    let costAtLevel: number;

    if (remainingBudget >= costForFullLevel) {
      sharesAtLevel = maxSharesAtLevel;
      costAtLevel = costForFullLevel;
    } else {
      sharesAtLevel = remainingBudget / pricePerShare;
      costAtLevel = remainingBudget;
    }

    totalShares += sharesAtLevel;
    totalCost += costAtLevel;
    remainingBudget -= costAtLevel;

    // Attribute proportionally to venues
    attributeToVenues(level, sharesAtLevel, pricePerShare, venueFills);
  }

  const fills: FillLeg[] = [];
  for (const [venue, fill] of venueFills) {
    if (fill.shares > 0) {
      fills.push({
        venue,
        shares: Math.round(fill.shares * 100) / 100,
        avgPrice: fill.cost / fill.shares,
        cost: Math.round(fill.cost * 100) / 100,
      });
    }
  }

  const avgPrice = totalShares > 0 ? totalCost / totalShares : 0;
  const slippage =
    bestPrice !== null && totalShares > 0 ? avgPrice - bestPrice : 0;

  return {
    requestId,
    side,
    totalShares: Math.round(totalShares * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    avgPrice: Math.round(avgPrice * 10000) / 10000,
    fills,
    slippage: Math.round(slippage * 10000) / 10000,
    unfilled: Math.max(0, Math.round(remainingBudget * 100) / 100),
  };
}

function attributeToVenues(
  level: AggregatedLevel,
  totalSharesFilled: number,
  pricePerShare: number,
  venueFills: Map<VenueId, { shares: number; cost: number }>
): void {
  for (const [venue, venueSize] of Object.entries(level.venues) as [
    VenueId,
    number,
  ][]) {
    const proportion = venueSize / level.totalSize;
    const venueShares = totalSharesFilled * proportion;
    const venueCost = venueShares * pricePerShare;

    let fill = venueFills.get(venue);
    if (!fill) {
      fill = { shares: 0, cost: 0 };
      venueFills.set(venue, fill);
    }
    fill.shares += venueShares;
    fill.cost += venueCost;
  }
}

function emptyResult(
  requestId: string,
  side: "yes" | "no",
  amount: number
): QuoteResult {
  return {
    requestId,
    side,
    totalShares: 0,
    totalCost: 0,
    avgPrice: 0,
    fills: [],
    slippage: 0,
    unfilled: amount,
  };
}
