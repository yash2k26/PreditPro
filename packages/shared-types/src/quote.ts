import type { VenueId } from "./order-book.js";

export interface QuoteRequest {
  requestId: string;
  amount: number; // dollars to spend
  side: "yes" | "no";
}

export interface FillLeg {
  venue: VenueId;
  shares: number;
  avgPrice: number;
  cost: number;
}

export interface QuoteResult {
  requestId: string;
  side: "yes" | "no";
  totalShares: number;
  totalCost: number;
  avgPrice: number;
  fills: FillLeg[];
  slippage: number; // avgPrice vs best available price
  unfilled: number; // dollars that couldn't be filled
}
