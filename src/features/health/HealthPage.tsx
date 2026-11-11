import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleOff, Cpu, Diamond, TrendingUp } from "lucide-react";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { DeviceHealthStatus, HealthSummaryItem } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatInteger, formatNumber, formatPercent } from "@/lib/format";
import { useLive } from "@/lib/realtime/hooks";
import { BentoGrid, span } from "@/components/layout/BentoGrid";
import { usePageTitle } from "@/components/layout/AppShell";
import { DataTable, type ColumnDef } from "@/components/charts/DataTable";
import { HalfDonut } from "@/components/charts/HalfDonut";
import { QualityBlocks } from "@/components/charts/QualityBlocks";
import { StatCard } from "@/components/domain/StatCard";
import { Age } from "@/components/ui/Age";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { StateIcon } from "@/components/ui/StateIcon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useQualitySummary, useSites, useSystemHealth } from "@/features/overview/queries";

const SEVERITY: Record<DeviceHealthStatus, number> = { silent: 0, suspicious: 1, drifting: 2, online: 3, deactivated: 4 };
const FAULT_WORD: Record<string, string> = {
  silent: "Silent",
  drift: "Drift",
  spike: "Spike",
  clock_error: "Clock error",
  duplicate: "Duplicate",
  late: "Late",
  network: "Network failure",
};

export function useHealthSummary() {
  return useQuery({ queryKey: ["health-summary"], queryFn: ({ signal }) => api.healthSummary(signal), refetchInterval: 30_000 });
}

