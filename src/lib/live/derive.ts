/**
 * Selectors that turn the live snapshot into what screens show. Every one applies the quality
 * rules, so stale, suspicious and quarantined readings never leak into an average.
 */
import type { Device, HeatmapSample } from "@/lib/api/types";
import { staleAfterMs } from "@/lib/config";
import type { MetricId } from "@/lib/metrics";
import type { LiveSnapshot } from "@/lib/realtime/reducer";

export interface SiteValue {
  siteId: string;
  value: number;
  deviceCount: number;
  newestEventMs: number;
}

/**
 * Mean of fresh, valid device readings per site for one metric. Hot path (≈3,000 rows, every
 * flush), so the quality rule is inlined: only `valid` readings within the stale window count,
 * the same set as `includeInSurface(assessQuality(m).status)`.
 */
export function siteMeans(
  snapshot: LiveSnapshot,
  deviceSite: ReadonlyMap<string, string>,
  metric: MetricId,
  now: number,
): Map<string, SiteValue> {
  const acc = new Map<string, { sum: number; n: number; newest: number }>();
  const oldest = now - staleAfterMs;
  for (const key in snapshot.latest) {
    const m = snapshot.latest[key as keyof typeof snapshot.latest]!;
    if (m.metric !== metric || m.quality_status !== "valid") continue;
    const e = Date.parse(m.event_time);
    if (e < oldest) continue;
    const siteId = deviceSite.get(m.device_id);
    if (!siteId) continue;
    const cur = acc.get(siteId);
    if (cur) {
      cur.sum += m.value;
      cur.n += 1;
      if (e > cur.newest) cur.newest = e;
    } else {
      acc.set(siteId, { sum: m.value, n: 1, newest: e });
    }
  }
  const out = new Map<string, SiteValue>();
  for (const [siteId, v] of acc) out.set(siteId, { siteId, value: v.sum / v.n, deviceCount: v.n, newestEventMs: v.newest });
  return out;
}

/**
 * IDW input: the REST heatmap, with each site replaced by its live mean once live data exists.
 * Sites whose REST sample has gone stale and have no live data drop out.
 */
export function mergeHeatSamples(
  rest: readonly HeatmapSample[],
  live: ReadonlyMap<string, SiteValue>,
  now: number,
): HeatmapSample[] {
  return rest.flatMap((s) => {
    const l = live.get(s.site_id);
    if (l) {
      const iso = new Date(l.newestEventMs).toISOString();
      return [{ ...s, value: l.value, device_count: l.deviceCount, event_time: iso, received_at: iso }];
    }
    return now - Date.parse(s.event_time) > staleAfterMs ? [] : [s];
  });
}

/** Device-weighted city mean. */
export function cityMean(samples: readonly HeatmapSample[]): { value: number; sites: number; devices: number } | null {
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    sum += s.value * s.device_count;
    n += s.device_count;
  }
  return n ? { value: sum / n, sites: samples.length, devices: n } : null;
}

/** A device is online when it has reported within the stale window. Live data overrides REST. */
export function onlineCount(devices: readonly Device[], snapshot: LiveSnapshot, now: number): number {
  let online = 0;
  for (const d of devices) {
    if (d.status !== "active") continue;
    const live = snapshot.deviceLastSeen[d.id];
    const seen = live ?? (d.last_seen_at ? Date.parse(d.last_seen_at) : 0);
    if (now - seen <= staleAfterMs) online++;
  }
  return online;
}
