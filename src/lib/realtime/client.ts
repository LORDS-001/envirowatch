/**
 * One shared WebSocket for live events. Messages are Zod-validated, buffered and flushed into
 * the TanStack Query cache at most once per `config.liveFlushMs`.
 */
import type { QueryClient } from "@tanstack/react-query";
import { WsEventSchema } from "@/lib/api/schemas";
import type { WsEvent } from "@/lib/api/types";
import { config } from "@/lib/config";
import { useConnection } from "./connection";
import { applyEvents, emptySnapshot, SeenIds, type LiveSnapshot } from "./reducer";

export const LIVE_KEY = ["live"] as const;

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
/** After this many failed attempts the indicator says Offline (it keeps retrying). */
const OFFLINE_AFTER_ATTEMPTS = 4;
/** No message (the server heartbeats every 5 s) for this long means the socket is dead. */
const SILENCE_TIMEOUT_MS = 15_000;
/** Queries refetched after a reconnect, to cover anything missed while away. */
const REFETCH_ON_RECONNECT = [["heatmap"], ["devices"], ["alerts"], ["system-health"]] as const;

/** Exponential backoff with ±30 % jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const raw = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(raw * (0.7 + random() * 0.6));
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private buffer: WsEvent[] = [];
  private seen = new SeenIds();
  private attempt = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  private stopped = true;
  private hasConnectedBefore = false;

  constructor(
    private readonly queryClient: QueryClient,
    private readonly url: string = config.wsUrl,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.queryClient.setQueryData<LiveSnapshot>(LIVE_KEY, (prev) => prev ?? emptySnapshot());
    this.flushTimer = setInterval(() => this.flush(), config.liveFlushMs);
    window.addEventListener("online", this.onOnline);
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.flushTimer = this.retryTimer = null;
    window.removeEventListener("online", this.onOnline);
    this.socket?.close(1000, "client stopped");
    this.socket = null;
    this.buffer = [];
    useConnection.getState().set({ status: "idle", lagMs: null });
  }

  private onOnline = () => {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.attempt = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.open();
  };

  private open() {
    if (this.stopped) return;
    const conn = useConnection.getState();
    conn.set({ status: this.hasConnectedBefore || this.attempt > 0 ? "reconnecting" : "connecting" });
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      const reconnected = this.hasConnectedBefore;
      this.hasConnectedBefore = true;
      this.attempt = 0;
      this.lastMessageAt = Date.now();
      useConnection.getState().set({ status: "connected" });
      if (reconnected) {
        for (const key of REFETCH_ON_RECONNECT) void this.queryClient.invalidateQueries({ queryKey: key });
      }
    });
    socket.addEventListener("message", (e) => this.onMessage(e.data));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.scheduleRetry();
    });
    socket.addEventListener("error", () => socket.close());
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const status = this.attempt >= OFFLINE_AFTER_ATTEMPTS || !navigator.onLine ? "offline" : "reconnecting";
    useConnection.getState().set({ status });
    this.retryTimer = setTimeout(() => this.open(), backoffDelay(this.attempt++));
  }

  private onMessage(raw: unknown) {
    this.lastMessageAt = Date.now();
    if (typeof raw !== "string") return;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = WsEventSchema.safeParse(json);
    if (!parsed.success) {
      console.warn("[realtime] dropped a message that didn't match the event schema", parsed.error.issues);
      return;
    }
    if (parsed.data.type === "heartbeat") return;
    this.buffer.push(parsed.data);
  }

  private flush() {
    const now = Date.now();
    if (this.socket?.readyState === WebSocket.OPEN && now - this.lastMessageAt > SILENCE_TIMEOUT_MS) {
      this.socket.close(4000, "heartbeat timeout");
    }

    const events = this.buffer;
    this.buffer = [];
    const prev = this.queryClient.getQueryData<LiveSnapshot>(LIVE_KEY) ?? emptySnapshot();
    if (events.length > 0) {
      const next = applyEvents(prev, events, this.seen, now);
      this.queryClient.setQueryData(LIVE_KEY, next);
      if (events.some((e) => e.type === "alert.created" || e.type === "alert.resolved")) {
        void this.queryClient.invalidateQueries({ queryKey: ["alerts"] });
      }
      if (events.some((e) => e.type === "device.status_changed")) {
        void this.queryClient.invalidateQueries({ queryKey: ["devices"] });
      }
    }
    const newest = (this.queryClient.getQueryData<LiveSnapshot>(LIVE_KEY) ?? prev).newestEventMs;
    useConnection.getState().set({ lagMs: newest ? Math.max(0, now - newest) : null });
  }
}
