import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { create } from "zustand";
import { Download, FileText, LoaderCircle } from "lucide-react";
import { api, type ExportQuery } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { isMetricId, METRICS, METRIC_IDS, type MetricId } from "@/lib/metrics";
import { usePageTitle } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { Checkbox, Segmented, Switch } from "@/components/ui/Field";
import { SearchField } from "@/components/ui/SearchField";
import { StateIcon } from "@/components/ui/StateIcon";
import { toast } from "@/components/ui/Toast";
import { useSites } from "@/features/overview/queries";

interface Job {
  id: number;
  query: ExportQuery;
  label: string;
  status: "preparing" | "ready" | "failed";
  createdAt: number;
  url?: string;
  filename?: string;
  sizeKb?: number;
  error?: string;
}

/** Export jobs for this session (in memory; download links are object URLs). */
const useJobs = create<{ jobs: Job[]; put: (j: Job) => void }>((set) => ({
  jobs: [],
  put: (j) => set((s) => ({ jobs: [j, ...s.jobs.filter((x) => x.id !== j.id)] })),
}));

type RangeKey = "24h" | "7d" | "30d" | "custom";
const RANGE_MS = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 } as const;
const toLocal = (t: number) => new Date(t - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

let nextJob = 0;

export default function ReportsPage() {
  usePageTitle("Reports", "Export readings with units, time range and quality notes.");
  const [params] = useSearchParams();
  const sites = useSites();
  const jobs = useJobs((s) => s.jobs);
  const put = useJobs((s) => s.put);

  // Prefill from analytics ("Export" there links here).
  const preFrom = params.get("from");
  const preTo = params.get("to");
  const [range, setRange] = useState<RangeKey>(preFrom && preTo ? "custom" : "24h");
  const [from, setFrom] = useState(() => toLocal(preFrom ? Date.parse(preFrom) : Date.now() - 86_400_000));
  const [to, setTo] = useState(() => toLocal(preTo ? Date.parse(preTo) : Date.now()));
  const [siteIds, setSiteIds] = useState<string[]>(() => params.getAll("sites").flatMap((s) => s.split(",")).filter(Boolean));
  const [metrics, setMetrics] = useState<MetricId[]>(() => {
    const m = params.getAll("metrics").flatMap((s) => s.split(",")).filter(isMetricId);
    return m.length ? m : ["pm25"];
  });
  const [format, setFormat] = useState<"csv" | "pdf">("csv");
  const [notes, setNotes] = useState(true);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const siteList = sites.data?.items ?? [];
  const shown = useMemo(() => siteList.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase())), [siteList, filter]);
  const allSites = siteIds.length === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = Date.now();
    const win = range === "custom" ? { from: Date.parse(from), to: Date.parse(to) } : { from: now - RANGE_MS[range], to: now };
    if (!(win.to > win.from)) return setError("The end must be after the start.");
    if (win.to - win.from > 90 * 86_400_000) return setError("Exports are limited to 90 days. Shorten the range.");
    if (metrics.length === 0) return setError("Choose at least one metric.");
    setError(null);
    const query: ExportQuery = {
      format,
      site_ids: siteIds,
      metrics,
      from: new Date(win.from).toISOString(),
      to: new Date(Math.min(win.to, now)).toISOString(),
      quality_notes: notes,
    };
    const label = `${metrics.map((m) => METRICS[m].label).join(", ")} · ${allSites ? "all sites" : `${siteIds.length} site${siteIds.length === 1 ? "" : "s"}`} · ${format.toUpperCase()}`;
    const job: Job = { id: ++nextJob, query, label, status: "preparing", createdAt: now };
    put(job);
    try {
      const { blob, filename } = await api.exportReport(query);
      put({ ...job, status: "ready", url: URL.createObjectURL(blob), filename: filename ?? `envirowatch.${format}`, sizeKb: Math.max(1, Math.round(blob.size / 1024)) });
      toast({ title: "Export ready", description: label });
    } catch (err) {
      put({ ...job, status: "failed", error: errorMessage(err) });
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Card className="p-6" aria-labelledby="build-title">
        <CardHeader id="build-title" title="Build an export" subtitle="Hourly min, max, mean and valid-reading count per site (daily beyond 7 days)" />
        <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-label text-fg-secondary">Metrics</legend>
            {METRIC_IDS.map((m) => (
              <Checkbox
                key={m}
                label={`${METRICS[m].label} (${METRICS[m].unit})`}
                checked={metrics.includes(m)}
                onCheckedChange={(v) => setMetrics(v ? [...metrics, m] : metrics.filter((x) => x !== m))}
              />
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-label text-fg-secondary">Time range</legend>
            <Segmented
              label="Time range"
              value={range}
              onChange={setRange}
              options={[
                { value: "24h", label: "Last 24 h" },
                { value: "7d", label: "Last 7 days" },
                { value: "30d", label: "Last 30 days" },
                { value: "custom", label: "Custom" },
              ]}
            />
            {range === "custom" && (
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-2 text-label text-fg-secondary">
                  From
                  <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="num h-9 rounded-pill border border-line bg-surface-2 px-4 text-data text-fg" />
                </label>
                <label className="flex flex-col gap-2 text-label text-fg-secondary">
                  To
                  <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="num h-9 rounded-pill border border-line bg-surface-2 px-4 text-data text-fg" />
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-label text-fg-secondary">Sites</legend>
            <div className="flex flex-wrap items-center gap-2">
              <SearchField label="Filter sites" placeholder="Filter sites" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-64" />
              <Button size="sm" variant="ghost" onClick={() => setSiteIds([])} disabled={allSites}>
                All sites
              </Button>
              <span className="text-body-sm text-fg-muted">{allSites ? "All 46 sites" : `${siteIds.length} selected`}</span>
            </div>
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-2">
              {shown.map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.name}
                  checked={siteIds.includes(s.id)}
                  onCheckedChange={(v) => setSiteIds(v ? [...siteIds, s.id] : siteIds.filter((x) => x !== s.id))}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-label text-fg-secondary">Format</legend>
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={[
                { value: "csv", label: "CSV" },
                { value: "pdf", label: "PDF" },
              ]}
            />
            <Switch label="Include quality notes" checked={notes} onCheckedChange={setNotes} />
            <p className="text-body-sm text-fg-muted">
              Every export states its units and time range (UTC). Quality notes explain what was excluded and why.
            </p>
          </fieldset>

          {error && (
            <p role="alert" className="text-body-sm text-state-critical">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" variant="primary" icon={<FileText size={16} strokeWidth={1.5} aria-hidden="true" />}>
              Create export
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6" aria-labelledby="jobs-title">
        <CardHeader id="jobs-title" title="Exports" subtitle="This session, newest first" />
        {jobs.length === 0 ? (
          <EmptyState title="No exports yet" description="Build one on the left. It appears here while it’s prepared, then as a download." />
        ) : (
          <ul className="mt-4 flex flex-col gap-2" aria-live="polite">
            {jobs.map((j) => (
              <li key={j.id} className="rounded-md border border-line p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-body text-fg">{j.label}</p>
                    <p className="mt-1 text-body-sm text-fg-muted">
                      {formatDateTime(j.query.from)} to {formatDateTime(j.query.to)}
                    </p>
                  </div>
                  {j.status === "ready" && j.url ? (
                    <a
                      href={j.url}
                      download={j.filename}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-pill bg-brand px-3 text-label font-medium text-on-brand hover:bg-brand-hover"
                    >
                      <Download size={14} strokeWidth={2} aria-hidden="true" />
                      Download
                    </a>
                  ) : null}
                </div>
                <p className="mt-2 flex items-center gap-2 text-body-sm">
                  {j.status === "preparing" && (
                    <>
                      <LoaderCircle size={14} strokeWidth={1.5} className="animate-spin text-fg-muted" aria-hidden="true" />
                      <span className="text-fg-secondary">Preparing…</span>
                    </>
                  )}
                  {j.status === "ready" && (
                    <span className="text-fg-secondary">
                      Ready, {j.filename}, {j.sizeKb} KB
                    </span>
                  )}
                  {j.status === "failed" && (
                    <span className="flex items-center gap-2 text-state-critical">
                      <StateIcon shape="octagon" size={10} />
                      Export failed: {j.error}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
