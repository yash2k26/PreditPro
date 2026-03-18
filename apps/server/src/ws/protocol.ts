import type { ClientMessage } from "@repo/shared-types";

/**
 * Parse and validate an incoming WebSocket message from a client.
 * Returns null if the message is invalid.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw) as Record<string, unknown>;

    switch (msg["type"]) {
      case "subscribe": {
        const market = msg["market"];
        if (typeof market !== "string" || market.length === 0) return null;
        return { type: "subscribe", market };
      }

      case "quote_request": {
        const data = msg["data"] as Record<string, unknown> | undefined;
        if (!data) return null;
        const requestId = data["requestId"];
        const amount = data["amount"];
        const side = data["side"];
        if (typeof requestId !== "string") return null;
        if (typeof amount !== "number" || amount < 0) return null;
        if (side !== "yes" && side !== "no") return null;
        return {
          type: "quote_request",
          data: { requestId, amount, side },
        };
      }

      case "pong":
        return { type: "pong" };

      default:
        return null;
    }
  } catch {
    return null;
  }
}
