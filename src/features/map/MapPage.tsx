import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { HeatmapSample } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock, formatMetricValue, formatReading } from "@/lib/format";
import { useDevicesLatest } from "@/lib/live/useSiteLatest";
import { METRICS, METRIC_IDS, type MetricId } from "@/lib/metrics";
import { usePageTitle } from "@/components/layout/AppShell";
import { HeatLegend } from "@/components/map/HeatLegend";
import { HeatMap, siteState, type SiteState } from "@/components/map/HeatMap";
import { idwCaption } from "@/components/map/IdwMiniMap";
import { Age } from "@/components/ui/Age";
import { ErrorState } from "@/components/ui/Feedback";
import { Segmented, Switch } from "@/components/ui/Field";
import { QualityFlag } from "@/components/ui/QualityFlag";
import { StateIcon } from "@/components/ui/StateIcon";
import { useDevices, useLiveSamples, useSites } from "@/features/overview/queries";

const HOUR = 3_600_000;
const STATE_ICON: Record<SiteState, { shape: "circle" | "triangle" | "octagon"; cls: string; hollow?: boolean }> = {
  normal: { shape: "circle", cls: "text-state-normal" },
  warn: { shape: "triangle", cls: "text-state-warn" },
  critical: { shape: "octagon", cls: "text-state-critical" },
  nodata: { shape: "circle", cls: "text-fg-muted", hollow: true },
};

