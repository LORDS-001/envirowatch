import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Download, Plus, X } from "lucide-react";
import { errorMessage } from "@/lib/api/client";
import type { Measurement } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock, formatInteger, formatMetricValue, formatReading, formatUtc } from "@/lib/format";
import { isMetricId, METRICS, METRIC_IDS, type MetricId } from "@/lib/metrics";
import { assessQuality, latenessLabel } from "@/lib/quality";
import { usePageTitle } from "@/components/layout/AppShell";
import { DataTable, type ColumnDef } from "@/components/charts/DataTable";
import { LineChart, SeriesLegend } from "@/components/charts/LineChart";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { InlineSelect, Segmented } from "@/components/ui/Field";
import { QualityFlag } from "@/components/ui/QualityFlag";
import { useDevices, useSites } from "@/features/overview/queries";
import { gapFor, RANGE_MS, toLineSeries, useSeries, useSummary, usesRaw, type RangeKey, type SeriesSpec, type Window } from "./series";

const RANGES: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: "1h", label: "1 h" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "custom", label: "Custom" },
];

const toLocalInput = (t: number) => {
  const d = new Date(t - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

export default function AnalyticsPage() {
  usePageTitle("Historical analytics", "Readings over time, with every quality flag kept.");
  const [params, setParams] = useSearchParams();
  const metricParam = params.get("metric") ?? "pm25";
  const metric: MetricId = isMetricId(metricParam) ? metricParam : "pm25";
  const siteParam = params.get("site") ?? "site-apapa-port";
  const deviceId = params.get("device") ?? "";
  const range = (RANGES.some((r) => r.value === params.get("range")) ? params.get("range") : "24h") as RangeKey;

  const [customFrom, setCustomFrom] = useState(() => toLocalInput(Date.now() - 6 * 3_600_000));
  const [customTo, setCustomTo] = useState(() => toLocalInput(Date.now()));
  const [compare, setCompare] = useState<SeriesSpec[]>([]);
  // Freeze "now" per selection so the window is stable while data loads.
  const [anchor, setAnchor] = useState(() => Date.now());

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
    setAnchor(Date.now());
  };

  const win: Window = useMemo(() => {
    if (range === "custom") {
      const from = Date.parse(customFrom);
      const to = Date.parse(customTo);
      return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to: Math.min(to, anchor) } : { from: anchor - 3_600_000, to: anchor };
    }
    return { from: anchor - RANGE_MS[range], to: anchor };
  }, [range, customFrom, customTo, anchor]);
  const customInvalid = range === "custom" && !(Date.parse(customTo) > Date.parse(customFrom));

  const sites = useSites();
  const devices = useDevices();
  // A device link wins over the site param: the device's own site is the true one.
  const siteId = (deviceId && devices.data?.items.find((d) => d.id === deviceId)?.site_id) || siteParam;
  const siteName = useMemo(() => new Map((sites.data?.items ?? []).map((s) => [s.id, s.name])), [sites.data]);
  const siteDevices = useMemo(
    () => (devices.data?.items ?? []).filter((d) => d.site_id === siteId && d.metrics?.includes(metric)),
    [devices.data, siteId, metric],
  );

  const primary: SeriesSpec = { siteId, deviceId };
  const specs = useMemo(
    () => [primary, ...compare.filter((c) => c.siteId !== siteId || c.deviceId !== deviceId)].slice(0, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteId, deviceId, compare],
  );
  const labelFor = (s: SeriesSpec) => (s.deviceId ? s.deviceId : `${siteName.get(s.siteId) ?? s.siteId} (site mean)`);

  const results = useSeries(specs, metric, win);
  const lineSeries = results.flatMap((r, i) => (r.data ? [toLineSeries(r.data, i, labelFor(specs[i]!))] : []));
  const loading = results.some((r) => r.isLoading);
  const failed = results.find((r) => r.error);
  const raw = usesRaw(primary, win);
  const summary = useSummary(primary, metric, win);
  const def = METRICS[metric];
  const primaryReadings = results[0]?.data?.raw ? results[0].data.readings : null;

  const suspiciousCount = primaryReadings?.filter((m) => m.quality_status === "suspicious").length ?? 0;
  const quarantinedCount = primaryReadings?.filter((m) => m.quality_status === "quarantined").length ?? 0;
  const lateCount = primaryReadings?.filter((m) => Date.parse(m.received_at) - Date.parse(m.event_time) > 10_000).length ?? 0;
  const long = win.to - win.from > 2 * 86_400_000;

  const exportHref = `/reports?${new URLSearchParams({
    sites: siteId,
    metrics: metric,
    from: new Date(win.from).toISOString(),
    to: new Date(win.to).toISOString(),
  })}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-col gap-2">
          <span className="text-label text-fg-secondary" id="metric-label">
            Metric
          </span>
          <Segmented
            label="Metric"
            value={metric}
            onChange={(m) => set({ metric: m })}
            options={METRIC_IDS.map((m) => ({ value: m, label: METRICS[m].label }))}
          />
        </div>
        <div className="flex w-56 flex-col gap-2">
          <span className="text-label text-fg-secondary">Site</span>
          <InlineSelect
            label="Site"
            value={siteId}
            onChange={(e) => set({ site: e.target.value, device: null })}
            options={(sites.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div className="flex w-56 flex-col gap-2">
          <span className="text-label text-fg-secondary">Device</span>
          <InlineSelect
            label="Device"
            value={deviceId}
            onChange={(e) => set({ device: e.target.value })}
            options={[{ value: "", label: "All devices (site mean)" }, ...siteDevices.map((d) => ({ value: d.id, label: d.id }))]}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-label text-fg-secondary">Range</span>
          <Segmented label="Time range" value={range} onChange={(r) => set({ range: r })} options={RANGES} />
        </div>
        {range === "custom" && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-2 text-label text-fg-secondary">
              From
              <input
                type="datetime-local"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="num h-9 rounded-pill border border-line bg-surface-2 px-4 text-data text-fg"
              />
            </label>
            <label className="flex flex-col gap-2 text-label text-fg-secondary">
              To
              <input
                type="datetime-local"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-invalid={customInvalid}
                className="num h-9 rounded-pill border border-line bg-surface-2 px-4 text-data text-fg aria-[invalid=true]:border-state-critical"
              />
            </label>
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            icon={<Plus size={16} strokeWidth={1.5} aria-hidden="true" />}
            disabled={specs.length >= 4 || compare.some((c) => c.siteId === siteId && c.deviceId === deviceId)}
            onClick={() => setCompare((c) => [...c, primary].slice(-3))}
          >
            Add to compare
          </Button>
          <Link
            to={exportHref}
            className="inline-flex h-9 items-center gap-2 rounded-pill border border-line bg-surface-2 px-4 text-body text-fg hover:bg-surface-3"
          >
            <Download size={16} strokeWidth={1.5} aria-hidden="true" />
            Export
          </Link>
        </div>
        {customInvalid && (
          <p role="alert" className="w-full text-body-sm text-state-critical">
            The end must be after the start.
          </p>
        )}
      </Card>

      {/* Chart */}
      <Card className="p-6" aria-labelledby="chart-title">
        <CardHeader
          id="chart-title"
          title={`${def.label}, ${labelFor(primary)}`}
          subtitle={`${raw ? "Every reading at its event time" : "Mean per period from aggregates"}, ${def.unit}`}
        />
        {compare.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Compared series">
            {compare.map((c) => (
              <li key={`${c.siteId}|${c.deviceId}`} className="inline-flex h-7 items-center gap-1 rounded-pill bg-surface-2 pr-1 pl-3 text-label text-fg-secondary">
                {labelFor(c)}
                <button
                  type="button"
                  aria-label={`Remove ${labelFor(c)} from compare`}
                  onClick={() => setCompare((cs) => cs.filter((x) => x !== c))}
                  className="rounded-pill p-1 hover:bg-surface-3 hover:text-fg"
                >
                  <X size={12} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          {failed ? (
            <ErrorState title="Couldn’t load readings" detail={errorMessage(failed.error)} onRetry={() => results.forEach((r) => void r.refetch())} />
          ) : loading ? (
            <Skeleton className="h-80" />
          ) : lineSeries.every((s) => s.points.length === 0) ? (
            <EmptyState title="No readings in this range" description="This sensor didn’t report in the chosen window. Try a longer range or another device." />
          ) : (
            <>
              <LineChart
                series={lineSeries}
                gapMs={gapFor(raw, win)}
                formatValue={(v) => formatReading(v, metric)}
                threshold={def.thresholds ? { value: def.thresholds.warn, label: `${def.thresholds.warn} ${def.unit} limit` } : undefined}
                height={320}
                longRange={long}
                ariaLabel={`${def.label} over time. Use the arrow keys to read values.`}
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <SeriesLegend series={lineSeries} />
                <p className="text-body-sm text-fg-muted">
                  Breaks in a line are gaps with no readings; nothing is interpolated.
                  {raw && " Hollow diamonds are suspicious readings, kept out of the line."}
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(
          [
            ["Minimum", summary.stats ? formatMetricValue(summary.stats.min, metric) : null, def.unit],
            ["Maximum", summary.stats ? formatMetricValue(summary.stats.max, metric) : null, def.unit],
            ["Mean", summary.stats ? formatMetricValue(summary.stats.avg, metric) : null, def.unit],
            ["Valid readings", summary.stats ? formatInteger(summary.stats.count) : null, ""],
          ] as const
        ).map(([label, value, unit]) => (
          <Card as="div" key={label} className="p-4">
            <p className="text-body-sm text-fg-secondary">{label}</p>
            {summary.query.isLoading ? (
              <Skeleton className="mt-2 h-7 w-20" />
            ) : (
              <p className="mt-2 flex items-baseline gap-1">
                <span className="num text-reading-md text-fg">{value ?? "–"}</span>
                {unit && <span className="text-body-sm text-fg-muted">{unit}</span>}
              </p>
            )}
          </Card>
        ))}
      </div>
      <p className="-mt-2 text-body-sm text-fg-muted">
        From aggregates of valid readings{summary.stats ? ` over ${summary.stats.buckets} periods` : ""}. Suspicious and quarantined readings are excluded.
      </p>

      {/* Raw readings */}
      <Card className="p-6" aria-labelledby="raw-title">
        <CardHeader
          id="raw-title"
          title="Raw readings"
          subtitle={
            primaryReadings
              ? `${formatInteger(primaryReadings.length)} readings, ${suspiciousCount} suspicious, ${quarantinedCount} quarantined, ${lateCount} arrived late`
              : "Each reading with its event and received time"
          }
        />
        <div className="mt-4">
          {primaryReadings ? (
            <ReadingsTable readings={primaryReadings} metric={metric} />
          ) : (
            <EmptyState
              title="Pick one device and up to 24 h"
              description="Raw readings are listed for a single device. Site means and longer ranges come from aggregates."
              action={
                siteDevices[0] ? (
                  <Button size="sm" onClick={() => set({ device: siteDevices[0]!.id, range: range === "1h" ? "1h" : "24h" })}>
                    Show {siteDevices[0].id}
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function ReadingsTable({ readings, metric }: { readings: Measurement[]; metric: MetricId }) {
  const data = useMemo(() => [...readings].sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time)), [readings]);
  const columns = useMemo<ColumnDef<Measurement, unknown>[]>(
    () => [
      {
        id: "event",
        header: "Event time",
        accessorFn: (m) => Date.parse(m.event_time),
        cell: ({ row }) => (
          <span className="num text-data text-fg" title={formatUtc(row.original.event_time)}>
            {formatClock(row.original.event_time, undefined, true)}
          </span>
        ),
        meta: { width: "minmax(120px,1fr)" },
      },
      {
        id: "received",
        header: "Received",
        accessorFn: (m) => Date.parse(m.received_at),
        cell: ({ row }) => {
          const late = latenessLabel(Date.parse(row.original.received_at) - Date.parse(row.original.event_time) > 10_000 ? Date.parse(row.original.received_at) - Date.parse(row.original.event_time) : null);
          return (
            <span className={cn("num text-data", late ? "text-fg" : "text-fg-secondary")} title={late ?? formatUtc(row.original.received_at)}>
              {formatClock(row.original.received_at, undefined, true)}
              {late ? " · late" : ""}
            </span>
          );
        },
        meta: { width: "minmax(140px,1fr)" },
      },
      {
        id: "value",
        header: `Value (${METRICS[metric].unit})`,
        accessorFn: (m) => m.value,
        cell: ({ row }) => formatMetricValue(row.original.value, metric),
        meta: { numeric: true, width: "120px" },
      },
      {
        id: "quality",
        header: "Quality",
        accessorFn: (m) => m.quality_status,
        cell: ({ row }) => {
          const m = row.original;
          const q = assessQuality(m, Date.parse(m.event_time));
          return <QualityFlag quality={q} showValid />;
        },
        meta: { width: "minmax(200px,1.5fr)" },
      },
      {
        id: "reading",
        header: "Reading ID",
        accessorFn: (m) => m.reading_id,
        cell: ({ row }) => <span className="num text-data">{row.original.reading_id}</span>,
        meta: { width: "minmax(200px,1.5fr)" },
      },
    ],
    [metric],
  );
  return (
    <DataTable
      data={data}
      columns={columns}
      getRowId={(m) => m.reading_id}
      caption="Raw readings, newest first"
      height={440}
      empty={{ title: "No readings in this range" }}
    />
  );
}
