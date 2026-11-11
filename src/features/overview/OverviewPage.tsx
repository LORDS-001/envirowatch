import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Activity, ArrowUpRight, Bell, Cpu, ShieldCheck } from "lucide-react";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/api/client";
import type { HeatmapSample, QualityDay, Site } from "@/lib/api/types";
import {
  formatAge,
  formatClock,
  formatDateTime,
  formatHour,
  formatInteger,
  formatMetricValue,
  formatNumber,
  formatReading,
  formatUtc,
  formatWeekdayShort,
} from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { Age } from "@/components/ui/Age";
import { METRICS, pm25Band } from "@/lib/metrics";
import { useLive } from "@/lib/realtime/hooks";
import { BentoGrid, span } from "@/components/layout/BentoGrid";
import { usePageTitle, useOpenAlerts } from "@/components/layout/AppShell";
import { BarChart, type Bar } from "@/components/charts/BarChart";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { QualityBlocks, qualityShare } from "@/components/charts/QualityBlocks";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { AlertRow } from "@/components/domain/AlertRow";
import { StatCard } from "@/components/domain/StatCard";
import { HeatLegend } from "@/components/map/HeatLegend";
import { IdwMiniMap, idwCaption } from "@/components/map/IdwMiniMap";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { RangeSelect } from "@/components/ui/RangeSelect";
import { StateIcon } from "@/components/ui/StateIcon";
import {
  useCityAggregates,
  useLiveSamples,
  useOnlineDevices,
  useQualitySummary,
  useSites,
  useSystemHealth,
  type BarRange,
} from "./queries";

const PM = METRICS.pm25;
const WARN = PM.thresholds!.warn;

export default function OverviewPage() {
  usePageTitle("Overview", "46 sensor sites and 1,000 devices across Lagos");
  const sites = useSites();
  const pm = useLiveSamples("pm25");
  const temp = useLiveSamples("temperature_c");
  const siteList = useMemo(() => sites.data?.items ?? [], [sites.data]);

  return (
    <BentoGrid>
      <Hero sites={siteList} pm={pm} temp={temp} sitesError={sites.error} />
      <StatStrip />
      <HourlyBars className={span(8)} />
      <SiteGauge className={span(4)} samples={pm.samples} sites={siteList} loading={pm.isLoading} />
      <QualityCard className={span(6)} />
      <AttentionCard className={span(6)} />
    </BentoGrid>
  );
}

// ---- Hero ----

type LiveSamples = ReturnType<typeof useLiveSamples>;

