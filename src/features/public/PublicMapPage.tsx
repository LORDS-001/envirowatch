import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { Site } from "@/lib/api/types";
import { formatMetricValue } from "@/lib/format";
import { METRICS, type MetricId } from "@/lib/metrics";
import { HeatLegend } from "@/components/map/HeatLegend";
import { HeatMap } from "@/components/map/HeatMap";
import { idwCaption } from "@/components/map/IdwMiniMap";
import { ErrorState } from "@/components/ui/Feedback";
import { Segmented } from "@/components/ui/Field";
import { usePublicSummary } from "./publicData";

export default function PublicMapPage() {
  useEffect(() => {
    document.title = "Map | EnviroWatch";
  }, []);
  const [metric, setMetric] = useState<MetricId>("pm25");
  const heat = useQuery({ queryKey: ["public", "heatmap", metric], queryFn: ({ signal }) => api.publicHeatmap(metric, signal), refetchInterval: 60_000 });
  const summary = usePublicSummary();
  const sites: Site[] = useMemo(
    () =>
      (summary.data?.areas ?? []).map((a) => ({ id: a.site_id, organization_id: "public", name: a.name, latitude: a.latitude, longitude: a.longitude })),
    [summary.data],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const samples = heat.data?.samples ?? [];
  const chosen = samples.find((s) => s.site_id === selected);
  const chosenName = sites.find((s) => s.id === selected)?.name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display-lg text-fg">Map</h1>
        <p className="mt-2 max-w-[60ch] text-body-lg text-fg-secondary">
          Colour shows the estimated level between sensors. Markers are the sensor areas; pick one to read its value.
        </p>
      </div>
      <Segmented
        label="What to show"
        value={metric}
        onChange={(m) => {
          setMetric(m);
          setSelected(null);
        }}
        options={[
          { value: "pm25", label: "Fine particles" },
          { value: "temperature_c", label: "Temperature" },
        ]}
      />
      {heat.error ? (
        <ErrorState title="Couldn’t load the map" detail={errorMessage(heat.error)} onRetry={() => void heat.refetch()} />
      ) : (
        <div className="relative h-[60dvh] min-h-[360px] overflow-hidden rounded-xl border border-line">
          <HeatMap metric={metric} samples={samples} sites={sites} selectedSite={selected} onSelectSite={setSelected} className="absolute inset-0" />
          {chosen && chosenName && (
            <div role="status" className="absolute top-4 right-4 z-[500] rounded-lg border border-line bg-surface-1 p-4">
              <p className="text-body-lg text-fg">{chosenName}</p>
              <p className="flex items-baseline gap-1">
                <span className="num text-reading-xl text-fg">{formatMetricValue(chosen.value, metric)}</span>
                <span className="text-body text-fg-muted">{METRICS[metric].unit}</span>
              </p>
              <p className="text-body-sm text-fg-muted">Measured, {chosen.device_count} sensors</p>
            </div>
          )}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <HeatLegend metric={metric} />
        <p className="text-body text-fg-muted">{idwCaption(samples.length)} Blank areas have no sensor close enough to estimate.</p>
      </div>
      {/* The same areas as the markers, as a list: easier on small screens and with a keyboard. */}
      <section aria-labelledby="area-list-title">
        <h2 id="area-list-title" className="text-h2 text-fg">
          Areas
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...sites]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => {
              const v = samples.find((x) => x.site_id === s.id)?.value;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={selected === s.id}
                    onClick={() => setSelected(s.id)}
                    className="flex h-11 w-full items-center justify-between rounded-pill border border-line bg-surface-1 px-4 text-left hover:bg-surface-2 aria-pressed:border-brand aria-pressed:bg-brand-subtle"
                  >
                    <span className="truncate text-body-lg text-fg">{s.name}</span>
                    <span className="num text-data text-fg-secondary">
                      {v === undefined ? "–" : `${formatMetricValue(v, metric)} ${METRICS[metric].unit}`}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      </section>
    </div>
  );
}
