import "dotenv/config";

export const config = {
  port: parseInt(process.env["PORT"] ?? "3001", 10),
  wsThrottleMs: 100, // min interval between broadcasts
  pingIntervalMs: 15000,
  pingTimeoutMs: 10000,
} as const;