function Hero({
  sites,
  pm,
  temp,
  sitesError,
}: {
  sites: readonly Site[];
  pm: LiveSamples;
  temp: LiveSamples;
  sitesError: unknown;
}) {
  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const sorted = useMemo(() => [...pm.samples].sort((a, b) => b.value - a.value), [pm.samples]);
  const over = useMemo(() => sorted.filter((s) => s.value > WARN), [sorted]);
  const ranked = sorted.slice(0, 3);
  const flagged = useMemo(() => new Set(over.map((s) => s.site_id)), [over]);
  const newest = Math.max(0, ...pm.samples.map((s) => Date.parse(s.event_time)));
  const mean = pm.mean;

  let headline = "Waiting for the first readings";
  let detail = "Readings arrive every 10 s once sensors connect.";
  if (mean) {
    headline = `PM2.5 is ${pm25Band(mean.value)} across Lagos`;
    const names = over.slice(0, 2).map((s) => siteName.get(s.site_id) ?? s.site_id);
    detail =
      over.length === 0
        ? `No site is above the ${WARN} ${PM.unit} limit.`
        : over.length === 1
          ? `${names[0]} is above the ${WARN} ${PM.unit} limit.`
          : `${over.length} sites are above the ${WARN} ${PM.unit} limit, highest ${names[0]}.`;
  }

  return (
    <Card size="hero" className={cn(span(12), "grid gap-6 p-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
      <div className="flex min-w-0 flex-col">
        <h2 className="max-w-[18ch] text-display-lg text-fg">{headline}</h2>
        <p className="mt-3 max-w-[48ch] text-body-lg text-fg-secondary">{detail}</p>
        <p className="mt-2 text-body-sm text-fg-muted">
          {mean ? (
            <>
              City mean from {formatInteger(mean.devices)} sensors at {mean.sites} sites, newest reading{" "}
              <Age at={newest} />.
            </>
          ) : (
            " "
          )}
        </p>
        {ranked.length > 0 && (
          <div className="mt-6">
            <h3 className="text-label text-fg-muted">Highest now</h3>
            <ol className="mt-2 divide-y divide-line border-y border-line">
              {ranked.map((s) => {
                const level = s.value > PM.thresholds!.critical ? "critical" : s.value > WARN ? "warn" : null;
                return (
                  <li key={s.site_id} className="flex h-10 items-center justify-between gap-4">
                    <span className="truncate text-body text-fg-secondary">
                      {siteName.get(s.site_id) ?? s.site_id}
                    </span>
                    <span className="flex items-center gap-2">
                      {level && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-label",
                            level === "warn" ? "text-state-warn" : "text-state-critical",
                          )}
                        >
                          <StateIcon shape={level === "warn" ? "triangle" : "octagon"} size={10} />
                          Above {level === "warn" ? WARN : PM.thresholds!.critical}
                        </span>
                      )}
                      <span className="num w-12 text-right text-data text-fg">
                        {formatMetricValue(s.value, "pm25")}
                      </span>
                      <span className="w-10 text-label text-fg-muted">{PM.unit}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        <div className="mt-auto grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2">
          <StatChip
            label="City mean PM2.5"
            value={mean ? formatMetricValue(mean.value, "pm25") : null}
            unit={PM.unit}
            note={mean ? <Age at={newest} /> : undefined}
            to="/analytics?metric=pm25"
          />
          <StatChip
            label="Mean temperature"
            value={temp.mean ? formatMetricValue(temp.mean.value, "temperature_c") : null}
            unit={METRICS.temperature_c.unit}
            note={temp.mean ? `${temp.mean.sites} sites` : undefined}
            to="/analytics?metric=temperature_c"
          />
        </div>
      </div>

      <figure className="flex min-w-0 flex-col gap-3">
        {pm.error || sitesError ? (
          <ErrorState
            className="h-72 rounded-lg bg-sunken"
            title="Couldn’t load the map"
            detail={errorMessage(pm.error ?? sitesError)}
            onRetry={() => void pm.refetch()}
          />
        ) : pm.isLoading || sites.length === 0 ? (
          <Skeleton className="h-72 rounded-lg" />
        ) : (
          <IdwMiniMap metric="pm25" samples={pm.samples} sites={sites} flagged={flagged} className="h-72" />
        )}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <HeatLegend metric="pm25" compact className="md:w-80" />
          <figcaption className="max-w-[44ch] text-body-sm text-fg-muted md:text-right">
            {idwCaption(pm.samples.length)}
          </figcaption>
        </div>
      </figure>
    </Card>
  );
}

function StatChip({
  label,
  value,
  unit,
  note,
  to,
}: {
  label: string;
  value: string | null;
  unit: string;
  note?: React.ReactNode;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-2 p-4 transition-colors duration-tick ease-standard hover:bg-surface-3"
    >
      <div className="min-w-0">
        <p className="text-label text-fg-secondary">{label}</p>
        {value === null ? (
          <Skeleton className="mt-2 h-6 w-20" />
        ) : (
          <p className="mt-2 flex items-baseline gap-1">
            <span className="num text-reading-md text-fg">{value}</span>
            <span className="text-body-sm text-fg-muted">{unit}</span>
          </p>
        )}
        {note && <p className="mt-1 text-label text-fg-muted">{note}</p>}
      </div>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-pill border border-line text-fg-secondary group-hover:border-line-strong group-hover:text-fg"
      >
        <ArrowUpRight size={16} strokeWidth={1.5} />
      </span>
      <span className="sr-only">Open {label} in analytics</span>
    </Link>
  );
}

// ---- Stat strip ----

function StatStrip() {
  const { online, total, devices } = useOnlineDevices();
  const health = useSystemHealth();
  const alerts = useOpenAlerts();
  const rate = useLive((s) => s.ratePerSec);
  const duplicates = useLive((s) => s.duplicates);
  const hasLive = useLive((s) => s.readings > 0);

  const open = alerts.data?.items ?? [];
  const unacked = open.filter((a) => a.status === "active").length;
  const silent = online !== null && total !== null ? total - online : null;
  const ingest = hasLive ? rate : health.data?.ingest_rate_per_s;

  return (
    <>
      <StatCard
        className={span(3)}
        highlight
        icon={<Cpu size={20} strokeWidth={1.5} />}
        label="Devices online"
        value={online === null ? "–" : formatInteger(online)}
        unit={total === null ? undefined : `of ${formatInteger(total)}`}
        context={silent ? `${formatInteger(silent)} not reporting` : undefined}
        loading={devices.isLoading}
      />
      <StatCard
        className={span(3)}
        icon={<Activity size={20} strokeWidth={1.5} />}
        label="Readings per second"
        value={ingest === undefined ? "–" : formatNumber(ingest, 1)}
        unit="/s"
        context={hasLive ? `${formatInteger(duplicates)} duplicates dropped` : "Expected 100"}
        loading={health.isLoading && !hasLive}
      />
      <StatCard
        className={span(3)}
        icon={<ShieldCheck size={20} strokeWidth={1.5} />}
        label="Valid readings, last 24 h"
        value={
          health.data?.valid_rate_24h === undefined ? "–" : formatNumber(health.data.valid_rate_24h * 100, 1)
        }
        unit="%"
        context={health.data ? `p95 ${formatNumber(health.data.latency_ms.p95 / 1000, 1)} s` : undefined}
        loading={health.isLoading}
      />
      <StatCard
        className={span(3)}
        icon={<Bell size={20} strokeWidth={1.5} />}
        label="Open alerts"
        value={alerts.data ? formatInteger(open.length) : "–"}
        context={
          unacked ? (
            <>
              <StateIcon shape="octagon" size={10} className="text-state-critical" />
              {unacked} unacknowledged
            </>
          ) : undefined
        }
        loading={alerts.isLoading}
      />
    </>
  );
}

// ---- Hourly bars ----

const RANGES = [
  { value: "24h", label: "Last 24 h" },
  { value: "7d", label: "Last 7 days" },
] as const;

function HourlyBars({ className }: { className?: string }) {
  const [range, setRange] = useState<BarRange>("24h");
  const q = useCityAggregates("pm25", range);
  const rows = useMemo(() => q.data?.items ?? [], [q.data]);
  // Formatting times is relatively costly; do it once per data change, not per render.
  const bars: Bar[] = useMemo(
    () =>
      rows.map((r) => {
        const label = range === "24h" ? formatHour(r.bucket_start) : formatWeekdayShort(r.bucket_start);
        const when =
          range === "24h" ? formatClock(r.bucket_start) : formatDateTime(r.bucket_start).split(",")[0]!;
        return {
          key: r.bucket_start,
          label,
          value: r.avg,
          description: `${when}, mean ${formatReading(r.avg, "pm25")}, peak ${formatReading(r.max, "pm25")}`,
        };
      }),
    [rows, range],
  );
  const over = rows.filter((r) => r.avg > WARN).length;
  const latest = rows[rows.length - 1];
  const summary = latest
    ? `PM2.5 city mean by ${range === "24h" ? "hour" : "day"}. Latest ${formatReading(latest.avg, "pm25")}. ${over} of ${rows.length} periods above ${WARN} ${PM.unit}.`
    : "No data";

  return (
    <ChartFrame
      className={className}
      title={range === "24h" ? "PM2.5 by hour" : "PM2.5 by day"}
      subtitle={`City mean of all sites, ${PM.unit}`}
      actions={<RangeSelect label="Time range" value={range} options={RANGES} onChange={setRange} />}
      summary={summary}
      rows={rows}
      rowKey={(r) => r.bucket_start}
      columns={[
        {
          header: range === "24h" ? "Hour" : "Day",
          cell: (r) => <span title={formatUtc(r.bucket_start)}>{formatDateTime(r.bucket_start)}</span>,
        },
        { header: "Mean", numeric: true, cell: (r) => formatReading(r.avg, "pm25") },
        { header: "Min", numeric: true, cell: (r) => formatReading(r.min, "pm25") },
        { header: "Max", numeric: true, cell: (r) => formatReading(r.max, "pm25") },
        { header: "Readings", numeric: true, cell: (r) => formatInteger(r.count) },
      ]}
    >
      {q.error ? (
        <ErrorState
          title="Couldn’t load readings"
          detail={errorMessage(q.error)}
          onRetry={() => void q.refetch()}
        />
      ) : q.isLoading ? (
        <Skeleton className="h-60" />
      ) : bars.length === 0 ? (
        <EmptyState
          title="No readings in this range"
          description="Pick a longer range, or check that sensors are reporting."
        />
      ) : (
        <BarChart
          bars={bars}
          threshold={{ value: WARN, label: `${WARN} ${PM.unit} limit`, critical: PM.thresholds!.critical }}
          formatValue={(v) => formatReading(v, "pm25")}
          ariaLabel={`PM2.5 ${range === "24h" ? "hour" : "day"}; use the arrow keys to read each bar`}
        />
      )}
    </ChartFrame>
  );
}

// ---- Gauge ----

function SiteGauge({
  className,
  samples,
  sites,
  loading,
}: {
  className?: string;
  samples: readonly HeatmapSample[];
  sites: readonly Site[];
  loading: boolean;
}) {
  const now = useNow();
  const ranked = useMemo(() => [...samples].sort((a, b) => b.value - a.value), [samples]);
  const names = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);
  const [picked, setPicked] = useState<string | null>(null);
  const siteId = picked ?? ranked[0]?.site_id ?? "";
  const sample = samples.find((s) => s.site_id === siteId);
  const options = ranked
    .slice(0, 12)
    .map((s) => ({ value: s.site_id, label: names.get(s.site_id) ?? s.site_id }));
  if (picked && !options.some((o) => o.value === picked))
    options.push({ value: picked, label: names.get(picked) ?? picked });

  const age = sample ? now - Date.parse(sample.event_time) : null;
  const stale = age !== null && age > config.cadenceMs * config.staleFactor;
  const value = sample?.value ?? null;
  const state =
    value === null ? null : value > PM.thresholds!.critical ? "critical" : value > WARN ? "warn" : "normal";
  const name = names.get(siteId) ?? "–";

  return (
    <Card className={cn("flex flex-col p-6", className)} aria-label={`PM2.5 now at ${name}`}>
      <CardHeader
        title="PM2.5 now"
        subtitle={name}
        actions={
          options.length > 0 && (
            <RangeSelect label="Site" value={siteId} options={options} onChange={setPicked} />
          )
        }
      />
      <div className="flex flex-1 items-center justify-center py-4">
        {loading ? (
          <Skeleton className="size-56 rounded-pill" />
        ) : (
          <RadialGauge
            value={value}
            min={PM.gaugeRange[0]}
            max={PM.gaugeRange[1]}
            heatEdges={PM.heatEdges}
            muted={stale}
          >
            <span className={cn("num text-reading-xl", stale ? "text-fg-muted" : "text-fg")}>
              {value === null ? "–" : formatMetricValue(value, "pm25")}
            </span>
            <span className="text-body-sm text-fg-muted">{PM.unit}</span>
            {state && !stale && (
              <span
                className={cn(
                  "mt-2 inline-flex items-center gap-1 text-label",
                  state === "normal"
                    ? "text-fg-secondary"
                    : state === "warn"
                      ? "text-state-warn"
                      : "text-state-critical",
                )}
              >
                <StateIcon
                  shape={state === "normal" ? "circle" : state === "warn" ? "triangle" : "octagon"}
                  size={10}
                  className={state === "normal" ? "text-state-normal" : undefined}
                />
                {state === "normal"
                  ? "Within limit"
                  : state === "warn"
                    ? `Above ${WARN} limit`
                    : `Above ${PM.thresholds!.critical} limit`}
              </span>
            )}
          </RadialGauge>
        )}
      </div>
      <p className="text-center text-body-sm text-fg-muted" aria-live="off">
        {sample
          ? `Mean of ${sample.device_count} sensors, ${stale ? `stale, last reading ${formatAge(age!)}` : formatAge(age!)}`
          : "No valid readings at this site"}
      </p>
    </Card>
  );
}

// ---- Quality ----

function QualityCard({ className }: { className?: string }) {
  const q = useQualitySummary(7);
  const days = q.data?.days ?? [];
  const today = days[days.length - 1];
  const summary = today
    ? `Reading quality over 7 days. Today ${qualityShare(today, "valid")} valid, ${qualityShare(today, "missing")} missing, ${qualityShare(today, "suspicious")} suspicious.`
    : "No data";
  return (
    <ChartFrame<QualityDay>
      className={className}
      title="Reading quality"
      subtitle="Share of expected readings per day, last 7 days"
      summary={summary}
      rows={days}
      rowKey={(d) => d.date}
      columns={[
        { header: "Day", cell: (d) => formatDateTime(d.date).split(",")[0] },
        { header: "Valid", numeric: true, cell: (d) => qualityShare(d, "valid") },
        { header: "Estimated", numeric: true, cell: (d) => qualityShare(d, "estimated") },
        { header: "Suspicious", numeric: true, cell: (d) => qualityShare(d, "suspicious") },
        { header: "Missing", numeric: true, cell: (d) => qualityShare(d, "missing") },
      ]}
    >
      {q.error ? (
        <ErrorState
          title="Couldn’t load quality data"
          detail={errorMessage(q.error)}
          onRetry={() => void q.refetch()}
        />
      ) : q.isLoading ? (
        <Skeleton className="h-56" />
      ) : (
        <QualityBlocks days={days} />
      )}
    </ChartFrame>
  );
}

// ---- Alerts needing attention ----

const ORDER = { active: 0, pending: 1, acknowledged: 2, resolved: 3 } as const;

function AttentionCard({ className }: { className?: string }) {
  const alerts = useOpenAlerts();
  const open = [...(alerts.data?.items ?? [])].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || Date.parse(b.opened_at) - Date.parse(a.opened_at),
  );
  return (
    <Card className={cn("flex flex-col p-6", className)} aria-labelledby="attention-title">
      <CardHeader
        id="attention-title"
        title="Needs attention"
        subtitle={alerts.data ? `${open.length} open alert${open.length === 1 ? "" : "s"}` : " "}
        actions={
          <Link
            to="/alerts"
            className="inline-flex h-7 items-center rounded-pill border border-line px-3 text-label text-fg-secondary transition-colors duration-tick ease-standard hover:bg-surface-2 hover:text-fg"
          >
            All alerts
          </Link>
        }
      />
      <div className="mt-4 flex-1">
        {alerts.error ? (
          <ErrorState
            title="Couldn’t load alerts"
            detail={errorMessage(alerts.error)}
            onRetry={() => void alerts.refetch()}
          />
        ) : alerts.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : open.length === 0 ? (
          <EmptyState
            title="No open alerts"
            description="Threshold and device-health alerts appear here as they open."
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {open.slice(0, 4).map((a) => (
              <AlertRow key={a.id} alert={a} compact />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
