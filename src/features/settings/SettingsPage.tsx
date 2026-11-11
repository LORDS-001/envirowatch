import { useMemo, useState, type FormEvent } from "react";
import { NavLink, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { AlertRule, Channel, Retention, Role, Site, User } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { METRICS } from "@/lib/metrics";
import { usePageTitle } from "@/components/layout/AppShell";
import { DataTable, type ColumnDef } from "@/components/charts/DataTable";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorState, Skeleton } from "@/components/ui/Feedback";
import { Checkbox, InlineSelect, SelectField, Switch, TextField } from "@/components/ui/Field";
import { toast } from "@/components/ui/Toast";
import { useDevices, useSites } from "@/features/overview/queries";

const SECTIONS = [
  { path: "organization", label: "Organization" },
  { path: "users", label: "Users and roles" },
  { path: "sites", label: "Sites" },
  { path: "alert-rules", label: "Alert rules" },
  { path: "retention", label: "Data retention" },
] as const;
type Section = (typeof SECTIONS)[number]["path"];

export default function SettingsPage() {
  const params = useParams();
  const section = (SECTIONS.find((s) => s.path === params["*"])?.path ?? "organization") as Section;
  usePageTitle("Settings", SECTIONS.find((s) => s.path === section)!.label);

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Settings" className="h-fit rounded-lg border border-line bg-surface-1 p-2">
        <ul className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <li key={s.path}>
              <NavLink
                to={`/settings/${s.path}`}
                className={() =>
                  cn(
                    "flex h-10 items-center rounded-md px-3 text-body",
                    s.path === section ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-2 hover:text-fg",
                  )
                }
                aria-current={s.path === section ? "page" : undefined}
              >
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        {section === "organization" && <OrganizationSection />}
        {section === "users" && <UsersSection />}
        {section === "sites" && <SitesSection />}
        {section === "alert-rules" && <RulesSection />}
        {section === "retention" && <RetentionSection />}
      </div>
    </div>
  );
}

// ---- Organization ----

function OrganizationSection() {
  const org = useSession((s) => s.organization);
  const [name, setName] = useState(org?.name ?? "");
  const save = useMutation({
    mutationFn: () => api.updateOrganization(name.trim()),
    onSuccess: (o) => {
      useSession.setState({ organization: o });
      toast({ title: "Organization saved" });
    },
  });
  return (
    <Card className="p-6">
      <CardHeader title="Organization" subtitle="Shown in the top bar and on exports. Every device, site and user belongs to it." />
      <form
        className="mt-6 flex max-w-md flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!name.trim() ? "Enter an organization name" : save.error ? errorMessage(save.error) : null} />
        <TextField label="Organization ID" mono value={org?.id ?? ""} readOnly hint="Used by the API to keep tenants apart. It can’t be changed." />
        <div>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim() || name.trim() === org?.name}>
            Save organization
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---- Users ----

function UsersSection() {
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const users = useQuery({ queryKey: ["users"], queryFn: ({ signal }) => api.users(signal) });
  const [inviting, setInviting] = useState(false);
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.updateUser(id, role),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "Role changed", description: `${u.email} is now ${u.role === "admin" ? "an administrator" : "an operator"}.` });
    },
    onError: (err) => toast({ tone: "error", title: "Couldn’t change the role", description: errorMessage(err) }),
  });

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      { id: "email", header: "Email", accessorFn: (u) => u.email, meta: { width: "minmax(220px,2fr)" } },
      {
        id: "role",
        header: "Role",
        accessorFn: (u) => u.role,
        cell: ({ row }) =>
          row.original.id === me?.id ? (
            <span>Administrator (you)</span>
          ) : (
            <InlineSelect
              label={`Role for ${row.original.email}`}
              className="w-44"
              value={row.original.role}
              onChange={(e) => setRole.mutate({ id: row.original.id, role: e.target.value as Role })}
              options={[
                { value: "operator", label: "Operator" },
                { value: "admin", label: "Administrator" },
              ]}
            />
          ),
        meta: { width: "220px" },
      },
    ],
    [me?.id, setRole],
  );

  return (
    <Card className="p-6">
      <CardHeader
        title="Users and roles"
        subtitle="Operators watch, investigate and acknowledge. Administrators also manage devices, sites, rules and retention."
        actions={
          <Button variant="primary" icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} onClick={() => setInviting(true)}>
            Invite user
          </Button>
        }
      />
      <div className="mt-6">
        <DataTable
          data={users.data?.items ?? []}
          columns={columns}
          getRowId={(u) => u.id}
          caption="Users"
          height={400}
          loading={users.isLoading}
          error={users.error ? { title: "Couldn’t load users", detail: errorMessage(users.error), onRetry: () => void users.refetch() } : null}
        />
      </div>
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </Card>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [touched, setTouched] = useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const invite = useMutation({
    mutationFn: () => api.inviteUser(email.trim(), role),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User invited", description: u.email });
      onOpenChange(false);
      setEmail("");
      setTouched(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite user"
      description="They get an email to set a password."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="invite-user" loading={invite.isPending}>
            Invite user
          </Button>
        </>
      }
    >
      <form
        id="invite-user"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (valid) invite.mutate();
        }}
      >
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={touched && !valid ? "Enter a valid email address" : invite.error ? errorMessage(invite.error) : null}
        />
        <SelectField
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={[
            { value: "operator", label: "Operator" },
            { value: "admin", label: "Administrator" },
          ]}
        />
      </form>
    </Dialog>
  );
}

