import { useQueries, useQuery } from "@tanstack/react-query";
import { api, type Bucket } from "@/lib/api/endpoints";
import type { Aggregate, Measurement } from "@/lib/api/types";
import { config } from "@/lib/config";
import type { LinePoint, LineSeries } from "@/components/charts/LineChart";
import type { MetricId } from "@/lib/metrics";

export type RangeKey = "1h" | "24h" | "7d" | "30d" | "custom";

export const RANGE_MS: Record<Exclude<RangeKey, "custom">, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export interface SeriesSpec {
  siteId: string;
  /** Empty: the site mean. */
  deviceId: string;
}

export interface Window {
  from: number;
  to: number;
}

/** Raw readings only for one device over at most a day; aggregates otherwise. */
export function usesRaw(spec: SeriesSpec, w: Window) {
  return spec.deviceId !== "" && w.to - w.from <= RANGE_MS["24h"] + 60_000;
}

export function bucketFor(w: Window): Bucket {
  const span = w.to - w.from;
  if (span <= 2 * 3_600_000) return "1m";
  if (span <= 2 * 86_400_000) return "15m";
  if (span <= 10 * 86_400_000) return "1h";
  if (span <= 45 * 86_400_000) return "6h";
  return "1d";
}

const BUCKET_MS: Record<Bucket, number> = { "1m": 60_000, "15m": 900_000, "1h": 3_600_000, "6h": 21_600_000, "1d": 86_400_000 };

/** A gap longer than this breaks the line. */
export function gapFor(raw: boolean, w: Window) {
  return raw ? config.cadenceMs * config.staleFactor : BUCKET_MS[bucketFor(w)] * 2.5;
}

/** Fetch every page of raw readings (capped; 24 h of one device is 8,640 rows). */
async function fetchRaw(spec: SeriesSpec, metric: MetricId, w: Window, signal: AbortSignal): Promise<Measurement[]> {
  const out: Measurement[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const page = await api.measurements(
      { device_id: spec.deviceId, metric, from: new Date(w.from).toISOString(), to: new Date(w.to).toISOString(), cursor, limit: 5000 },
      signal,
    );
    out.push(...page.items);
    cursor = page.next_cursor;
    if (!cursor) break;
  }
  return out;
}

export interface SeriesResult {
  spec: SeriesSpec;
  raw: boolean;
  readings: Measurement[];
  aggregates: Aggregate[];
}

export function useSeries(specs: readonly SeriesSpec[], metric: MetricId, w: Window) {
  return useQueries({
    queries: specs.map((spec) => {
      const raw = usesRaw(spec, w);
      return {
        queryKey: ["series", metric, spec.siteId, spec.deviceId, w.from, w.to, raw],
        queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SeriesResult> => {
          if (raw) return { spec, raw, readings: await fetchRaw(spec, metric, w, signal), aggregates: [] };
          const res = await api.aggregates(
            {
              metric,
              from: new Date(w.from).toISOString(),
              to: new Date(w.to).toISOString(),
              bucket: bucketFor(w),
              group_by: spec.deviceId ? "device" : "site",
              site_id: spec.siteId,
              device_id: spec.deviceId || undefined,
            },
            signal,
          );
          return { spec, raw, readings: [], aggregates: res.items };
        },
        staleTime: 60_000,
      };
    }),
  });
}

/** Summary aggregates for the primary selection (min / max / mean / count). */
export function useSummary(spec: SeriesSpec, metric: MetricId, w: Window) {
  const query = useQuery({
    queryKey: ["summary", metric, spec.siteId, spec.deviceId, w.from, w.to],
    queryFn: ({ signal }) =>
      api.aggregates(
        {
          metric,
          from: new Date(w.from).toISOString(),
          to: new Date(w.to).toISOString(),
          bucket: bucketFor(w),
          group_by: spec.deviceId ? "device" : "site",
          site_id: spec.siteId,
          device_id: spec.deviceId || undefined,
        },
        signal,
      ),
    staleTime: 60_000,
  });
  const rows = query.data?.items ?? [];
  if (!rows.length) return { query, stats: null };
  let min = Infinity;
  let max = -Infinity;
  let weighted = 0;
  let count = 0;
  for (const r of rows) {
    min = Math.min(min, r.min);
    max = Math.max(max, r.max);
    weighted += r.avg * r.count;
    count += r.count;
  }
  return { query, stats: { min, max, avg: count ? weighted / count : NaN, count, buckets: rows.length } };
}

const COLORS: LineSeries["color"][] = ["series-1", "series-2", "series-3", "series-4"];

export function toLineSeries(result: SeriesResult, index: number, label: string): LineSeries {
  const points: LinePoint[] = result.raw
    ? result.readings.map((m) => ({
        t: Date.parse(m.event_time),
        v: m.value,
        quality: m.quality_status,
        reason: m.quality_reason,
        eventTime: m.event_time,
        receivedAt: m.received_at,
      }))
    : result.aggregates.map((a) => ({ t: Date.parse(a.bucket_start), v: a.avg, quality: "valid" as const }));
  return { id: `${result.spec.siteId}|${result.spec.deviceId}`, label, color: COLORS[index] ?? "series-other", points };
}