export default function MapPage() {
  usePageTitle("Environmental map", "Estimated surface from sensor sites. Pick a metric, a time and a site.");
  const [metric, setMetric] = useState<MetricId>("pm25");
  const [includeSuspicious, setIncludeSuspicious] = useState(false);
  // 24 = now; 0…23 = that many hours back from the current hour.
  const [step, setStep] = useState(24);
  const [selected, setSelected] = useState<string | null>(null);
  const sites = useSites();
  const siteList = useMemo(() => sites.data?.items ?? [], [sites.data]);

  const live = useLiveSamples(metric);
  // The scrubber's hours are fixed when the page opens, so the history it points at doesn't shift.
  const [currentHour] = useState(() => Math.floor(Date.now() / HOUR) * HOUR);
  const at = step === 24 ? null : currentHour - (24 - step) * HOUR;
  const past = useQuery({
    queryKey: ["heatmap", metric, "at", at, includeSuspicious],
    queryFn: ({ signal }) => api.heatmap(metric, { at: new Date(at!).toISOString() }, signal),
    enabled: at !== null,
  });
  const suspicious = useQuery({
    queryKey: ["heatmap", metric, "suspicious"],
    queryFn: ({ signal }) => api.heatmap(metric, { includeSuspicious: true }, signal),
    enabled: at === null && includeSuspicious,
    refetchInterval: 15_000,
  });

  const samples: readonly HeatmapSample[] =
    at !== null ? (past.data?.samples ?? []) : includeSuspicious ? (suspicious.data?.samples ?? live.samples) : live.samples;
  const error = at !== null ? past.error : live.error;
  const bySite = useMemo(() => new Map(samples.map((s) => [s.site_id, s])), [samples]);
  const ranked = useMemo(
    () => [...siteList].sort((a, b) => (bySite.get(b.id)?.value ?? -1) - (bySite.get(a.id)?.value ?? -1)),
    [siteList, bySite],
  );
  const selectedSite = siteList.find((s) => s.id === selected) ?? null;

  return (
    <div className="relative h-[calc(100dvh-120px)] min-h-[560px] overflow-hidden rounded-xl border border-line bg-sunken">
      <HeatMap
        metric={metric}
        samples={samples}
        sites={siteList}
        selectedSite={selected}
        onSelectSite={setSelected}
        className="absolute inset-0"
      />

      {/* Controls */}
      <div className="absolute top-4 left-16 z-[500] flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-1 p-2 pr-4">
        <Segmented
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={METRIC_IDS.map((m) => ({ value: m, label: METRICS[m].label }))}
        />
        <Switch label="Include suspicious" checked={includeSuspicious} onCheckedChange={setIncludeSuspicious} disabled={at !== null} />
      </div>

      {/* Legend + method */}
      <div className="absolute bottom-24 left-4 z-[500] w-80 max-w-[calc(100%-32px)] rounded-lg border border-line bg-surface-1 p-4">
        <HeatLegend metric={metric} />
        <p className="mt-3 text-body-sm text-fg-muted">
          {idwCaption(samples.length)} Faded where the nearest sensor is over 1.8 km away; blank beyond 3.2 km.
          {includeSuspicious && at === null && " Includes suspicious readings."}
        </p>
      </div>

      {/* Time scrubber */}
      <div className="absolute right-[352px] bottom-4 left-4 z-[500] flex items-center gap-4 rounded-lg border border-line bg-surface-1 px-4 py-3">
        <label htmlFor="map-time" className="shrink-0 text-label text-fg-secondary">
          Time
        </label>
        <input
          id="map-time"
          type="range"
          min={0}
          max={24}
          step={1}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          aria-valuetext={at === null ? "Now, live" : `${formatClock(new Date(at))}, ${24 - step} h ago`}
          className="min-w-0 flex-1 accent-brand"
        />
        <span className="num w-36 shrink-0 text-right text-data text-fg">
          {at === null ? "Now (live)" : `${formatClock(new Date(at))}, −${24 - step} h`}
        </span>
      </div>

      {/* Site panel */}
      <aside
        aria-label={selectedSite ? `${selectedSite.name} details` : "Sites"}
        className="absolute top-4 right-4 bottom-4 z-[500] flex w-80 flex-col overflow-hidden rounded-lg border border-line bg-surface-1"
      >
        {error ? (
          <ErrorState title="Couldn’t load the map data" detail={errorMessage(error)} onRetry={() => void (at ? past.refetch() : live.refetch())} />
        ) : selectedSite ? (
          <SitePanel siteId={selectedSite.id} name={selectedSite.name} metric={metric} sample={bySite.get(selectedSite.id)} onClose={() => setSelected(null)} past={at !== null} />
        ) : (
          <>
            <header className="border-b border-line p-4">
              <h2 className="text-h3 text-fg">Sites by {METRICS[metric].label}</h2>
              <p className="mt-1 text-body-sm text-fg-muted">Highest first. Pick one for details.</p>
            </header>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {ranked.map((s) => {
                const v = bySite.get(s.id)?.value;
                const st = siteState(v, metric);
                const icon = STATE_ICON[st];
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(s.id)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-2"
                    >
                      <StateIcon shape={icon.shape} hollow={icon.hollow} size={10} className={icon.cls} />
                      <span className="min-w-0 flex-1 truncate text-body text-fg-secondary">{s.name}</span>
                      <span className="num text-data text-fg">{v === undefined ? "–" : formatMetricValue(v, metric)}</span>
                      <span className="w-10 text-label text-fg-muted">{METRICS[metric].unit}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

function SitePanel({
  siteId,
  name,
  metric,
  sample,
  onClose,
  past,
}: {
  siteId: string;
  name: string;
  metric: MetricId;
  sample: HeatmapSample | undefined;
  onClose: () => void;
  past: boolean;
}) {
  const devices = useDevices();
  const siteDevices = useMemo(() => (devices.data?.items ?? []).filter((d) => d.site_id === siteId), [devices.data, siteId]);
  const latest = useDevicesLatest(siteDevices);
  const state = siteState(sample?.value, metric);
  const icon = STATE_ICON[state];
  const flagged = latest.filter((d) => {
    const r = d.readings[metric];
    return r && r.q.status !== "valid";
  });

  return (
    <>
      <header className="flex items-start justify-between gap-2 border-b border-line p-4">
        <div>
          <h2 className="text-h3 text-fg">{name}</h2>
          <p className="mt-1 text-body-sm text-fg-muted">{siteDevices.length} sensors</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Back to all sites" className="rounded-pill p-2 text-fg-muted hover:bg-surface-2 hover:text-fg">
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="flex items-baseline gap-1">
          <span className="num text-reading-xl text-fg">{sample ? formatMetricValue(sample.value, metric) : "–"}</span>
          <span className="text-body-sm text-fg-muted">{METRICS[metric].unit}</span>
        </p>
        <p className={cn("mt-1 inline-flex items-center gap-1 text-label", state === "nodata" ? "text-fg-muted" : icon.cls)}>
          <StateIcon shape={icon.shape} hollow={icon.hollow} size={10} />
          {state === "nodata" ? "No valid reading" : state === "normal" ? "Within limit" : state === "warn" ? "Above warning limit" : "Above critical limit"}
        </p>
        <p className="mt-2 text-body-sm text-fg-muted">
          {sample ? (
            <>
              Measured: mean of {sample.device_count} valid sensors{past ? "" : ", newest reading "}
              {!past && <Age at={sample.event_time} />}.
            </>
          ) : (
            "Every sensor here is stale, suspicious or quarantined."
          )}
        </p>

        {!past && (
          <>
            <h3 className="mt-6 text-label text-fg-muted">Latest at this site</h3>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {(["pm25", "temperature_c", "humidity_percent"] as MetricId[]).map((m) => {
                const vals = latest.map((d) => d.readings[m]).filter((r) => r && r.q.status === "valid");
                const mean = vals.length ? vals.reduce((s, r) => s + r!.m.value, 0) / vals.length : null;
                return (
                  <li key={m} className="flex h-10 items-center justify-between">
                    <span className="text-body text-fg-secondary">{METRICS[m].label}</span>
                    <span className="num text-data text-fg">{mean === null ? "–" : formatReading(mean, m)}</span>
                  </li>
                );
              })}
            </ul>

            <h3 className="mt-6 text-label text-fg-muted">Sensors needing a look</h3>
            {flagged.length === 0 ? (
              <p className="mt-2 text-body-sm text-fg-secondary">Every sensor here reports valid {METRICS[metric].label}.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {flagged.map((d) => (
                  <li key={d.deviceId} className="flex items-center justify-between gap-2">
                    <Link to={`/devices/${d.deviceId}`} className="num text-data text-fg-secondary underline-offset-4 hover:text-fg hover:underline">
                      {d.deviceId}
                    </Link>
                    <QualityFlag quality={d.readings[metric]!.q} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <Link
          to={`/analytics?metric=${metric}&site=${siteId}`}
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-pill border border-line px-4 text-body text-fg hover:bg-surface-2"
        >
          Open in analytics
          <ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