// ---- Sites ----

function SitesSection() {
  const qc = useQueryClient();
  const sites = useSites();
  const devices = useDevices();
  const [adding, setAdding] = useState(false);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of devices.data?.items ?? []) m.set(d.site_id, (m.get(d.site_id) ?? 0) + 1);
    return m;
  }, [devices.data]);

  const columns = useMemo<ColumnDef<Site, unknown>[]>(
    () => [
      { id: "name", header: "Site", accessorFn: (s) => s.name, meta: { width: "minmax(160px,2fr)" } },
      { id: "lat", header: "Latitude", accessorFn: (s) => s.latitude, cell: ({ row }) => formatNumber(row.original.latitude, 4), meta: { numeric: true, width: "120px" } },
      { id: "lng", header: "Longitude", accessorFn: (s) => s.longitude, cell: ({ row }) => formatNumber(row.original.longitude, 4), meta: { numeric: true, width: "120px" } },
      { id: "devices", header: "Devices", accessorFn: (s) => counts.get(s.id) ?? 0, meta: { numeric: true, width: "100px" } },
    ],
    [counts],
  );

  return (
    <Card className="p-6">
      <CardHeader
        title="Sites"
        subtitle="Named places with coordinates. Devices belong to a site, and the map draws sites as markers."
        actions={
          <Button variant="primary" icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} onClick={() => setAdding(true)}>
            Add site
          </Button>
        }
      />
      <div className="mt-6">
        <DataTable
          data={sites.data?.items ?? []}
          columns={columns}
          getRowId={(s) => s.id}
          caption="Sites"
          height={520}
          loading={sites.isLoading}
          initialSorting={[{ id: "name", desc: false }]}
          error={sites.error ? { title: "Couldn’t load sites", detail: errorMessage(sites.error), onRetry: () => void sites.refetch() } : null}
        />
      </div>
      <AddSiteDialog open={adding} onOpenChange={setAdding} onAdded={() => void qc.invalidateQueries({ queryKey: ["sites"] })} />
    </Card>
  );
}

function AddSiteDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", lat: "", lng: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useMutation({
    mutationFn: () => api.createSite({ name: form.name.trim(), latitude: Number(form.lat), longitude: Number(form.lng) }),
    onSuccess: (s) => {
      onAdded();
      toast({ title: "Site added", description: s.name });
      onOpenChange(false);
      setForm({ name: "", lat: "", lng: "" });
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!form.name.trim()) errs.name = "Enter a site name";
    if (form.lat === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) errs.lat = "Latitude must be between −90 and 90";
    if (form.lng === "" || !Number.isFinite(lng) || lng < -180 || lng > 180) errs.lng = "Longitude must be between −180 and 180";
    setErrors(errs);
    if (Object.keys(errs).length === 0) add.mutate();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add site"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-site" loading={add.isPending}>
            Add site
          </Button>
        </>
      }
    >
      <form id="add-site" noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Latitude" mono inputMode="decimal" placeholder="6.5095" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} error={errors.lat} />
          <TextField label="Longitude" mono inputMode="decimal" placeholder="3.3711" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} error={errors.lng} />
        </div>
        {add.error && (
          <p role="alert" className="text-body-sm text-state-critical">
            {errorMessage(add.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}

// ---- Alert rules ----

function RulesSection() {
  const rules = useQuery({ queryKey: ["alert-rules"], queryFn: ({ signal }) => api.alertRules(signal) });
  if (rules.error) return <Card className="p-6"><ErrorState title="Couldn’t load alert rules" detail={errorMessage(rules.error)} onRetry={() => void rules.refetch()} /></Card>;
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <CardHeader
          title="Alert rules"
          subtitle="Hysteresis, consecutive readings and cooldown keep one noisy hour from sending a hundred alerts."
        />
      </Card>
      {rules.isLoading
        ? [0, 1].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)
        : rules.data?.items.map((r) => <RuleCard key={`${r.id}-${JSON.stringify(r)}`} rule={r} />)}
    </div>
  );
}

const CHANNELS: Array<{ value: Channel; label: string }> = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS (sandbox)" },
  { value: "webhook", label: "Webhook" },
];

function RuleCard({ rule }: { rule: AlertRule }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toForm(rule));
  const metric = METRICS[rule.metric];
  const unit = rule.kind === "unusual_change" ? "%" : metric.unit;
  const n = (s: string) => Number(s);
  const errors = {
    threshold: !(n(form.threshold) > 0) ? "Enter a value above 0" : null,
    hysteresis: !(n(form.hysteresis) >= 0) ? "Can’t be negative" : n(form.hysteresis) >= n(form.threshold) ? "Must be smaller than the threshold" : null,
    consecutive: !(Number.isInteger(n(form.consecutive)) && n(form.consecutive) >= 1) ? "Whole number, at least 1" : null,
    cooldown: !(Number.isInteger(n(form.cooldown)) && n(form.cooldown) >= 0) ? "Whole minutes, 0 or more" : null,
    channels: form.channels.length === 0 && form.enabled ? "Choose at least one channel" : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(rule));
  const save = useMutation({
    mutationFn: () =>
      api.updateAlertRule(rule.id, {
        threshold: n(form.threshold),
        hysteresis: n(form.hysteresis),
        consecutive_readings: n(form.consecutive),
        cooldown_min: n(form.cooldown),
        channels: form.channels,
        enabled: form.enabled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alert-rules"] });
      toast({ title: "Rule saved", description: rule.name });
    },
  });
  const clear = n(form.threshold) - n(form.hysteresis);

  return (
    <Card className="p-6">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) save.mutate();
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-h3 text-fg">{rule.name}</h3>
            <p className="mt-1 text-body-sm text-fg-muted">
              {metric.label}, {rule.kind === "unusual_change" ? "unusual change against the last hour" : "threshold"}
            </p>
          </div>
          <Switch label="Enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TextField label={rule.kind === "unusual_change" ? `Rise that triggers (${unit})` : `Threshold (${unit})`} mono inputMode="decimal" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} error={errors.threshold} />
          <TextField label={`Hysteresis (${unit})`} mono inputMode="decimal" value={form.hysteresis} onChange={(e) => setForm({ ...form, hysteresis: e.target.value })} error={errors.hysteresis} />
          <TextField label="Consecutive readings" mono inputMode="numeric" value={form.consecutive} onChange={(e) => setForm({ ...form, consecutive: e.target.value })} error={errors.consecutive} />
          <TextField label="Cooldown (min)" mono inputMode="numeric" value={form.cooldown} onChange={(e) => setForm({ ...form, cooldown: e.target.value })} error={errors.cooldown} />
        </div>
        {!invalid && (
          <p className="mt-4 text-body-sm text-fg-secondary">
            Opens after {form.consecutive} readings in a row {rule.kind === "unusual_change" ? `rise more than ${form.threshold} %` : `above ${form.threshold} ${unit}`}. Resolves
            when readings fall below {rule.kind === "unusual_change" ? `${form.hysteresis} %` : `${formatNumber(clear, metric.decimals)} ${unit}`}. No repeat alert for the same site within {form.cooldown} min.
          </p>
        )}
        <fieldset className="mt-6">
          <legend className="mb-3 text-label text-fg-secondary">Notify by</legend>
          <div className="flex flex-wrap gap-6">
            {CHANNELS.map((c) => (
              <Checkbox
                key={c.value}
                label={c.label}
                checked={form.channels.includes(c.value)}
                onCheckedChange={(v) => setForm({ ...form, channels: v ? [...form.channels, c.value] : form.channels.filter((x) => x !== c.value) })}
              />
            ))}
          </div>
          {errors.channels && (
            <p role="alert" className="mt-2 text-body-sm text-state-critical">
              {errors.channels}
            </p>
          )}
        </fieldset>
        <div className="mt-6 flex items-center gap-4">
          <Button type="submit" variant="primary" loading={save.isPending} disabled={invalid || !dirty}>
            Save rule
          </Button>
          {!dirty && !save.isPending && <span className="text-body-sm text-fg-muted">No changes</span>}
          {save.error && <p role="alert" className="text-body-sm text-state-critical">{errorMessage(save.error)}</p>}
        </div>
      </form>
    </Card>
  );
}

