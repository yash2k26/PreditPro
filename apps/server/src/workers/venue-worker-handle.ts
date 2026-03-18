import { Worker } from "node:worker_threads";
import type { ExploreMarket, VenueOrderBook } from "@repo/shared-types";
import type { VenueHealth } from "../venues/types.ts";
import type {
  ConnectParams,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "./venue-worker-protocol.ts";

type BookCallback = (book: VenueOrderBook) => void;
type HealthCallback = (health: VenueHealth) => void;

const MAX_RESPAWN_ATTEMPTS = 5;
const RESPAWN_RESET_MS = 30_000;

export class VenueWorkerHandle {
  private readonly name: string;
  private readonly workerUrl: URL;
  private worker: Worker | null = null;

  private bookListeners = new Map<string, BookCallback>();
  private healthListeners = new Map<string, HealthCallback>();
  private sessionParams = new Map<string, ConnectParams>();

  private discoverResolve: ((markets: ExploreMarket[]) => void) | null = null;
  private discoverReject: ((err: Error) => void) | null = null;

  private shutdownResolve: (() => void) | null = null;
  private shuttingDown = false;

  private respawnCount = 0;
  private lastRespawnTime = 0;

  constructor(name: string, workerUrl: URL) {
    this.name = name;
    this.workerUrl = workerUrl;
    this.worker = this.spawn();
  }

  // ── Public API ──────────────────────────────────────────────────

  discover(): Promise<ExploreMarket[]> {
    // If a discover is already in-flight, reject the previous one
    if (this.discoverReject) {
      this.discoverReject(new Error(`[${this.name}] discover superseded by new call`));
      this.discoverResolve = null;
      this.discoverReject = null;
    }

    return new Promise<ExploreMarket[]>((resolve, reject) => {
      this.discoverResolve = resolve;
      this.discoverReject = reject;
      this.send({ type: "discover" });
    });
  }

  connect(sessionId: string, params: ConnectParams): void {
    this.sessionParams.set(sessionId, params);
    this.send({ type: "connect", sessionId, params });
  }

  disconnect(sessionId: string): void {
    this.sessionParams.delete(sessionId);
    this.send({ type: "disconnect", sessionId });
  }

  onBookUpdate(sessionId: string, cb: BookCallback): void {
    this.bookListeners.set(sessionId, cb);
  }

  onHealthUpdate(sessionId: string, cb: HealthCallback): void {
    this.healthListeners.set(sessionId, cb);
  }

  removeSession(sessionId: string): void {
    this.bookListeners.delete(sessionId);
    this.healthListeners.delete(sessionId);
    this.sessionParams.delete(sessionId);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    if (!this.worker) return;

    const p = new Promise<void>((resolve) => {
      this.shutdownResolve = resolve;
    });

    this.send({ type: "shutdown" });

    const timeout = setTimeout(() => {
      console.warn(`[${this.name}] Shutdown timeout, force terminating`);
      this.worker?.terminate();
      this.worker = null;
      if (this.shutdownResolve) {
        this.shutdownResolve();
        this.shutdownResolve = null;
      }
    }, 5_000);

    await p;
    clearTimeout(timeout);
  }

  // ── Internal ────────────────────────────────────────────────────

  private spawn(): Worker {
    const isTs = import.meta.url.endsWith(".ts");
    const worker = new Worker(this.workerUrl, {
      ...(isTs ? { execArgv: ["--import", import.meta.resolve("tsx")] } : {}),
    });

    worker.on("message", (msg: WorkerToMainMessage) =>
      this.handleMessage(msg)
    );

    worker.on("error", (err) => {
      console.error(`[${this.name}] Worker error:`, err.message);
    });

    worker.on("exit", (code) => {
      if (this.shutdownResolve) {
        this.shutdownResolve();
        this.shutdownResolve = null;
        this.worker = null;
        return;
      }

      if (this.shuttingDown) {
        this.worker = null;
        return;
      }

      // Reject any pending discover so callers don't hang forever
      if (this.discoverReject) {
        this.discoverReject(
          new Error(`[${this.name}] Worker crashed during discover (code ${code})`)
        );
        this.discoverResolve = null;
        this.discoverReject = null;
      }

      // Respawn with backoff protection
      const now = Date.now();
      if (now - this.lastRespawnTime > RESPAWN_RESET_MS) {
        this.respawnCount = 0;
      }
      this.respawnCount++;
      this.lastRespawnTime = now;

      if (this.respawnCount > MAX_RESPAWN_ATTEMPTS) {
        console.error(
          `[${this.name}] Worker crashed ${this.respawnCount} times in ${RESPAWN_RESET_MS / 1000}s, giving up`
        );
        this.worker = null;
        return;
      }

      console.error(
        `[${this.name}] Worker exited unexpectedly (code ${code}), respawning (${this.respawnCount}/${MAX_RESPAWN_ATTEMPTS})...`
      );
      this.worker = this.spawn();
      this.replayConnects();
    });

    console.log(`[${this.name}] Worker started`);
    return worker;
  }

  private replayConnects(): void {
    for (const [sessionId, params] of this.sessionParams) {
      console.log(`[${this.name}] Replaying connect for session ${sessionId}`);
      this.send({ type: "connect", sessionId, params });
    }
  }

  private handleMessage(msg: WorkerToMainMessage): void {
    switch (msg.type) {
      case "discover_result":
        this.discoverResolve?.(msg.markets);
        this.discoverResolve = null;
        this.discoverReject = null;
        break;

      case "discover_error":
        this.discoverReject?.(new Error(msg.message));
        this.discoverResolve = null;
        this.discoverReject = null;
        break;

      case "book_update": {
        const bookCb = this.bookListeners.get(msg.sessionId);
        bookCb?.(msg.book);
        break;
      }

      case "health_update": {
        const healthCb = this.healthListeners.get(msg.sessionId);
        healthCb?.(msg.health);
        break;
      }
    }
  }

  private send(msg: MainToWorkerMessage): void {
    this.worker?.postMessage(msg);
  }
}
