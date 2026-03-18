import type { ExploreMarket, MarketInfo, VenueId } from "@repo/shared-types";
import { Aggregator } from "../aggregator/order-book.ts";
import { HealthMonitor } from "../health/monitor.ts";
import type { VenueWorkerHandle } from "../workers/venue-worker-handle.ts";
import { config } from "../config.ts";

export interface MarketSession {
  marketId: string;
  marketInfo: MarketInfo;
  aggregator: Aggregator;
  healthMonitor: HealthMonitor;
  activeVenues: Set<VenueId>;
  subscribers: Set<string>;
}

const SESSION_TTL_MS = 60_000;

/**
 * Manages per-market sessions. Routes live data through worker handles
 * instead of creating venue instances on the main thread.
 */
export class MarketSessionManager {
  private sessions = new Map<string, MarketSession>();
  private destroyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private polyHandle: VenueWorkerHandle;
  private kalshiHandle: VenueWorkerHandle;
  private onBookUpdate: (
    session: MarketSession,
    bookStr: string,
    healthStr: string
  ) => void;
  private onHealthChange: (session: MarketSession, healthStr: string) => void;

  constructor(
    polyHandle: VenueWorkerHandle,
    kalshiHandle: VenueWorkerHandle,
    onBookUpdate: (
      session: MarketSession,
      bookStr: string,
      healthStr: string
    ) => void,
    onHealthChange: (session: MarketSession, healthStr: string) => void
  ) {
    this.polyHandle = polyHandle;
    this.kalshiHandle = kalshiHandle;
    this.onBookUpdate = onBookUpdate;
    this.onHealthChange = onHealthChange;
  }

  getOrCreate(marketId: string, market: ExploreMarket): MarketSession {
    const existing = this.sessions.get(marketId);
    if (existing) {
      const timer = this.destroyTimers.get(marketId);
      if (timer) {
        clearTimeout(timer);
        this.destroyTimers.delete(marketId);
      }
      return existing;
    }

    return this.createSession(marketId, market);
  }

  get(marketId: string): MarketSession | undefined {
    return this.sessions.get(marketId);
  }

  removeSubscriber(marketId: string, clientId: string): void {
    const session = this.sessions.get(marketId);
    if (!session) return;
    session.subscribers.delete(clientId);

    if (session.subscribers.size === 0) {
      const timer = setTimeout(() => {
        this.destroySession(marketId);
      }, SESSION_TTL_MS);
      this.destroyTimers.set(marketId, timer);
    }
  }

  destroyAll(): void {
    for (const timer of this.destroyTimers.values()) {
      clearTimeout(timer);
    }
    this.destroyTimers.clear();

    for (const [marketId, session] of this.sessions) {
      this.cleanupSession(marketId, session);
    }
    this.sessions.clear();
  }

  private createSession(
    marketId: string,
    market: ExploreMarket
  ): MarketSession {
    const polyVenueData = market.venues.find((v) => v.venue === "polymarket");
    const kalshiVenueData = market.venues.find((v) => v.venue === "kalshi");

    const polyTokenId = polyVenueData?.tokenIds?.[0];
    const kalshiTicker = kalshiVenueData?.ticker;

    const aggregator = new Aggregator(config.wsThrottleMs);
    const healthMonitor = new HealthMonitor();
    const activeVenues = new Set<VenueId>();

    const marketInfo: MarketInfo = {
      id: marketId,
      question: market.question,
      outcomes: market.outcomes,
    };

    const session: MarketSession = {
      marketId,
      marketInfo,
      aggregator,
      healthMonitor,
      activeVenues,
      subscribers: new Set(),
    };

    const connectingHealth = {
      state: "connecting" as const,
      lastUpdate: 0,
      latency: 0,
      reconnectAttempts: 0,
    };

    if (polyTokenId) {
      activeVenues.add("polymarket");
      healthMonitor.update("polymarket", connectingHealth);
      this.polyHandle.onBookUpdate(marketId, (book) =>
        aggregator.handleVenueUpdate(book)
      );
      this.polyHandle.onHealthUpdate(marketId, (health) => {
        healthMonitor.update("polymarket", health);
        this.broadcastHealth(session);
      });
      this.polyHandle.connect(marketId, { tokenId: polyTokenId });
    }

    if (kalshiTicker) {
      activeVenues.add("kalshi");
      healthMonitor.update("kalshi", connectingHealth);
      this.kalshiHandle.onBookUpdate(marketId, (book) =>
        aggregator.handleVenueUpdate(book)
      );
      this.kalshiHandle.onHealthUpdate(marketId, (health) => {
        healthMonitor.update("kalshi", health);
        this.broadcastHealth(session);
      });
      this.kalshiHandle.connect(marketId, { ticker: kalshiTicker });
    }

    // Pre-serialize on every throttled aggregator tick
    aggregator.onUpdate(() => {
      const healthMap = healthMonitor.getHealthMap();
      const healthData: Record<
        string,
        { connected: boolean; lastUpdate: number; latency: number }
      > = {};
      for (const [id, h] of Object.entries(healthMap)) {
        healthData[id] = {
          connected: h.state === "connected",
          lastUpdate: h.lastUpdate,
          latency: h.latency,
        };
      }

      const bookStr = JSON.stringify({
        type: "book_update",
        data: {
          aggregated: aggregator.getAggregated(),
          venues: Object.fromEntries(aggregator.getVenueBooks()),
        },
      });

      const healthStr = JSON.stringify({
        type: "health",
        data: { venues: healthData },
      });

      this.onBookUpdate(session, bookStr, healthStr);
    });

    this.sessions.set(marketId, session);
    return session;
  }

  private broadcastHealth(session: MarketSession): void {
    const healthMap = session.healthMonitor.getHealthMap();
    const healthData: Record<
      string,
      { connected: boolean; lastUpdate: number; latency: number }
    > = {};
    for (const [id, h] of Object.entries(healthMap)) {
      healthData[id] = {
        connected: h.state === "connected",
        lastUpdate: h.lastUpdate,
        latency: h.latency,
      };
    }
    const healthStr = JSON.stringify({
      type: "health",
      data: { venues: healthData },
    });
    this.onHealthChange(session, healthStr);
  }

  private destroySession(marketId: string): void {
    const session = this.sessions.get(marketId);
    if (!session) return;
    this.cleanupSession(marketId, session);
    this.sessions.delete(marketId);
    this.destroyTimers.delete(marketId);
  }

  private cleanupSession(marketId: string, session: MarketSession): void {
    if (session.activeVenues.has("polymarket")) {
      this.polyHandle.disconnect(marketId);
      this.polyHandle.removeSession(marketId);
    }
    if (session.activeVenues.has("kalshi")) {
      this.kalshiHandle.disconnect(marketId);
      this.kalshiHandle.removeSession(marketId);
    }
    session.aggregator.destroy();
  }
}