function toForm(r: AlertRule) {
  return {
    threshold: String(r.threshold),
    hysteresis: String(r.hysteresis),
    consecutive: String(r.consecutive_readings),
    cooldown: String(r.cooldown_min),
    channels: r.channels,
    enabled: r.enabled,
  };
}

// ---- Retention ----

const RETENTION_FIELDS: Array<{ key: keyof Retention; label: string; hint: string }> = [
  { key: "raw_days", label: "Raw readings (days)", hint: "Every reading with its quality flags" },
  { key: "hourly_days", label: "Hourly summaries (days)", hint: "Min, max, mean and count per hour" },
  { key: "daily_days", label: "Daily summaries (days)", hint: "Kept longest, for trends and reports" },
  { key: "ingestion_events_days", label: "Ingestion outcomes (days)", hint: "Accepted, duplicate, late, quarantined" },
];

function RetentionSection() {
  const retention = useQuery({ queryKey: ["retention"], queryFn: ({ signal }) => api.retention(signal) });
  if (retention.error) return <Card className="p-6"><ErrorState title="Couldn’t load retention" detail={errorMessage(retention.error)} onRetry={() => void retention.refetch()} /></Card>;
  if (!retention.data) return <Skeleton className="h-80 rounded-lg" />;
  return <RetentionForm key={JSON.stringify(retention.data)} initial={retention.data} />;
}

function RetentionForm({ initial }: { initial: Retention }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])) as Record<keyof Retention, string>);
  const save = useMutation({
    mutationFn: (body: Retention) => api.updateRetention(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["retention"] });
      toast({ title: "Retention saved", description: "Data older than these periods is removed by the nightly job." });
    },
  });
  const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])) as Retention;
  const fieldError = (k: keyof Retention) => (!(Number.isInteger(values[k]) && values[k] >= 1) ? "Whole number of days, at least 1" : null);
  const orderError =
    !RETENTION_FIELDS.some((f) => fieldError(f.key)) && (values.raw_days > values.hourly_days || values.hourly_days > values.daily_days)
      ? "Keep raw ≤ hourly ≤ daily: summaries must outlive the data they summarise."
      : null;
  const invalid = RETENTION_FIELDS.some((f) => fieldError(f.key)) || !!orderError;
  // 1,000 devices × 8,640 readings a day × about 2.6 metrics.
  const rawRows = values.raw_days * 1000 * 8640 * 2.6;

  return (
    <Card className="p-6">
      <CardHeader title="Data retention" subtitle="How long each kind of data is kept before the retention job removes it." />
      <form
        noValidate
        className="mt-6 flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) save.mutate(values);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {RETENTION_FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              mono
              inputMode="numeric"
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              error={fieldError(f.key)}
              hint={f.hint}
            />
          ))}
        </div>
        {orderError && (
          <p role="alert" className="text-body-sm text-state-critical">
            {orderError}
          </p>
        )}
        {!invalid && (
          <p className="text-body-sm text-fg-secondary">
            At 100 readings a second, {values.raw_days} days of raw data is about {formatNumber(rawRows / 1e9, 1)} billion metric rows before compression.
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={invalid}>
            Save retention
          </Button>
          {save.error && <p role="alert" className="mt-2 text-body-sm text-state-critical">{errorMessage(save.error)}</p>}
        </div>
      </form>
    </Card>
  );
}
