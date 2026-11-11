import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api/endpoints";
import { ApiError, errorMessage } from "@/lib/api/client";
import type { IngestionEvent } from "@/lib/api/types";
import { hasRole, useSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatClock, formatDateTime, formatReading, formatUtc } from "@/lib/format";
import { useDevicesLatest } from "@/lib/live/useSiteLatest";
import { METRICS, METRIC_IDS } from "@/lib/metrics";
import { usePageTitle } from "@/components/layout/AppShell";
import { DataTable, type ColumnDef } from "@/components/charts/DataTable";
import { Age } from "@/components/ui/Age";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { SelectField } from "@/components/ui/Field";
import { KeyReveal } from "@/components/ui/KeyReveal";
import { QualityFlag } from "@/components/ui/QualityFlag";
import { StateIcon } from "@/components/ui/StateIcon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { useSites } from "@/features/overview/queries";

const OUTCOME = {
  accepted: { word: "Accepted", cls: "text-fg-secondary" },
  duplicate: { word: "Duplicate, ignored", cls: "text-fg-muted" },
  late: { word: "Late, stored in order", cls: "text-fg-secondary" },
  quarantined: { word: "Quarantined", cls: "text-state-suspicious" },
  rejected: { word: "Rejected", cls: "text-state-critical" },
} as const;

const FAULT_WORD: Record<string, string> = {
  silent: "Went silent",
  drift: "Possible drift",
  spike: "Spike",
  clock_error: "Clock error",
  duplicate: "Duplicates",
  late: "Late readings",
  network: "Network failure",
};

