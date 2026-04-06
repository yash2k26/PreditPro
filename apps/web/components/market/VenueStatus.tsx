"use client";

import { memo } from "react";
import type { VenueHealthInfo } from "@repo/shared-types";

interface VenueStatusProps {
  health: Record<string, VenueHealthInfo>;
  wsStatus: string;
}

export const VenueStatus = memo(function VenueStatus({ health, wsStatus }: VenueStatusProps) {
  const venues = [
    { id: "polymarket", label: "Polymarket", color: "bg-polymarket", note: null },
    { id: "kalshi", label: "Kalshi", color: "bg-kalshi", note: "Top-of-book only" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${
            wsStatus === "connected"
              ? "bg-emerald-400"
              : wsStatus === "connecting"
                ? "bg-yellow-400 animate-pulse"
                : "bg-red-400"
          }`}
        />
        <span className="text-text-secondary">
          {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Connecting..." : "Disconnected"}
        </span>
      </div>

      {venues.map(({ id, label, color, note }) => {
        const h = health[id];
        const connected = h?.connected ?? false;
        const lastUpdate = h?.lastUpdate ?? 0;
        const connecting = !connected && (h === undefined || lastUpdate === 0);
        const stale = connected && lastUpdate > 0 && Date.now() - lastUpdate > 15000;

        const tooltip = connected
          ? `Last update: ${lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "N/A"}${note ? ` · ${note}` : ""}`
          : connecting
            ? "Connecting..."
            : "Disconnected";

        return (
          <div key={id} className="flex items-center gap-1.5" title={tooltip}>
            <div
              className={`w-2 h-2 rounded-full ${
                connecting
                  ? "bg-yellow-400 animate-pulse"
                  : !connected
                    ? "bg-red-400"
                    : stale
                      ? "bg-yellow-400"
                      : color
              }`}
            />
            <span className="text-text-secondary">{label}</span>
            {note && connected && (
              <span className="text-text-muted text-[10px]">({note})</span>
            )}
          </div>
        );
      })}
    </div>
  );
});
