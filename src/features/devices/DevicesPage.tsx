import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { Device, DeviceHealthStatus } from "@/lib/api/types";
import { hasRole, useSession } from "@/lib/auth/session";
import { METRICS } from "@/lib/metrics";
import { useLive } from "@/lib/realtime/hooks";
import { staleAfterMs } from "@/lib/config";
import { usePageTitle } from "@/components/layout/AppShell";
import { TreeSidebar } from "@/components/layout/TreeSidebar";
import { DataTable, type ColumnDef } from "@/components/charts/DataTable";
import { InlineSelect } from "@/components/ui/Field";
import { Age } from "@/components/ui/Age";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { SearchField } from "@/components/ui/SearchField";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { useSites } from "@/features/overview/queries";
import { useHealthSummary } from "@/features/health/HealthPage";
import { RegisterDeviceDialog } from "./RegisterDeviceDialog";

export default function DevicesPage() {
  usePageTitle("Devices", "Registered sensors, their sites, health and keys.");
  const [params] = useSearchParams();
  // Admins in more than one organization can switch; the API refuses other tenants (NFR-007).
  const organizationId = params.get("organization_id") ?? undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const org = useSession((s) => s.organization);
  const isAdmin = hasRole(user, "admin");

  const devices = useQuery({
    queryKey: ["devices", organizationId ?? "own"],
    queryFn: ({ signal }) => api.devices({ organization_id: organizationId }, signal),
    refetchInterval: 30_000,
  });
  const sites = useSites();
  const health = useHealthSummary();
  const lastSeenLive = useLive((s) => s.deviceLastSeen);
  const flushedAt = useLive((s) => s.flushedAt);

  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [registering, setRegistering] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const healthById = useMemo(() => new Map((health.data?.items ?? []).map((h) => [h.device_id, h.health])), [health.data]);
  const siteName = useMemo(() => new Map((sites.data?.items ?? []).map((s) => [s.id, s.name])), [sites.data]);
  const all = useMemo(() => devices.data?.items ?? [], [devices.data]);

  const healthOf = (d: Device): DeviceHealthStatus => {
    if (d.status === "deactivated") return "deactivated";
    const known = healthById.get(d.id);
    const seen = Math.max(lastSeenLive[d.id] ?? 0, d.last_seen_at ? Date.parse(d.last_seen_at) : 0);
    const now = flushedAt || Date.now();
    // Live data wins for silence: a device that just reported is online whatever the last poll said.
    if (seen && now - seen <= staleAfterMs) return known && known !== "silent" ? known : "online";
    return known ?? "silent";
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Site names go into the row data: the table caches accessor values per row.
    return all
      .map((d) => ({ ...d, siteName: siteName.get(d.site_id) ?? d.site_id }))
      .filter((d) => (!siteFilter || d.site_id === siteFilter) && (!q || d.id.includes(q) || d.siteName.toLowerCase().includes(q)));
  }, [all, siteFilter, search, siteName]);

  const tree = useMemo(
    () =>
      (sites.data?.items ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        devices: all.filter((d) => d.site_id === s.id).map((d) => ({ id: d.id, flagged: (healthById.get(d.id) ?? "online") !== "online" })),
      })),
    [sites.data, all, healthById],
  );

  const selectedIds = Object.keys(selection).filter((k) => selection[k]);
  const bulk = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await api.updateDevice(id, { status: "deactivated" });
      return ids.length;
    },
    onSuccess: (n) => {
      setConfirmBulk(false);
      setSelection({});
      void qc.invalidateQueries({ queryKey: ["devices"] });
      void qc.invalidateQueries({ queryKey: ["health-summary"] });
      toast({ title: `${n} device${n === 1 ? "" : "s"} deactivated`, description: "They no longer accept readings." });
    },
  });

  const columns = useMemo<ColumnDef<Device & { siteName: string }, unknown>[]>(
    () => [
      {
        id: "id",
        header: "Device",
        accessorFn: (d) => d.id,
        cell: ({ row }) => (
          <Link to={`/devices/${row.original.id}`} className="num text-data text-fg hover:underline">
            {row.original.id}
          </Link>
        ),
        meta: { width: "130px" },
      },
      { id: "type", header: "Type", accessorFn: (d) => d.type, cell: ({ row }) => (row.original.type === "weather" ? "Weather" : "Air quality"), meta: { width: "110px" } },
      { id: "site", header: "Site", accessorFn: (d) => d.siteName, meta: { width: "minmax(120px,1fr)" } },
      {
        id: "health",
        header: "Status",
        accessorFn: (d) => healthOf(d),
        cell: ({ row }) => <StatusBadge status={healthOf(row.original)} />,
        meta: { width: "140px" },
      },
      {
        id: "seen",
        header: "Last seen",
        accessorFn: (d) => Math.max(lastSeenLive[d.id] ?? 0, d.last_seen_at ? Date.parse(d.last_seen_at) : 0),
        cell: ({ getValue }) => ((getValue() as number) ? <Age at={getValue() as number} /> : "Never"),
        meta: { width: "110px" },
      },
      {
        id: "metrics",
        header: "Metrics",
        accessorFn: (d) => (d.metrics ?? []).map((m) => METRICS[m].label).join(", "),
        meta: { width: "minmax(160px,1fr)" },
        enableSorting: false,
      },
    ],
    // healthOf reads live data each render; columns rebuild when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siteName, healthById, lastSeenLive, flushedAt],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <TreeSidebar
        organization={org?.name ?? "Organization"}
        sites={tree}
        selectedSite={siteFilter}
        onSelectSite={setSiteFilter}
        className="max-h-[calc(100dvh-140px)] overflow-y-auto max-lg:hidden"
      />
      <Card className="flex min-w-0 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Below 1024 px the site tree would push the list off-screen; a picker does the same job. */}
          <InlineSelect
            label="Site"
            value={siteFilter ?? ""}
            onChange={(e) => setSiteFilter(e.target.value || null)}
            options={[{ value: "", label: "All sites" }, ...(sites.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))]}
            className="w-full sm:w-56 lg:hidden"
          />
          <SearchField label="Filter devices" placeholder="Filter by ID or site" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-72" />
          <p className="text-body-sm text-fg-muted" aria-live="polite">
            {devices.data ? `${rows.length} of ${all.length} devices${siteFilter ? ` at ${siteName.get(siteFilter)}` : ""}` : ""}
          </p>
          {isAdmin && (
            <div className="ml-auto flex gap-2">
              {selectedIds.length > 0 && (
                <Button variant="destructive" onClick={() => setConfirmBulk(true)}>
                  Deactivate {selectedIds.length}
                </Button>
              )}
              {/* Waits for the device list: the next free ID and duplicate checks depend on it. */}
              <Button
                variant="primary"
                icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />}
                onClick={() => setRegistering(true)}
                disabled={!devices.data}
              >
                Register device
              </Button>
            </div>
          )}
        </div>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(d) => d.id}
          caption="Devices"
          height={560}
          loading={devices.isLoading}
          error={devices.error ? { title: "Couldn’t load devices", detail: errorMessage(devices.error), onRetry: () => void devices.refetch() } : null}
          empty={{
            title: search || siteFilter ? "No devices match" : "No devices yet",
            description: search || siteFilter ? "Clear the filter or pick another site." : "Register a device to start receiving readings.",
          }}
          selection={isAdmin ? { value: selection, onChange: setSelection } : undefined}
          onRowOpen={(d) => navigate(`/devices/${d.id}`)}
        />
        {isAdmin && <p className="text-body-sm text-fg-muted max-sm:hidden">Space selects a row, Enter opens it.</p>}
      </Card>

      {/* Mounted on open, so the suggested ID and site reflect the loaded device list. */}
      {isAdmin && registering && (
        <RegisterDeviceDialog
          open={registering}
          onOpenChange={setRegistering}
          sites={sites.data?.items ?? []}
          existing={all.map((d) => d.id)}
          defaultSite={siteFilter}
        />
      )}
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Deactivate ${selectedIds.length} device${selectedIds.length === 1 ? "" : "s"}?`}
        description="Deactivated devices stop being accepted at ingestion. Their history stays. You can reactivate them from each device page."
        confirmLabel="Deactivate devices"
        variant="destructive"
        busy={bulk.isPending}
        error={bulk.error ? errorMessage(bulk.error) : null}
        onConfirm={() => bulk.mutate(selectedIds)}
      />
    </div>
  );
}