export default function HealthPage() {
  usePageTitle("Sensor health", "Silent, drifting and suspicious sensors, and how the pipeline is coping.");
  const summary = useHealthSummary();
  const health = useSystemHealth();
  const quality = useQualitySummary(7);
  const sites = useSites();
  const siteName = useMemo(() => new Map((sites.data?.items ?? []).map((s) => [s.id, s.name])), [sites.data]);
  const items = useMemo(() => summary.data?.items ?? [], [summary.data]);
  const counts = useMemo(() => {
    const c: Record<DeviceHealthStatus, number> = { online: 0, silent: 0, drifting: 0, suspicious: 0, deactivated: 0 };
    for (const i of items) c[i.health]++;
    return c;
  }, [items]);
  const needsLook = useMemo(
    () =>
      items
        .filter((i) => i.health !== "online")
        .sort((a, b) => SEVERITY[a.health] - SEVERITY[b.health] || a.device_id.localeCompare(b.device_id)),
    [items],
  );

  return (
    <BentoGrid>
      <StatCard className={span(3)} icon={<Cpu size={20} strokeWidth={1.5} />} label="Online" value={summary.data ? formatInteger(counts.online) : "–"} loading={summary.isLoading} />
      <StatCard className={span(3)} icon={<CircleOff size={20} strokeWidth={1.5} />} label="Silent" value={summary.data ? formatInteger(counts.silent) : "–"} loading={summary.isLoading} context={counts.silent ? <><StateIcon shape="octagon" size={10} className="text-state-critical" />No readings</> : undefined} />
      <StatCard className={span(3)} icon={<TrendingUp size={20} strokeWidth={1.5} />} label="Drifting" value={summary.data ? formatInteger(counts.drifting) : "–"} loading={summary.isLoading} context={counts.drifting ? <><StateIcon shape="triangle" size={10} className="text-state-warn" />Bias growing</> : undefined} />
      <StatCard className={span(3)} icon={<Diamond size={20} strokeWidth={1.5} />} label="Suspicious" value={summary.data ? formatInteger(counts.suspicious) : "–"} loading={summary.isLoading} context={counts.suspicious ? <><StateIcon shape="diamond" size={10} className="text-state-suspicious" />Spikes or clock</> : undefined} />

      <Card className={cn(span(4), "flex flex-col p-6")} aria-labelledby="valid-title">
        <CardHeader id="valid-title" title="Valid readings" subtitle="Share stored as valid, last 24 h" />
        <div className="flex flex-1 items-center justify-center pt-6">
          {health.isLoading ? <Skeleton className="h-28 w-48" /> : <HalfDonut value={health.data?.valid_rate_24h ?? null} label="valid, last 24 h" />}
        </div>
      </Card>

      <Card className={cn(span(8), "p-6")} aria-labelledby="pipeline-title">
        <CardHeader id="pipeline-title" title="Pipeline" subtitle={health.data ? <>Updated <Age at={health.data.generated_at} />, refreshes every 15 s</> : "Ingestion, queue and database"} />
        {health.error ? (
          <ErrorState title="Couldn’t load service health" detail={errorMessage(health.error)} onRetry={() => void health.refetch()} />
        ) : (
          <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Ingest rate" value={health.data ? formatNumber(health.data.ingest_rate_per_s, 1) : null} unit="/s" note="Target 100 /s" />
            <Metric label="Queue depth" value={health.data ? formatInteger(health.data.queue_depth) : null} unit="messages" />
            <Metric label="Error rate" value={health.data ? formatPercent(health.data.error_rate, 2).replace(" %", "") : null} unit="%" />
            <Metric label="Database writes" value={health.data ? formatNumber(health.data.db_writes_per_s, 0) : null} unit="/s" />
            <Metric label="Latency p50" value={health.data ? formatNumber(health.data.latency_ms.p50 / 1000, 2) : null} unit="s" />
            <Metric
              label="Latency p95"
              value={health.data ? formatNumber(health.data.latency_ms.p95 / 1000, 2) : null}
              unit="s"
              note="Target ≤ 5 s"
              warn={!!health.data && health.data.latency_ms.p95 > 5000}
            />
            <Metric label="Latency p99" value={health.data ? formatNumber(health.data.latency_ms.p99 / 1000, 2) : null} unit="s" />
            <Metric label="Status" value={health.data ? (health.data.status === "ok" ? "OK" : health.data.status === "degraded" ? "Degraded" : "Down") : null} unit="" />
          </dl>
        )}
      </Card>

      <Card className={cn(span(8), "p-6")} aria-labelledby="devices-title">
        <CardHeader id="devices-title" title="Sensors needing a look" subtitle="Most severe first: silent, suspicious, drifting" />
        <div className="mt-4">
          <HealthTable rows={needsLook} siteName={siteName} loading={summary.isLoading} error={summary.error} retry={() => void summary.refetch()} />
        </div>
      </Card>

      <FaultFeed className={span(4)} />

      <Card className={cn(span(12), "p-6")} aria-labelledby="quality-title">
        <CardHeader id="quality-title" title="Reading quality" subtitle="Readings that weren’t valid, share per day, last 7 days" />
        <div className="mt-4">
          {quality.isLoading ? <Skeleton className="h-48" /> : quality.data ? <QualityBlocks days={quality.data.days} /> : null}
        </div>
      </Card>
    </BentoGrid>
  );
}

function Metric({ label, value, unit, note, warn }: { label: string; value: string | null; unit: string; note?: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-surface-2 p-4">
      <dt className="text-body-sm text-fg-secondary">{label}</dt>
      <dd className="mt-2">
        {value === null ? (
          <Skeleton className="h-6 w-16" />
        ) : (
          <span className="flex items-baseline gap-1">
            <span className={cn("num text-reading-md", warn ? "text-state-warn" : "text-fg")}>{value}</span>
            {unit && <span className="text-body-sm text-fg-muted">{unit}</span>}
          </span>
        )}
        {note && <span className="mt-1 block text-label text-fg-muted">{note}</span>}
      </dd>
    </div>
  );
}

