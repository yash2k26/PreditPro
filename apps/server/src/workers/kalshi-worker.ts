import { parentPort } from "node:worker_threads";
import { fetchKalshiMarkets } from "../markets/kalshi.ts";
import { KalshiPollingVenue } from "../venues/live/kalshi-polling.ts";
import type { MainToWorkerMessage, WorkerToMainMessage } from "./venue-worker-protocol.ts";

if (!parentPort) throw new Error("kalshi-worker must run as a Worker thread");

const port = parentPort;
const sessions = new Map<string, KalshiPollingVenue>();

function send(msg: WorkerToMainMessage): void {
  port.postMessage(msg);
}

port.on("message", async (msg: MainToWorkerMessage) => {
  switch (msg.type) {
    case "discover": {
      try {
        const markets = await fetchKalshiMarkets();
        send({ type: "discover_result", markets });
      } catch (err) {
        send({ type: "discover_error", message: (err as Error).message });
      }
      break;
    }

    case "connect": {
      const { sessionId, params } = msg;
      const existing = sessions.get(sessionId);
      if (existing) {
        existing.disconnect();
      }

      if (!params.ticker) {
        console.warn(`[kalshi-worker] connect without ticker for ${sessionId}`);
        break;
      }

      const venue = new KalshiPollingVenue(params.ticker);

      venue.on("book_update", (book) => {
        send({ type: "book_update", sessionId, book });
      });

      venue.on("state_change", (health) => {
        send({ type: "health_update", sessionId, health });
      });

      sessions.set(sessionId, venue);
      venue.connect().catch((err) => {
        console.warn(
          `[kalshi-worker] Connect failed for ${sessionId}:`,
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

console.log("[kalshi-worker] Ready");
