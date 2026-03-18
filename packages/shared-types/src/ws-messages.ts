import type { AggregatedBook, VenueId, VenueOrderBook } from "./order-book.js";
import type { QuoteRequest, QuoteResult } from "./quote.js";
import type { MarketInfo } from "./market.js";

// ─── Server → Client ───

export interface BookSnapshotMessage {
  type: "book_snapshot";
  data: {
    market: MarketInfo;
    aggregated: AggregatedBook;
    venues: Partial<Record<VenueId, VenueOrderBook>>;
  };
}

export interface BookUpdateMessage {
  type: "book_update";
  data: {
    aggregated: AggregatedBook;
    venues: Partial<Record<VenueId, VenueOrderBook>>;
  };
}

export interface QuoteResultMessage {
  type: "quote_result";
  data: QuoteResult;
}

export interface VenueHealthInfo {
  connected: boolean;
  lastUpdate: number;
  latency: number;
}

export interface HealthMessage {
  type: "health";
  data: {
    venues: Record<string, VenueHealthInfo>;
  };
}

export interface ServerPingMessage {
  type: "ping";
}

export interface ErrorMessage {
  type: "error";
  data: { code: string; message: string };
}

export type ServerMessage =
  | BookSnapshotMessage
  | BookUpdateMessage
  | QuoteResultMessage
  | HealthMessage
  | ServerPingMessage
  | ErrorMessage;

// ─── Client → Server ───

export interface SubscribeMessage {
  type: "subscribe";
  market: string;
}

export interface QuoteRequestMessage {
  type: "quote_request";
  data: QuoteRequest;
}

export interface ClientPongMessage {
  type: "pong";
}

export type ClientMessage =
  | SubscribeMessage
  | QuoteRequestMessage
  | ClientPongMessage;
