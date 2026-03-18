import type { WebSocket } from "ws";
import type { ServerMessage } from "@repo/shared-types";
import type { MarketSession } from "./session-manager.ts";

interface ClientState {
  ws: WebSocket;
  clientId: string;
  lastPong: number;
  session: MarketSession | null;
}

export class ClientManager {
  private clients = new Map<WebSocket, ClientState>();
  private wsByClientId = new Map<string, WebSocket>();

  add(ws: WebSocket, clientId: string): void {
    this.clients.set(ws, {
      ws,
      clientId,
      lastPong: Date.now(),
      session: null,
    });
    this.wsByClientId.set(clientId, ws);
  }

  remove(ws: WebSocket): void {
    const state = this.clients.get(ws);
    if (state) this.wsByClientId.delete(state.clientId);
    this.clients.delete(ws);
  }

  getState(ws: WebSocket): ClientState | undefined {
    return this.clients.get(ws);
  }

  getSession(ws: WebSocket): MarketSession | null {
    return this.clients.get(ws)?.session ?? null;
  }

  setSession(ws: WebSocket, session: MarketSession): void {
    const client = this.clients.get(ws);
    if (client) client.session = session;
  }

  markPong(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) client.lastPong = Date.now();
  }

  send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  sendRaw(ws: WebSocket, raw: string): void {
    if (ws.readyState === ws.OPEN) ws.send(raw);
  }

  getWsByClientId(clientId: string): WebSocket | undefined {
    return this.wsByClientId.get(clientId);
  }

  pingAll(timeoutMs: number): void {
    const now = Date.now();
    const dead: WebSocket[] = [];
    for (const [ws, client] of this.clients) {
      if (now - client.lastPong > timeoutMs) {
        dead.push(ws);
      } else {
        this.send(ws, { type: "ping" });
      }
    }
    // Close dead sockets — don't remove from maps here;
    // the ws "close" event handler will call remove() and
    // clean up the session subscriber properly.
    for (const ws of dead) {
      ws.close(1000, "Pong timeout");
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