export default function DeviceDetailPage() {
  const { id = "" } = useParams();
  usePageTitle(id, "Metadata, health, latest readings and ingestion outcomes.");
  const qc = useQueryClient();
  const isAdmin = hasRole(useSession((s) => s.user), "admin");
  const device = useQuery({ queryKey: ["device", id], queryFn: ({ signal }) => api.device(id, signal), refetchInterval: 15_000 });
  const health = useQuery({ queryKey: ["device-health", id], queryFn: ({ signal }) => api.deviceHealth(id, signal), refetchInterval: 15_000 });
  const ingestion = useQuery({ queryKey: ["ingestion", id], queryFn: ({ signal }) => api.ingestionEvents(id, signal), refetchInterval: 15_000 });
  const sites = useSites();
  const site = sites.data?.items.find((s) => s.id === device.data?.site_id);
  const latestInput = useMemo(() => [{ id }], [id]);
  const [latest] = useDevicesLatest(latestInput);

  const [rotating, setRotating] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [editing, setEditing] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["device", id] });
    void qc.invalidateQueries({ queryKey: ["device-health", id] });
    void qc.invalidateQueries({ queryKey: ["devices"] });
  };
  const rotate = useMutation({
    mutationFn: () => api.rotateKey(id),
    onSuccess: (r) => {
      setRotating(false);
      setRotatedKey(r.api_key);
      toast({ title: "Key rotated", description: "The old key no longer works." });
    },
  });
  const setStatus = useMutation({
    mutationFn: (status: "active" | "deactivated") => api.updateDevice(id, { status }),
    onSuccess: (d) => {
      setDeactivating(false);
      invalidate();
      toast({ title: d.status === "deactivated" ? "Device deactivated" : "Device reactivated" });
    },
  });

  if (device.error) {
    const notFound = device.error instanceof ApiError && device.error.status === 404;
    return (
      <Card className="p-6">
        <ErrorState
          title={notFound ? `${id} isn’t registered` : "Couldn’t load this device"}
          detail={notFound ? "Check the ID, or find it in the device list." : errorMessage(device.error)}
          onRetry={notFound ? undefined : () => void device.refetch()}
        />
        <div className="flex justify-center">
          <Link to="/devices" className="text-body text-fg-secondary underline-offset-4 hover:underline">
            Back to devices
          </Link>
        </div>
      </Card>
    );
  }

  const d = device.data;
  const deactivated = d?.status === "deactivated";

  return (
    <div className="flex flex-col gap-4">
      <Link to="/devices" className="inline-flex w-fit items-center gap-2 rounded-pill text-body text-fg-secondary hover:text-fg">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        All devices
      </Link>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-6" aria-labelledby="meta-title">
          <CardHeader
            id="meta-title"
            title="Device"
            actions={health.data && <StatusBadge status={health.data.health} />}
          />
          {!d ? (
            <Skeleton className="mt-4 h-40" />
          ) : (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-body">
              <dt className="text-fg-muted">ID</dt>
              <dd className="num text-data text-fg">{d.id}</dd>
              <dt className="text-fg-muted">Type</dt>
              <dd className="text-fg">{d.type === "weather" ? "Weather" : "Air quality"}</dd>
              <dt className="text-fg-muted">Site</dt>
              <dd className="text-fg">{site?.name ?? d.site_id}</dd>
              <dt className="text-fg-muted">Metrics</dt>
              <dd className="text-fg">{(d.metrics ?? []).map((m) => METRICS[m].label).join(", ")}</dd>
              <dt className="text-fg-muted">Last seen</dt>
              <dd className="text-fg">{d.last_seen_at ? <Age at={d.last_seen_at} /> : "Never"}</dd>
            </dl>
          )}
          {isAdmin && d && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button size="sm" onClick={() => setRotating(true)} disabled={deactivated}>
                Rotate key
              </Button>
              {deactivated ? (
                <Button size="sm" onClick={() => setStatus.mutate("active")} loading={setStatus.isPending}>
                  Reactivate
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={() => setDeactivating(true)}>
                  Deactivate
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6" aria-labelledby="latest-title">
          <CardHeader id="latest-title" title="Latest readings" subtitle="Live, with quality" />
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {METRIC_IDS.filter((m) => !d?.metrics || d.metrics.includes(m)).map((m) => {
              const r = latest?.readings[m];
              return (
                <li key={m} className="flex min-h-14 items-center justify-between gap-4 py-2">
                  <div>
                    <p className="text-body text-fg-secondary">{METRICS[m].label}</p>
                    {r && (
                      <p className="text-label text-fg-muted" title={`Event ${formatUtc(r.m.event_time)}, received ${formatUtc(r.m.received_at)}`}>
                        Event {formatClock(r.m.event_time, undefined, true)}, received {formatClock(r.m.received_at, undefined, true)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("num text-reading-md", r && r.q.status !== "valid" ? "text-fg-muted" : "text-fg")}>
                      {r ? formatReading(r.m.value, m) : "–"}
                    </span>
                    {r && <QualityFlag quality={r.q} />}
                  </div>
                </li>
              );
            })}
          </ul>
          {!latest?.readings.temperature_c && !latest?.readings.pm25 && (
            <p className="mt-4 text-body-sm text-fg-muted">
              {deactivated ? "Deactivated devices don’t send readings." : "No live reading yet. Readings arrive every 10 s."}
            </p>
          )}
        </Card>

        <Card className="p-6" aria-labelledby="health-title">
          <CardHeader id="health-title" title="Health timeline" subtitle="Faults detected for this device" />
          {health.isLoading ? (
            <Skeleton className="mt-4 h-40" />
          ) : health.error ? (
            <ErrorState title="Couldn’t load health" detail={errorMessage(health.error)} onRetry={() => void health.refetch()} />
          ) : health.data?.events.length === 0 ? (
            <EmptyState title="No faults detected" description="Silence, drift, spikes and clock errors would appear here." />
          ) : (
            <ol className="mt-4 flex flex-col gap-4">
              {health.data?.events.map((e, i) => (
                <li key={`${e.detected_at}-${i}`} className="flex gap-3">
                  <StateIcon
                    shape={e.fault_type === "silent" ? "octagon" : e.fault_type === "spike" || e.fault_type === "clock_error" ? "diamond" : "triangle"}
                    size={10}
                    className={cn(
                      "mt-1",
                      e.fault_type === "silent" ? "text-state-critical" : e.fault_type === "spike" || e.fault_type === "clock_error" ? "text-state-suspicious" : "text-state-warn",
                    )}
                  />
                  <div>
                    <p className="text-body text-fg">{FAULT_WORD[e.fault_type] ?? e.fault_type}</p>
                    {e.detail && <p className="text-body-sm text-fg-secondary">{e.detail}</p>}
                    <p className="text-body-sm text-fg-muted" title={formatUtc(e.detected_at)}>
                      {formatDateTime(e.detected_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card className="p-6" aria-labelledby="ingest-title">
        <CardHeader id="ingest-title" title="Ingestion outcomes" subtitle="What happened to each message this device sent, newest first" />
        <div className="mt-4">
          <IngestionTable rows={ingestion.data?.items ?? []} loading={ingestion.isLoading} error={ingestion.error} retry={() => void ingestion.refetch()} />
        </div>
      </Card>

      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title={`Rotate the key for ${id}?`}
        description="A new key is issued and the old one stops working at once. Update the device before its next reading, or its readings will be rejected."
        confirmLabel="Rotate key"
        busy={rotate.isPending}
        error={rotate.error ? errorMessage(rotate.error) : null}
        onConfirm={() => rotate.mutate()}
      />
      <Dialog
        open={rotatedKey !== null}
        onOpenChange={(o) => !o && setRotatedKey(null)}
        dismissable={false}
        title="New key issued"
        footer={
          <Button variant="primary" onClick={() => setRotatedKey(null)}>
            I’ve stored the key
          </Button>
        }
      >
        {rotatedKey && <KeyReveal deviceId={id} apiKey={rotatedKey} />}
      </Dialog>
      <ConfirmDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        title={`Deactivate ${id}?`}
        description="Its readings will be rejected at ingestion and it will drop out of maps and averages. History is kept, and you can reactivate it."
        confirmLabel="Deactivate device"
        variant="destructive"
        busy={setStatus.isPending}
        error={setStatus.error ? errorMessage(setStatus.error) : null}
        onConfirm={() => setStatus.mutate("deactivated")}
      />
      {d && isAdmin && <EditDeviceDialog open={editing} onOpenChange={setEditing} id={id} type={d.type} siteId={d.site_id} onSaved={invalidate} />}
    </div>
  );
}

function EditDeviceDialog({
  open,
  onOpenChange,
  id,
  type,
  siteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  id: string;
  type: string;
  siteId: string;
  onSaved: () => void;
}) {
  const sites = useSites();
  const [form, setForm] = useState({ type, siteId });
  const save = useMutation({
    mutationFn: () => api.updateDevice(id, { type: form.type, site_id: form.siteId }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
      toast({ title: "Device saved" });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${id}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save device
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SelectField
          label="Type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          options={[
            { value: "air-quality", label: "Air quality" },
            { value: "weather", label: "Weather" },
          ]}
        />
        <SelectField
          label="Site"
          value={form.siteId}
          onChange={(e) => setForm({ ...form, siteId: e.target.value })}
          options={(sites.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          hint="Moving a device changes which site its readings count towards from now on."
        />
        {save.error && (
          <p role="alert" className="text-body-sm text-state-critical">
            {errorMessage(save.error)}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function IngestionTable({ rows, loading, error, retry }: { rows: IngestionEvent[]; loading: boolean; error: unknown; retry: () => void }) {
  const columns = useMemo<ColumnDef<IngestionEvent, unknown>[]>(
    () => [
      {
        id: "received",
        header: "Received",
        accessorFn: (r) => Date.parse(r.received_at),
        cell: ({ row }) => (
          <span className="num text-data text-fg" title={formatUtc(row.original.received_at)}>
            {formatClock(row.original.received_at, undefined, true)}
          </span>
        ),
        meta: { width: "130px" },
      },
      {
        id: "outcome",
        header: "Outcome",
        accessorFn: (r) => r.outcome,
        cell: ({ row }) => <span className={OUTCOME[row.original.outcome].cls}>{OUTCOME[row.original.outcome].word}</span>,
        meta: { width: "200px" },
      },
      { id: "reason", header: "Reason", accessorFn: (r) => r.reason ?? "", cell: ({ getValue }) => (getValue() as string) || "–", meta: { width: "minmax(200px,2fr)" } },
      {
        id: "reading",
        header: "Reading ID",
        accessorFn: (r) => r.reading_id,
        cell: ({ getValue }) => <span className="num text-data">{getValue() as string}</span>,
        meta: { width: "minmax(180px,1fr)" },
      },
    ],
    [],
  );
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => `${r.reading_id}-${r.outcome}-${r.received_at}`}
      caption="Ingestion outcomes"
      height={360}
      compact
      loading={loading}
      error={error ? { title: "Couldn’t load ingestion outcomes", detail: errorMessage(error), onRetry: retry } : null}
      empty={{ title: "No messages yet", description: "Each message the device sends is listed here with what happened to it." }}
    />
  );
}
