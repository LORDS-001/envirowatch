/** Runtime configuration. Everything that differs between mock and real backends lives here. */

function defaultWsUrl(): string {
  if (typeof location === "undefined") return "ws://localhost/ws";
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  wsUrl: import.meta.env.VITE_WS_URL || defaultWsUrl(),
  useMocks: (import.meta.env.VITE_USE_MOCKS ?? "true") !== "false",
  simSeed: Number(import.meta.env.VITE_SIM_SEED ?? 4242),
  displayTz: import.meta.env.VITE_DISPLAY_TZ ?? "Africa/Lagos",
  /** Devices report every 10 s (PRD NFR-001). */
  cadenceMs: 10_000,
  /** A reading is stale when older than this multiple of the cadence. */
  staleFactor: 3,
  /** NFR-004: the dashboard is behind when the newest event is older than this. */
  freshnessBudgetMs: 5_000,
  /** WebSocket events are applied to the cache at most this often. */
  liveFlushMs: 1_000,
} as const;

export const staleAfterMs = config.cadenceMs * config.staleFactor;
