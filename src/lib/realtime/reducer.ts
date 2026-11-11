/**
 * Pure reducer for live events. Applied once per flush (≈1 s), never per message.
 *
 * - De-duplicates by reading_id (a reading is one logical event, however many copies arrive).
 * - Orders by event_time, never arrival: a late reading never overwrites a newer one.
 * - Keeps quarantined readings out of "latest" (a wrong clock would pin them there).
 */
import type { Measurement, WsEvent } from "@/lib/api/types";

export type LatestKey = `${string}|${string}`;
export const latestKey = (deviceId: string, metric: string): LatestKey => `${deviceId}|${metric}`;

export interface FaultNotice {
  device_id: string;
  fault_type: string;
  severity: "warn" | "critical";
  detected_at: string;
}

export interface LiveSnapshot {
  /** Bumped on every flush that changed something. */
  version: number;
  latest: Record<LatestKey, Measurement>;
  /** Newest received_at per device, ms. */
  deviceLastSeen: Record<string, number>;
  /** Unique readings applied since connect. */
  readings: number;
  duplicates: number;
  /** Arrived after a newer reading for the same device and metric. */
  outOfOrder: number;
  quarantined: number;
  /** Unique readings per second, over the last 10 s. */
  ratePerSec: number;
  /** Newest event_time seen (ms), excluding quarantined. Drives freshness (NFR-004). */
  newestEventMs: number;
  faults: FaultNotice[];
  /** Per-second counts for the rate window: [epochSecond, count]. */
  rateWindow: Array<[number, number]>;
  /** When this snapshot was produced (ms). Derived values use it as "now". */
  flushedAt: number;
}

export const emptySnapshot = (): LiveSnapshot => ({
  version: 0,
  latest: {},
  deviceLastSeen: {},
  readings: 0,
  duplicates: 0,
  outOfOrder: 0,
  quarantined: 0,
  ratePerSec: 0,
  newestEventMs: 0,
  faults: [],
  rateWindow: [],
  flushedAt: 0,
});

/** Bounded set of seen reading_ids (insertion-ordered eviction). Mutable by design: it is not published. */
export class SeenIds {
  private readonly ids = new Set<string>();
  constructor(private readonly capacity = 60_000) {}
  /** True if new (and records it); false if already seen. */
  add(id: string): boolean {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > this.capacity) {
      const oldest = this.ids.values().next().value;
      if (oldest !== undefined) this.ids.delete(oldest);
    }
    return true;
  }
  get size() {
    return this.ids.size;
  }
}

const RATE_WINDOW_S = 10;
const MAX_FAULTS = 50;

export function applyEvents(prev: LiveSnapshot, events: readonly WsEvent[], seen: SeenIds, now: number): LiveSnapshot {
  const latest = { ...prev.latest };
  const deviceLastSeen = { ...prev.deviceLastSeen };
  let { readings, duplicates, outOfOrder, quarantined, newestEventMs } = prev;
  let faults = prev.faults;
  let fresh = 0;

  for (const ev of events) {
    if (ev.type === "sensor.fault_detected") {
      faults = [ev.data, ...faults].slice(0, MAX_FAULTS);
      continue;
    }
    if (ev.type !== "measurement.updated" || ev.data.length === 0) continue;
    // One message is one logical reading; its rows share a reading_id.
    const first = ev.data[0]!;
    if (!seen.add(first.reading_id)) {
      duplicates++;
      continue;
    }
    readings++;
    fresh++;
    const received = Date.parse(first.received_at);
    if (received > (deviceLastSeen[first.device_id] ?? 0)) deviceLastSeen[first.device_id] = received;

    for (const row of ev.data) {
      if (row.quality_status === "quarantined") {
        quarantined++;
        continue;
      }
      const eventMs = Date.parse(row.event_time);
      if (eventMs > newestEventMs) newestEventMs = eventMs;
      const key = latestKey(row.device_id, row.metric);
      const existing = latest[key];
      if (existing && Date.parse(existing.event_time) >= eventMs) {
        outOfOrder++;
        continue;
      }
      latest[key] = row;
    }
  }

  const second = Math.floor(now / 1000);
  const rateWindow = prev.rateWindow.filter(([s]) => s > second - RATE_WINDOW_S);
  const last = rateWindow[rateWindow.length - 1];
  if (last && last[0] === second) rateWindow[rateWindow.length - 1] = [second, last[1] + fresh];
  else rateWindow.push([second, fresh]);
  const span = Math.min(RATE_WINDOW_S, Math.max(1, second - (rateWindow[0]?.[0] ?? second) + 1));
  const ratePerSec = rateWindow.reduce((sum, [, c]) => sum + c, 0) / span;

  return {
    version: prev.version + 1,
    latest,
    deviceLastSeen,
    readings,
    duplicates,
    outOfOrder,
    quarantined,
    ratePerSec,
    newestEventMs,
    faults,
    rateWindow,
    flushedAt: now,
  };
}
