import express from "express";
import cors from "cors";
import { createServer } from "http";
import { config } from "./config.ts";
import { WsServer } from "./ws/server.ts";
import { MarketCache } from "./markets/cache.ts";
import { VenueWorkerHandle } from "./workers/venue-worker-handle.ts";

async function main(): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // ─── Worker handles ───
  const isTs = import.meta.url.endsWith(".ts");
  const polyWorkerUrl = new URL(
    isTs ? "./workers/polymarket-worker.ts" : "./workers/polymarket-worker.js",
    import.meta.url
  );
  const kalshiWorkerUrl = new URL(
    isTs ? "./workers/kalshi-worker.ts" : "./workers/kalshi-worker.js",
    import.meta.url
  );

  const polyHandle = new VenueWorkerHandle("polymarket", polyWorkerUrl);
  const kalshiHandle = new VenueWorkerHandle("kalshi", kalshiWorkerUrl);

  // ─── Market discovery API ───
  const marketCache = new MarketCache(polyHandle, kalshiHandle);

  app.get("/api/markets", (req, res) => {
    const q = typeof req.query["q"] === "string" ? req.query["q"] : undefined;
    const venue =
      typeof req.query["venue"] === "string" ? req.query["venue"] : undefined;
    const sort =
      typeof req.query["sort"] === "string" ? req.query["sort"] : undefined;
    const limit = parseInt(String(req.query["limit"] ?? "50"), 10);
    const offset = parseInt(String(req.query["offset"] ?? "0"), 10);

    res.json(marketCache.getResponse({ q, venue, sort, limit, offset }));
  });

  app.get("/api/markets/:id", (req, res) => {
    const market = marketCache.getById(req.params["id"]!);
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json(market);
  });

  const httpServer = createServer(app);

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[server] Port ${config.port} is already in use.`);
      process.exit(1);
    }
    throw err;
  });

  // ─── WebSocket server ───
  const wsServer = new WsServer(httpServer, marketCache, polyHandle, kalshiHandle);

  httpServer.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port}`);
    console.log(`[server] WebSocket: ws://localhost:${config.port}`);
  });

  // Load market cache in background
  marketCache.start().catch((err) =>
    console.error("[market-cache] Failed to start:", err)
  );

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n[server] Shutting down...");

    // 1. Close WS connections, send disconnect to workers for all sessions
    wsServer.destroy();

    // 2. Stop market cache refresh timer
    marketCache.stop();

    // 3. Shut down workers (graceful with 5s timeout → force terminate)
    await Promise.all([polyHandle.shutdown(), kalshiHandle.shutdown()]);

    // 4. Close HTTP server
    httpServer.close();

    console.log("[server] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
