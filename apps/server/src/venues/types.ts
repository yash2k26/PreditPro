import type { VenueId, VenueOrderBook } from "@repo/shared-types";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface VenueHealth {
  state: ConnectionState;
  lastUpdate: number;
  latency: number;
  reconnectAttempts: number;
}

export type { VenueId, VenueOrderBook };