function HealthTable({
  rows,
  siteName,
  loading,
  error,
  retry,
}: {
  rows: HealthSummaryItem[];
  siteName: Map<string, string>;
  loading: boolean;
  error: unknown;
  retry: () => void;
}) {
  const data = useMemo(() => rows.map((r) => ({ ...r, siteName: siteName.get(r.site_id) ?? r.site_id })), [rows, siteName]);
  const columns = useMemo<ColumnDef<HealthSummaryItem & { siteName: string }, unknown>[]>(
    () => [
      { id: "health", header: "Health", accessorFn: (r) => SEVERITY[r.health], cell: ({ row }) => <StatusBadge status={row.original.health} />, meta: { width: "140px" } },
      {
        id: "device",
        header: "Device",
        accessorFn: (r) => r.device_id,
        cell: ({ row }) => (
          <Link to={`/devices/${row.original.device_id}`} className="num text-data text-fg hover:underline">
            {row.original.device_id}
          </Link>
        ),
        meta: { width: "120px", cardTitle: true },
      },
      { id: "site", header: "Site", accessorFn: (r) => r.siteName, meta: { width: "minmax(120px,1fr)" } },
      {
        id: "fault",
        header: "Latest finding",
        accessorFn: (r) => r.latest_event?.detail ?? "",
        cell: ({ row }) => {
          const e = row.original.latest_event;
          return e ? (
            <span title={e.detail ?? undefined}>
              {FAULT_WORD[e.fault_type] ?? e.fault_type}
              {e.detail ? `: ${e.detail}` : ""}
            </span>
          ) : (
            "–"
          );
        },
        meta: { width: "minmax(200px,2fr)" },
      },
      {
        id: "seen",
        header: "Last seen",
        accessorFn: (r) => (r.last_seen_at ? Date.parse(r.last_seen_at) : 0),
        cell: ({ row }) => (row.original.last_seen_at ? <Age at={row.original.last_seen_at} /> : "Never"),
        meta: { width: "110px" },
      },
    ],
    [],
  );
  const navigate = useNavigate();
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowId={(r) => r.device_id}
      caption="Sensors needing a look"
      height={360}
      loading={loading}
      error={error ? { title: "Couldn’t load sensor health", detail: errorMessage(error), onRetry: retry } : null}
      empty={{ title: "Every sensor is healthy", description: "Silent, drifting and suspicious sensors appear here." }}
      onRowOpen={(r) => navigate(`/devices/${r.device_id}`)}
    />
  );
}

function FaultFeed({ className }: { className?: string }) {
  const faults = useLive((s) => s.faults);
  return (
    <Card className={cn("flex flex-col p-6", className)} aria-labelledby="feed-title">
      <CardHeader id="feed-title" title="Fault feed" subtitle="Live detections from the pipeline" />
      <div className="mt-4 min-h-0 flex-1">
        {faults.length === 0 ? (
          <EmptyState title="No detections yet" description="Silent, spiking and drifting sensors are announced here as they’re detected." />
        ) : (
          <ul className="flex max-h-[360px] flex-col gap-1 overflow-y-auto" aria-live="polite" aria-relevant="additions">
            {faults.slice(0, 30).map((f, i) => (
              <li key={`${f.device_id}-${f.detected_at}-${i}`} className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                <StateIcon
                  shape={f.severity === "critical" ? "octagon" : f.fault_type === "spike" ? "diamond" : "triangle"}
                  size={10}
                  className={cn("mt-1", f.severity === "critical" ? "text-state-critical" : f.fault_type === "spike" ? "text-state-suspicious" : "text-state-warn")}
                />
                <div className="min-w-0">
                  <p className="text-body text-fg">
                    <Link to={`/devices/${f.device_id}`} className="num text-data hover:underline">
                      {f.device_id}
                    </Link>{" "}
                    {FAULT_WORD[f.fault_type]?.toLowerCase() ?? f.fault_type}
                  </p>
                  <p className="text-body-sm text-fg-muted">
                    <Age at={f.detected_at} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
