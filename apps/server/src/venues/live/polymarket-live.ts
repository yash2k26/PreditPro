import WebSocket from "ws";
import type { VenueOrderBook, PriceLevel } from "@repo/shared-types";
import { BaseVenue } from "../base-venue.ts";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const PING_INTERVAL_MS = 10_000;
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

/**
 * Live Polymarket venue — subscribes to the public CLOB WebSocket for
 * real-time level-2 order book updates. No authentication required.
 */
export class PolymarketLiveVenue extends BaseVenue {
  readonly venueId = "polymarket" as const;
  private tokenId: string;

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private dataTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = BASE_RECONNECT_MS;
  private intentionalClose = false;

  // Maintained book state
  private bids: Map<number, number> = new Map(); // price → size
  private asks: Map<number, number> = new Map();

  constructor(tokenId: string) {
    super();
    this.tokenId = tokenId;
  }

  async connect(): Promise<void> {
    this.intentionalClose = false;
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.bids.clear();
    this.asks.clear();
    this.setState("disconnected");
  }

  getSnapshot(): VenueOrderBook | null {
    if (this.bids.size === 0 && this.asks.size === 0) return null;
    return this.buildBook();
  }

  // ── WebSocket lifecycle ──────────────────────────────────────────

  private openSocket(): void {
    this.setState("connecting");
    this.ws = new WebSocket(WS_URL);

    this.ws.on("open", () => {
      this.reconnectDelay = BASE_RECONNECT_MS;
      this.subscribe();
      this.startPing();
      // Detect stuck connections: if no data arrives within 15s, force reconnect
      this.dataTimeout = setTimeout(() => {
        if (this.health.state !== "connected") {
          console.warn("[polymarket-live] No data received after connect, reconnecting");
          this.cleanup();
          this.scheduleReconnect();
        }
      }, 15_000);
    });

    this.ws.on("message", (raw: WebSocket.RawData) => {
      this.handleMessage(raw);
    });

    this.ws.on("close", () => {
      this.cleanup();
      if (!this.intentionalClose) this.scheduleReconnect();
    });

    this.ws.on("error", () => {
      // 'close' fires after 'error', reconnect handled there
    });
  }

  private subscribe(): void {
    this.ws?.send(
      JSON.stringify({
        assets_ids: [this.tokenId],
        type: "market",
        initial_dump: true,
        level: 2,
      })
    );
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("PING");
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return; // already scheduled
    this.setState("reconnecting");
    this.health.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_MS);
  }

  private cleanup(): void {
    this.stopPing();
    if (this.dataTimeout) {
      clearTimeout(this.dataTimeout);
      this.dataTimeout = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  // ── Message handling ─────────────────────────────────────────────

  private handleMessage(raw: WebSocket.RawData): void {
    const text = raw.toString();
    if (text === "PONG") return;

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return; // ignore non-JSON
    }

    if (!data || typeof data !== "object") return;

    // The WS can send arrays of events
    const events = Array.isArray(data) ? data : [data];
    let updated = false;

    for (const evt of events) {
      if (!evt || typeof evt !== "object") continue;
      const e = evt as Record<string, unknown>;

      if (e["event_type"] === "book") {
        this.applySnapshot(e);
        updated = true;
      } else if (e["event_type"] === "price_change") {
        this.applyDelta(e);
        updated = true;
      }
    }

    if (updated) {
      if (this.dataTimeout) {
        clearTimeout(this.dataTimeout);
        this.dataTimeout = null;
      }
      this.setState("connected");
      this.emitBookUpdate(this.buildBook());
    }
  }

  private applySnapshot(e: Record<string, unknown>): void {
    this.bids.clear();
    this.asks.clear();

    const rawBids = e["bids"] as Array<{ price: string; size: string }> | undefined;
    const rawAsks = e["asks"] as Array<{ price: string; size: string }> | undefined;

    for (const l of rawBids ?? []) {
      const price = parseFloat(l.price);
      const size = parseFloat(l.size);
      if (price > 0 && size > 0) this.bids.set(price, size);
    }
    for (const l of rawAsks ?? []) {
      const price = parseFloat(l.price);
      const size = parseFloat(l.size);
      if (price > 0 && size > 0) this.asks.set(price, size);
    }
  }

  private applyDelta(e: Record<string, unknown>): void {
    const changes = e["changes"] as
      | Array<{ price: string; size: string; side: string }>
      | undefined;

    for (const c of changes ?? []) {
      const price = parseFloat(c.price);
      const size = parseFloat(c.size);
      const map = c.side === "BUY" ? this.bids : this.asks;

      if (size <= 0) {
        map.delete(price);
      } else {
        map.set(price, size);
      }
    }
  }

  // ── Build order book ─────────────────────────────────────────────

  private buildBook(): VenueOrderBook {
    const bids: PriceLevel[] = [];
    for (const [price, size] of this.bids) {
      bids.push({ price, size });
    }
    bids.sort((a, b) => b.price - a.price);

    const asks: PriceLevel[] = [];
    for (const [price, size] of this.asks) {
      asks.push({ price, size });
    }
    asks.sort((a, b) => a.price - b.price);

    return {
      venue: "polymarket",
      bids,
      asks,
      timestamp: Date.now(),
    };
  }
}
