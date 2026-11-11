import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/endpoints";
import { cityMean, mergeHeatSamples, onlineCount, siteMeans } from "@/lib/live/derive";
import { useLive } from "@/lib/realtime/hooks";
import type { MetricId } from "@/lib/metrics";

const HOUR = 3_600_000;

export function useSites() {
  return useQuery({ queryKey: ["sites"], queryFn: ({ signal }) => api.sites(signal), staleTime: 10 * 60_000 });
}

export function useDevices() {
  return useQuery({ queryKey: ["devices"], queryFn: ({ signal }) => api.devices(signal), refetchInterval: 60_000 });
}

export function useHeatmap(metric: MetricId) {
  return useQuery({
    queryKey: ["heatmap", metric],
    queryFn: ({ signal }) => api.heatmap(metric, signal),
    refetchInterval: 60_000,
  });
}

export type BarRange = "24h" | "7d";

export function useCityAggregates(metric: MetricId, range: BarRange) {
  return useQuery({
    queryKey: ["aggregates", metric, range],
    queryFn: ({ signal }) => {
      const to = Date.now();
      const from = range === "24h" ? Math.floor(to / HOUR) * HOUR - 23 * HOUR : to - 7 * 24 * HOUR;
      return api.aggregates(
        {
          metric,
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          bucket: range === "24h" ? "1h" : "1d",
          group_by: "all",
        },
        signal,
      );
    },
    refetchInterval: 60_000,
  });
}

export function useQualitySummary(days = 7) {
  return useQuery({
    queryKey: ["quality-summary", days],
    queryFn: ({ signal }) => api.qualitySummary(days, signal),
    refetchInterval: 5 * 60_000,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: ({ signal }) => api.systemHealth(signal),
    refetchInterval: 15_000,
  });
}

/**
 * Live per-site values for a metric: REST heatmap merged with the live stream. Recomputed only
 * when the live snapshot (at most once per second) or the REST data changes.
 */
export function useLiveSamples(metric: MetricId) {
  const heat = useHeatmap(metric);
  const devices = useDevices();
  const deviceSite = useMemo(
    () => new Map((devices.data?.items ?? []).map((d) => [d.id, d.site_id])),
    [devices.data],
  );
  const snapshot = useLive((s) => s);
  const now = Math.max(snapshot.flushedAt, heat.dataUpdatedAt);
  const samples = useMemo(
    () => mergeHeatSamples(heat.data?.samples ?? [], siteMeans(snapshot, deviceSite, metric, now), now),
    [snapshot, deviceSite, heat.data, metric, now],
  );
  const mean = useMemo(() => cityMean(samples), [samples]);
  return { samples, mean, isLoading: heat.isLoading, error: heat.error, refetch: heat.refetch };
}

export function useOnlineDevices() {
  const devices = useDevices();
  const snapshot = useLive((s) => s);
  const now = Math.max(snapshot.flushedAt, devices.dataUpdatedAt);
  const online = useMemo(
    () => (devices.data ? onlineCount(devices.data.items, snapshot, now) : null),
    [devices.data, snapshot, now],
  );
  return { online, total: devices.data?.items.filter((d) => d.status === "active").length ?? null, devices };
}
