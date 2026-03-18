import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { ClientManager } from "./client-manager.ts";
import { parseClientMessage } from "./protocol.ts";
import { MarketSessionManager, type MarketSession } from "./session-manager.ts";
import type { MarketCache } from "../markets/cache.ts";
import type { VenueWorkerHandle } from "../workers/venue-worker-handle.ts";
import { computeQuote } from "../quote/engine.ts";
import { config } from "../config.ts";

let clientIdCounter = 0;

export class WsServer {
  private wss: WebSocketServer;
  private clients = new ClientManager();
  private sessions: MarketSessionManager;
  private marketCache: MarketCache;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    httpServer: HttpServer,
    marketCache: MarketCache,
    polyHandle: VenueWorkerHandle,
    kalshiHandle: VenueWorkerHandle
  ) {
    this.marketCache = marketCache;

    this.sessions = new MarketSessionManager(
      polyHandle,
      kalshiHandle,
      (session, bookStr, healthStr) => {
        this.broadcastSession(session, bookStr, healthStr);
      },
      (session, healthStr) => {
        this.broadcastHealthOnly(session, healthStr);
      }
    );

    this.wss = new WebSocketServer({ server: httpServer });
    this.wss.on("connection", (ws) => this.handleConnection(ws));

    this.pingInterval = setInterval(() => {
      this.clients.pingAll(config.pingTimeoutMs);
    }, config.pingIntervalMs);
  }

  private handleConnection(ws: WebSocket): void {
    const clientId = `c-${++clientIdCounter}`;
    this.clients.add(ws, clientId);

    ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString();
      const msg = parseClientMessage(raw);
      if (!msg) return;

      switch (msg.type) {
        case "subscribe":
          this.handleSubscribe(ws, clientId, msg.market);
          break;

        case "quote_request": {
          const session = this.clients.getSession(ws);
          if (!session) {
            this.clients.send(ws, {
              type: "error",
              data: { code: "NO_SESSION", message: "Subscribe to a market first" },
            });
            break;
          }
          const result = computeQuote(
            session.aggregator.getAggregated(),
            msg.data
          );
          this.clients.send(ws, { type: "quote_result", data: result });
          break;
        }

        case "pong":
          this.clients.markPong(ws);
          break;
      }
    });

    ws.on("close", () => {
      const state = this.clients.getState(ws);
      if (state?.session) {
        this.sessions.removeSubscriber(state.session.marketId, clientId);
      }
      this.clients.remove(ws);
    });

    ws.on("error", () => {
      const state = this.clients.getState(ws);
      if (state?.session) {
        this.sessions.removeSubscriber(state.session.marketId, clientId);
      }
      this.clients.remove(ws);
    });
  }

  private handleSubscribe(ws: WebSocket, clientId: string, marketId: string): void {
    const prevState = this.clients.getState(ws);
    if (prevState?.session) {
      this.sessions.removeSubscriber(prevState.session.marketId, clientId);
    }

    const market = this.marketCache.getById(marketId);

    if (!market) {
      this.clients.send(ws, {
        type: "error",
        data: { code: "MARKET_NOT_FOUND", message: `Market ${marketId} not found` },
      });
      return;
    }

    const session = this.sessions.getOrCreate(marketId, market);
    session.subscribers.add(clientId);
    this.clients.setSession(ws, session);

    // Synchronous snapshot
    const aggregated = session.aggregator.getAggregated();
    const venues = Object.fromEntries(session.aggregator.getVenueBooks());

    this.clients.send(ws, {
      type: "book_snapshot",
      data: { market: session.marketInfo, aggregated, venues },
    });

    // Send current health
    const healthMap = session.healthMonitor.getHealthMap();
    const healthData: Record<string, { connected: boolean; lastUpdate: number; latency: number }> = {};
    for (const [id, h] of Object.entries(healthMap)) {
      healthData[id] = {
        connected: h.state === "connected",
        lastUpdate: h.lastUpdate,
        latency: h.latency,
      };
    }
    this.clients.send(ws, {
      type: "health",
      data: { venues: healthData },
    });
  }

  private broadcastSession(session: MarketSession, bookStr: string, healthStr: string): void {
    for (const subId of session.subscribers) {
      const subWs = this.clients.getWsByClientId(subId);
      if (subWs) {
        this.clients.sendRaw(subWs, bookStr);
        this.clients.sendRaw(subWs, healthStr);
      }
    }
  }

  private broadcastHealthOnly(session: MarketSession, healthStr: string): void {
    for (const subId of session.subscribers) {
      const subWs = this.clients.getWsByClientId(subId);
      if (subWs) {
        this.clients.sendRaw(subWs, healthStr);
      }
    }
  }

  destroy(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.sessions.destroyAll();
    this.wss.close();
  }
}
