import { EventEmitter } from "events";
import type { VenueId, VenueOrderBook, VenueHealth, ConnectionState } from "./types.ts";

export abstract class BaseVenue extends EventEmitter {
  abstract readonly venueId: VenueId;

  protected health: VenueHealth = {
    state: "disconnected",
    lastUpdate: 0,
    latency: 0,
    reconnectAttempts: 0,
  };

  private lastBookEmitTime = 0;

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract getSnapshot(): VenueOrderBook | null;

  getHealth(): VenueHealth {
    return { ...this.health };
  }

  protected setState(state: ConnectionState): void {
    this.health.state = state;

    if (state === "connected") {
      this.health.reconnectAttempts = 0;
    }

    this.emit("state_change", this.getHealth());
  }

  protected emitBookUpdate(book: VenueOrderBook): void {
    const now = Date.now();
    if (this.lastBookEmitTime > 0) {
      this.health.latency = now - this.lastBookEmitTime;
    }
    this.lastBookEmitTime = now;
    this.health.lastUpdate = now;
    this.emit("book_update", book);
  }
}
