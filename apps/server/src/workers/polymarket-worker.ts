import { parentPort } from "node:worker_threads";
import { fetchPolymarketMarkets } from "../markets/polymarket.ts";
import { PolymarketLiveVenue } from "../venues/live/polymarket-live.ts";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./venue-worker-protocol.ts";

if (!parentPort) throw new Error("polymarket-worker must run as a Worker thread");

const port = parentPort;
const sessions = new Map<string, PolymarketLiveVenue>();

function send(msg: WorkerToMainMessage): void {
  port.postMessage(msg);
}

port.on("message", async (msg: MainToWorkerMessage) => {
  switch (msg.type) {
    case "discover": {
      try {
        const markets = await fetchPolymarketMarkets();
        send({ type: "discover_result", markets });
      } catch (err) {
        send({ type: "discover_error", message: (err as Error).message });
      }
      break;
    }

    case "connect": {
      const { sessionId, params } = msg;
      // Disconnect existing session if any
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.disconnect();
      }

      if (!params.tokenId) {
        console.warn(`[polymarket-worker] connect without tokenId for ${sessionId}`);
        break;
      }

      const venue = new PolymarketLiveVenue(params.tokenId);

      venue.on("book_update", (book) => {
        send({ type: "book_update", sessionId, book });
      });

      venue.on("state_change", (health) => {
        send({ type: "health_update", sessionId, health });
      });

      sessions.set(sessionId, venue);
      venue.connect().catch((err) => {
        console.warn(
          `[polymarket-worker] Connect failed for ${sessionId}:`,
          (err as Error)?.message ?? err
        );
      });
      break;
    }

    case "disconnect": {
      const venue = sessions.get(msg.sessionId);
      if (venue) {
        venue.disconnect();
        sessions.delete(msg.sessionId);
      }
      break;
    }

    case "shutdown": {
      for (const [, venue] of sessions) {
        venue.disconnect();
      }
      sessions.clear();
      process.exit(0);
    }
  }
});

console.log("[polymarket-worker] Ready");
