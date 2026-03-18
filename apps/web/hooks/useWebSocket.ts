"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerMessage, ClientMessage } from "@repo/shared-types";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

const WS_URL = process.env["NEXT_PUBLIC_WS_URL"] ?? "ws://localhost:3001";
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const RETRY_DELAY_MS = 2000;

function clearTimerRef(ref: { current: ReturnType<typeof setTimeout> | null }) {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

export function useWebSocket(
  marketId: string | null,
  onMessage: (msg: ServerMessage) => void
) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  const marketIdRef = useRef(marketId);
  onMessageRef.current = onMessage;
  marketIdRef.current = marketId;

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    clearTimerRef(reconnectTimerRef);
    clearTimerRef(retryTimerRef);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!marketIdRef.current) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setStatus("connected");
      reconnectAttemptRef.current = 0;
      // Subscribe to the specific market
      ws.send(
        JSON.stringify({ type: "subscribe", market: marketIdRef.current })
      );
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        // If market not found (cache still loading), retry subscription after a delay
        if (msg.type === "error" && msg.data.code === "MARKET_NOT_FOUND") {
          clearTimerRef(retryTimerRef);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            if (wsRef.current === ws && ws.readyState === WebSocket.OPEN && marketIdRef.current) {
              ws.send(JSON.stringify({ type: "subscribe", market: marketIdRef.current }));
            }
          }, RETRY_DELAY_MS);
          return;
        }
        onMessageRef.current(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setStatus("disconnected");
      wsRef.current = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return;
    const attempt = reconnectAttemptRef.current;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, attempt) + Math.random() * 1000,
      RECONNECT_MAX_MS
    );
    reconnectAttemptRef.current = attempt + 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  // Connect when marketId changes
  useEffect(() => {
    if (!marketId) return;
    connect();
    return () => {
      clearTimerRef(reconnectTimerRef);
      clearTimerRef(retryTimerRef);
      if (wsRef.current) {
        const closing = wsRef.current;
        wsRef.current = null; // null before close so onclose guard bails out
        closing.close();
      }
    };
  }, [marketId, connect]);

  return { status, send };
}
