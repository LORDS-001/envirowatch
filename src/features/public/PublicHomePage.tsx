import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Download } from "lucide-react";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatClock, formatHour, formatMetricValue, formatReading } from "@/lib/format";
import { METRICS } from "@/lib/metrics";
import { BarChart, type Bar } from "@/components/charts/BarChart";
import { Age } from "@/components/ui/Age";
import { Button } from "@/components/ui/Button";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { STATE_SHAPE, STATE_TEXT_CLASS, StateIcon } from "@/components/ui/StateIcon";
import { BANDS, bandFor, partOfDay, usePublicSummary } from "./publicData";

export default function PublicHomePage() {
  useEffect(() => {
    document.title = "Air near you | EnviroWatch";
  }, []);
  const summary = usePublicSummary();
  const areas = useMemo(() => [...(summary.data?.areas ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [summary.data]);
  const [areaId, setAreaId] = useState("site-yaba");
  const area = areas.find((a) => a.site_id === areaId) ?? areas[0];
  const pm = area?.readings.find((r) => r.metric === "pm25");
  const temp = area?.readings.find((r) => r.metric === "temperature_c");
  const band = pm ? bandFor(pm.value) : null;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await api.publicExport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? "envirowatch-public.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setDownloadError(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  }

  if (summary.error) {
    return <ErrorState title="Couldn’t load today’s readings" detail={`${errorMessage(summary.error)}. Try again in a minute.`} onRetry={() => void summary.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-12">
      {/* Hero */}
      <section aria-labelledby="hero-title">
        <label htmlFor="area" className="text-body text-fg-secondary">
          Your area
        </label>
        <select
          id="area"
          value={area?.site_id ?? ""}
          onChange={(e) => setAreaId(e.target.value)}
          className="mt-2 block h-11 w-full max-w-xs rounded-pill border border-line bg-surface-1 px-4 text-body-lg text-fg"
        >
          {areas.map((a) => (
            <option key={a.site_id} value={a.site_id}>
              {a.name}
            </option>
          ))}
        </select>
        {!area || !pm || !band ? (
          <Skeleton className="mt-6 h-40 max-w-xl" />
        ) : (
          <>
            <h1 id="hero-title" className="mt-6 max-w-[20ch] text-display-lg text-fg sm:text-display-xl">
              Air is {band.word} in {area.name} {partOfDay()}
            </h1>
            <div className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-6">
              <div>
                <p className="flex items-baseline gap-2">
                  <span className="num text-[64px] leading-none font-medium tracking-tight text-fg">{formatMetricValue(pm.value, "pm25")}</span>
                  <span className="text-body-lg text-fg-muted">{METRICS.pm25.unit}</span>
                </p>
                <p className="mt-2 text-body-lg text-fg-secondary">Fine particles (PM2.5)</p>
              </div>
              {temp && (
                <div>
                  <p className="flex items-baseline gap-2">
                    <span className="num text-reading-xl text-fg">{formatMetricValue(temp.value, "temperature_c")}</span>
                    <span className="text-body-lg text-fg-muted">°C</span>
                  </p>
                  <p className="mt-2 text-body-lg text-fg-secondary">Temperature</p>
                </div>
              )}
            </div>
            <p className={cn("mt-6 flex max-w-[60ch] items-start gap-2 text-body-lg", band.state === "normal" ? "text-fg" : STATE_TEXT_CLASS[band.state])}>
              <StateIcon shape={STATE_SHAPE[band.state]} size={14} className={cn("mt-1", STATE_TEXT_CLASS[band.state])} />
              <span>{band.advice}</span>
            </p>
            <p className="mt-3 text-body text-fg-muted">
              Average of the working sensors in {area.name}. Updated <Age at={pm.event_time} />.
            </p>
          </>
        )}
      </section>

      {/* All areas */}
      <section aria-labelledby="areas-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="areas-title" className="text-h1 text-fg">
            Every area
          </h2>
          <Link to="/public/map" className="inline-flex h-11 items-center gap-2 rounded-pill border border-line px-4 text-body-lg text-fg hover:bg-surface-2">
            See the map
            <ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
        {summary.isLoading ? (
          <Skeleton className="mt-6 h-64" />
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((a) => {
              const p = a.readings.find((r) => r.metric === "pm25");
              const t = a.readings.find((r) => r.metric === "temperature_c");
              const b = p ? bandFor(p.value) : null;
              return (
                <li key={a.site_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAreaId(a.site_id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 rounded-lg border p-4 text-left hover:bg-surface-2",
                      a.site_id === area?.site_id ? "border-brand bg-brand-subtle" : "border-line bg-surface-1",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-body-lg text-fg">{a.name}</span>
                      {b && (
                        <span className={cn("mt-1 flex items-center gap-1 text-body", b.state === "normal" ? "text-fg-secondary" : STATE_TEXT_CLASS[b.state])}>
                          <StateIcon shape={STATE_SHAPE[b.state]} size={10} className={STATE_TEXT_CLASS[b.state]} />
                          {b.word[0]!.toUpperCase() + b.word.slice(1)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-reading-md text-fg">{p ? formatMetricValue(p.value, "pm25") : "–"}</span>
                      <span className="block text-body-sm text-fg-muted">{t ? formatReading(t.value, "temperature_c") : METRICS.pm25.unit}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <TrendSection />

      {/* Download */}
      <section aria-labelledby="download-title" className="rounded-xl border border-line bg-surface-1 p-6">
        <h2 id="download-title" className="text-h2 text-fg">
          Download the readings
        </h2>
        <p className="mt-2 max-w-[60ch] text-body-lg text-fg-secondary">
          A spreadsheet (CSV) of every area’s latest PM2.5 and temperature, with the time of each reading in UTC.
        </p>
        <Button className="mt-4" size="lg" onClick={() => void download()} loading={downloading} icon={<Download size={18} strokeWidth={1.5} aria-hidden="true" />}>
          Download CSV
        </Button>
        {downloadError && (
          <p role="alert" className="mt-2 text-body text-state-critical">
            Couldn’t download: {downloadError}. Try again.
          </p>
        )}
      </section>

      {/* Meaning */}
      <section aria-labelledby="meaning-title">
        <h2 id="meaning-title" className="text-h1 text-fg">
          What do these numbers mean?
        </h2>
        <p className="mt-3 max-w-[60ch] text-body-lg text-fg-secondary">
          PM2.5 is the weight of tiny particles, from traffic, generators, burning and dust, in a cubic metre of air. They’re small enough to reach deep into the lungs.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {BANDS.map((b) => (
            <li key={b.word} className="rounded-lg border border-line bg-surface-1 p-4">
              <p className={cn("flex items-center gap-2 text-body-lg", b.state === "normal" ? "text-fg" : STATE_TEXT_CLASS[b.state])}>
                <StateIcon shape={STATE_SHAPE[b.state]} size={12} className={STATE_TEXT_CLASS[b.state]} />
                {b.word[0]!.toUpperCase() + b.word.slice(1)}
                <span className="num ml-auto text-data text-fg-muted">{b.range} µg/m³</span>
              </p>
              <p className="mt-2 text-body text-fg-secondary">{b.advice}</p>
            </li>
          ))}
        </ul>
        <details className="mt-6 max-w-[70ch] rounded-lg border border-line bg-surface-1 p-4">
          <summary className="cursor-pointer text-body-lg text-fg">How the readings are checked</summary>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-6 text-body text-fg-secondary">
            <li>Each sensor reports every 10 seconds. A reading only counts if it arrives intact and makes physical sense.</li>
            <li>Readings that jump suddenly, or come from a sensor whose clock is wrong, are set aside and not shown here.</li>
            <li>A sensor that stops reporting drops out after 30 seconds, so a number is never older than it says.</li>
            <li>The map estimates air between sensors by distance. It doesn’t model wind or terrain, and it stays blank where no sensor is close.</li>
          </ul>
        </details>
      </section>
    </div>
  );
}

function TrendSection() {
  const trend = useQuery({ queryKey: ["public", "trend", "pm25"], queryFn: ({ signal }) => api.publicTrend("pm25", signal), refetchInterval: 5 * 60_000 });
  const bars: Bar[] = useMemo(
    () =>
      (trend.data?.points ?? []).map((p) => ({
        key: p.bucket_start,
        label: formatHour(p.bucket_start),
        value: p.avg,
        description: `${formatClock(p.bucket_start)}: ${formatReading(p.avg, "pm25")}`,
      })),
    [trend.data],
  );
  return (
    <section aria-labelledby="trend-title" className="rounded-xl border border-line bg-surface-1 p-6">
      <h2 id="trend-title" className="text-h2 text-fg">
        The last 24 hours across Lagos
      </h2>
      <p className="mt-2 text-body-lg text-fg-secondary">Average fine particles each hour, all areas together, in µg/m³.</p>
      <div className="mt-6">
        {trend.error ? (
          <ErrorState title="Couldn’t load the trend" detail={errorMessage(trend.error)} onRetry={() => void trend.refetch()} />
        ) : trend.isLoading ? (
          <Skeleton className="h-60" />
        ) : (
          <BarChart
            bars={bars}
            threshold={{ value: 35, label: "35 µg/m³" }}
            formatValue={(v) => formatReading(v, "pm25")}
            ariaLabel="Hourly average fine particles; use the arrow keys to read each hour"
          />
        )}
      </div>
    </section>
  );
}
