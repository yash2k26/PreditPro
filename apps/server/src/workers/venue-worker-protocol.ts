import type { ExploreMarket, VenueOrderBook } from "@repo/shared-types";
import type { VenueHealth } from "../venues/types.ts";

// ── Connect params ──────────────────────────────────────────────────

export interface ConnectParams {
  tokenId?: string;
  ticker?: string;
}

// ── Main → Worker ───────────────────────────────────────────────────

export interface DiscoverMessage {
  type: "discover";
}

export interface ConnectMessage {
  type: "connect";
  sessionId: string;
  params: ConnectParams;
}

export interface DisconnectMessage {
  type: "disconnect";
  sessionId: string;
}

export interface ShutdownMessage {
  type: "shutdown";
}

export type MainToWorkerMessage =
  | DiscoverMessage
  | ConnectMessage
  | DisconnectMessage
  | ShutdownMessage;

// ── Worker → Main ───────────────────────────────────────────────────

export interface DiscoverResultMessage {
  type: "discover_result";
  markets: ExploreMarket[];
}

export interface DiscoverErrorMessage {
  type: "discover_error";
  message: string;
}

export interface BookUpdateMessage {
  type: "book_update";
  sessionId: string;
  book: VenueOrderBook;
}

export interface HealthUpdateMessage {
  type: "health_update";
  sessionId: string;
  health: VenueHealth;
}

export type WorkerToMainMessage =
  | DiscoverResultMessage
  | DiscoverErrorMessage
  | BookUpdateMessage
  | HealthUpdateMessage;
