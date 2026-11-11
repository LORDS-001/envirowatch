import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { Alert } from "@/lib/api/types";
import { formatClock, formatReading, formatUtc } from "@/lib/format";
import { useDevicesLatest } from "@/lib/live/useSiteLatest";
import { METRICS } from "@/lib/metrics";
import { usePageTitle } from "@/components/layout/AppShell";
import { LineChart } from "@/components/charts/LineChart";
import { AlertRow } from "@/components/domain/AlertRow";
import { AlertTimeline, resolveRule } from "@/components/domain/AlertTimeline";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { InlineSelect, Segmented } from "@/components/ui/Field";
import { QualityFlag } from "@/components/ui/QualityFlag";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { useDevices, useSites } from "@/features/overview/queries";

type StateFilter = "open" | "active" | "pending" | "acknowledged" | "resolved" | "all";
type KindFilter = "all" | "environment" | "device";

const STATE_OPTIONS: ReadonlyArray<{ value: StateFilter; label: string }> = [
  { value: "open", label: "Open" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

const ORDER = { active: 0, pending: 1, acknowledged: 2, resolved: 3 } as const;

export function useAllAlerts() {
  return useQuery({ queryKey: ["alerts", "all"], queryFn: ({ signal }) => api.alerts({}, signal), refetchInterval: 20_000 });
}

export default function AlertsPage() {
  usePageTitle("Alerts", "Environmental hazards and device faults, with every step recorded.");
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<StateFilter>("open");
  const [kind, setKind] = useState<KindFilter>("all");
  const [site, setSite] = useState("");
  const alerts = useAllAlerts();
  const sites = useSites();
  const siteName = useMemo(() => new Map((sites.data?.items ?? []).map((s) => [s.id, s.name])), [sites.data]);

  const filtered = useMemo(() => {
    const list = alerts.data?.items ?? [];
    return list
      .filter((a) => (state === "all" ? true : state === "open" ? a.status !== "resolved" : a.status === state))
      .filter((a) => kind === "all" || a.kind === kind)
      .filter((a) => !site || a.site_id === site)
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || Date.parse(b.opened_at) - Date.parse(a.opened_at));
  }, [alerts.data, state, kind, site]);

  const alertSites = useMemo(
    () => [...new Set((alerts.data?.items ?? []).map((a) => a.site_id).filter(Boolean) as string[])],
    [alerts.data],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <Segmented label="State" value={state} onChange={setState} options={STATE_OPTIONS} />
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All kinds" },
            { value: "environment", label: "Environment" },
            { value: "device", label: "Device" },
          ]}
        />
        <InlineSelect
          label="Site"
          className="w-56"
          value={site}
          onChange={(e) => setSite(e.target.value)}
          options={[{ value: "", label: "All sites" }, ...alertSites.map((s) => ({ value: s, label: siteName.get(s) ?? s }))]}
        />
        <p className="ml-auto text-body-sm text-fg-muted" aria-live="polite">
          {alerts.data ? `${filtered.length} alert${filtered.length === 1 ? "" : "s"}` : ""}
        </p>
      </Card>

      <Card className="p-2">
        {alerts.error ? (
          <ErrorState title="Couldn’t load alerts" detail={errorMessage(alerts.error)} onRetry={() => void alerts.refetch()} />
        ) : alerts.isLoading ? (
          <div className="flex flex-col gap-2 p-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={state === "open" ? "No open alerts" : "No alerts match these filters"}
            description={state === "open" ? "Threshold and device-health alerts appear here as they open." : "Clear a filter to see more."}
            action={
              state !== "open" || kind !== "all" || site ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setState("open");
                    setKind("all");
                    setSite("");
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {filtered.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </ul>
        )}
      </Card>

      <AlertDrawer id={id ?? null} onClose={() => navigate("/alerts")} siteName={siteName} />
    </div>
  );
}

function AlertDrawer({ id, onClose, siteName }: { id: string | null; onClose: () => void; siteName: Map<string, string> }) {
  const qc = useQueryClient();
  const alert = useQuery({
    queryKey: ["alerts", "one", id],
    queryFn: ({ signal }) => api.alert(id!, signal),
    enabled: !!id,
    refetchInterval: 5_000,
  });
  const ack = useMutation({
    mutationFn: (alertId: string) => api.acknowledgeAlert(alertId),
    onSuccess: (a) => {
      qc.setQueryData(["alerts", "one", a.id], a);
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      toast({ title: "Alert acknowledged", description: a.title });
    },
    onError: (err) => toast({ tone: "error", title: "Couldn’t acknowledge the alert", description: errorMessage(err) }),
  });
  const a = alert.data;

  return (
    <Drawer
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      label={a ? `Alert: ${a.title}` : "Alert"}
      header={
        a && (
          <div className="flex items-center gap-2">
            <StatusBadge status={a.status} />
            <span className="text-eyebrow text-fg-muted">{a.kind === "device" ? "Device" : "Environment"}</span>
          </div>
        )
      }
      title={a?.title ?? (alert.error ? "Alert" : "Loading alert…")}
      footer={
        a && (a.status === "active" || a.status === "pending") ? (
          <Button variant="primary" loading={ack.isPending} onClick={() => ack.mutate(a.id)}>
            Acknowledge alert
          </Button>
        ) : a?.status === "acknowledged" ? (
          <p className="mr-auto text-body-sm text-fg-secondary">Acknowledged. {resolveRule(a)}.</p>
        ) : undefined
      }
    >
      {alert.error ? (
        <ErrorState title="Couldn’t load this alert" detail={errorMessage(alert.error)} onRetry={() => void alert.refetch()} />
      ) : !a ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <p className="text-body text-fg-secondary">
            {a.site_id ? `${siteName.get(a.site_id) ?? a.site_id}. ` : ""}
            Opened{" "}
            <time dateTime={a.opened_at} title={formatUtc(a.opened_at)}>
              {formatClock(a.opened_at)}
            </time>
            {a.corroborating_devices ? `. ${a.corroborating_devices} nearby sensors agree, so this is unlikely to be one faulty sensor.` : "."}
          </p>
          <section aria-labelledby="ctx-title">
            <h3 id="ctx-title" className="text-h3 text-fg">
              {a.kind === "device" ? "Recent readings from this device" : "Around the alert"}
            </h3>
            <ContextChart alert={a} />
          </section>
          <section aria-labelledby="timeline-title">
            <h3 id="timeline-title" className="mb-4 text-h3 text-fg">
              Timeline
            </h3>
            <AlertTimeline alert={a} />
          </section>
          {a.site_id && (
            <section aria-labelledby="nearby-title">
              <h3 id="nearby-title" className="text-h3 text-fg">
                {a.kind === "device" ? "Other sensors at this site" : "Sensors at this site"}
              </h3>
              <NearbySensors siteId={a.site_id} alert={a} />
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

function ContextChart({ alert }: { alert: Alert }) {
  const metric = alert.metric ?? "pm25";
  const opened = Date.parse(alert.opened_at);
  const from = opened - 45 * 60_000;
  // Up to the moment the drawer opened; stable so the query key doesn't change every render.
  const [to] = useState(() => Date.now());
  const q = useQuery({
    queryKey: ["alert-context", alert.id, metric],
    queryFn: ({ signal }) =>
      api.aggregates(
        {
          metric,
          from: new Date(from).toISOString(),
          to: new Date(to).toISOString(),
          bucket: "1m",
          group_by: alert.device_id ? "device" : "site",
          site_id: alert.site_id ?? undefined,
          device_id: alert.device_id ?? undefined,
        },
        signal,
      ),
    enabled: !!(alert.site_id || alert.device_id),
    staleTime: 30_000,
  });
  const def = METRICS[metric];
  const series = useMemo(
    () => [
      {
        id: "ctx",
        label: alert.device_id ?? "Site mean",
        color: "series-1" as const,
        points: (q.data?.items ?? []).map((r) => ({ t: Date.parse(r.bucket_start), v: r.avg, quality: "valid" as const })),
      },
    ],
    [q.data, alert.device_id],
  );
  if (q.error) return <ErrorState title="Couldn’t load the readings" detail={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Skeleton className="mt-4 h-52" />;
  if (alert.kind === "device" && alert.device_id && series[0]!.points.length === 0) {
    return <p className="mt-2 text-body-sm text-fg-secondary">No readings in this window.</p>;
  }
  return (
    <div className="mt-4">
      <LineChart
        series={series}
        gapMs={150_000}
        formatValue={(v) => formatReading(v, metric)}
        threshold={alert.threshold !== null ? { value: alert.threshold, label: `${alert.threshold} ${def.unit} limit` } : undefined}
        marker={{ t: opened, label: "Opened" }}
        height={200}
        ariaLabel={`${def.label} per minute around the alert`}
      />
      <p className="mt-2 text-body-sm text-fg-muted">
        Per-minute mean, {def.unit}. {alert.kind === "device" ? "A silent device shows as a gap." : ""}
      </p>
    </div>
  );
}

function NearbySensors({ siteId, alert }: { siteId: string; alert: Alert }) {
  const devices = useDevices();
  const list = useMemo(() => (devices.data?.items ?? []).filter((d) => d.site_id === siteId).slice(0, 24), [devices.data, siteId]);
  const latest = useDevicesLatest(list);
  const metric = alert.metric ?? "pm25";
  if (devices.isLoading) return <Skeleton className="mt-4 h-32" />;
  return (
    <ul className="mt-4 divide-y divide-line border-y border-line">
      {latest.map((d) => {
        const r = d.readings[metric] ?? d.readings.temperature_c;
        const isAlertDevice = d.deviceId === alert.device_id;
        return (
          <li key={d.deviceId} className="flex h-10 items-center justify-between gap-4">
            <Link to={`/devices/${d.deviceId}`} className="num text-data text-fg-secondary hover:text-fg hover:underline">
              {d.deviceId}
              {isAlertDevice && <span className="ml-2 font-sans text-label text-fg-muted">(this alert)</span>}
            </Link>
            <span className="flex items-center gap-3">
              {r ? (
                <>
                  <QualityFlag quality={r.q} />
                  <span className="num w-24 text-right text-data text-fg">{formatReading(r.m.value, r.m.metric)}</span>
                </>
              ) : (
                <span className="text-body-sm text-fg-muted">No live reading</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
