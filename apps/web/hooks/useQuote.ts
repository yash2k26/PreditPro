"use client";

import { useCallback } from "react";
import type { ClientMessage } from "@repo/shared-types";

let quoteCounter = 0;

export function useQuote(send: (msg: ClientMessage) => void) {
  const requestQuote = useCallback(
    (amount: number, side: "yes" | "no") => {
      if (amount <= 0) return;
      const requestId = `q-${++quoteCounter}`;
      send({
        type: "quote_request",
        data: { requestId, amount, side },
      });
    },
    [send]
  );

  return { requestQuote };
}
