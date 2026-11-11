import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/endpoints";
import { ApiError, errorMessage } from "@/lib/api/client";
import type { Site } from "@/lib/api/types";
import { METRICS, METRIC_IDS, type MetricId } from "@/lib/metrics";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { KeyReveal } from "@/components/ui/KeyReveal";
import { toast } from "@/components/ui/Toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: readonly Site[];
  existing: readonly string[];
  defaultSite: string | null;
}

function nextId(existing: readonly string[]) {
  const max = existing.reduce((m, id) => {
    const n = /^sensor-(\d+)$/.exec(id)?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 0);
  return `sensor-${String(max + 1).padStart(3, "0")}`;
}

/** Register → the key is shown once, with a warning, then never again. */
export function RegisterDeviceDialog({ open, onOpenChange, sites, existing, defaultSite }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => initial());
  const [key, setKey] = useState<{ id: string; apiKey: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function initial() {
    const site = sites.find((s) => s.id === defaultSite) ?? sites[0];
    return {
      id: nextId(existing),
      type: "air-quality",
      siteId: site?.id ?? "",
      lat: site ? site.latitude.toFixed(5) : "",
      lng: site ? site.longitude.toFixed(5) : "",
      metrics: ["pm25", "temperature_c", "humidity_percent"] as MetricId[],
    };
  }

  const register = useMutation({
    mutationFn: () =>
      api.registerDevice({
        id: form.id.trim().toLowerCase(),
        type: form.type,
        site_id: form.siteId,
        latitude: Number(form.lat),
        longitude: Number(form.lng),
        metrics: form.metrics,
      }),
    onSuccess: (res) => {
      setKey({ id: res.device.id, apiKey: res.api_key });
      void qc.invalidateQueries({ queryKey: ["devices"] });
      toast({ title: "Device registered", description: `${res.device.id} will appear online after its first reading.` });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setErrors({ id: err.message });
    },
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(form.id.trim().toLowerCase())) e.id = "Use 3–40 lowercase letters, numbers or hyphens";
    else if (existing.includes(form.id.trim().toLowerCase())) e.id = `${form.id} is already registered`;
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (form.lat === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) e.lat = "Latitude must be between −90 and 90";
    if (form.lng === "" || !Number.isFinite(lng) || lng < -180 || lng > 180) e.lng = "Longitude must be between −180 and 180";
    if (form.metrics.length === 0) e.metrics = "Choose at least one metric";
    if (!form.siteId) e.siteId = "Choose a site";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (validate()) register.mutate();
  }

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setKey(null);
      setErrors({});
      register.reset();
      setForm(initial());
    }
  }

  if (key) {
    return (
      <Dialog
        open={open}
        onOpenChange={close}
        dismissable={false}
        title={`${key.id} registered`}
        description="The simulator will start sending its readings with this key."
        footer={
          <Button variant="primary" onClick={() => close(false)}>
            I’ve stored the key
          </Button>
        }
      >
        <KeyReveal deviceId={key.id} apiKey={key.apiKey} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Register device"
      description="The device gets its own key. Readings without a valid key are rejected."
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="register-device" loading={register.isPending}>
            Register device
          </Button>
        </>
      }
    >
      <form id="register-device" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField label="Device ID" mono value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} error={errors.id} hint="Lowercase, e.g. sensor-1001" autoComplete="off" />
        <SelectField
          label="Type"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value, metrics: e.target.value === "weather" ? ["temperature_c", "humidity_percent"] : form.metrics })}
          options={[
            { value: "air-quality", label: "Air quality" },
            { value: "weather", label: "Weather" },
          ]}
        />
        <SelectField
          label="Site"
          value={form.siteId}
          error={errors.siteId}
          onChange={(e) => {
            const s = sites.find((x) => x.id === e.target.value);
            setForm({ ...form, siteId: e.target.value, lat: s ? s.latitude.toFixed(5) : form.lat, lng: s ? s.longitude.toFixed(5) : form.lng });
          }}
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Latitude" mono inputMode="decimal" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} error={errors.lat} />
          <TextField label="Longitude" mono inputMode="decimal" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} error={errors.lng} />
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-label text-fg-secondary">Metrics it reports</legend>
          {METRIC_IDS.map((m) => (
            <Checkbox
              key={m}
              label={`${METRICS[m].label} (${METRICS[m].unit})`}
              checked={form.metrics.includes(m)}
              disabled={form.type === "weather" && m === "pm25"}
              onCheckedChange={(v) => setForm({ ...form, metrics: v ? [...form.metrics, m] : form.metrics.filter((x) => x !== m) })}
            />
          ))}
          {errors.metrics && (
            <p role="alert" className="text-body-sm text-state-critical">
              {errors.metrics}
            </p>
          )}
        </fieldset>
        {register.error && !(register.error instanceof ApiError && register.error.status === 409) && (
          <p role="alert" className="text-body-sm text-state-critical">
            {errorMessage(register.error)}
          </p>
        )}
      </form>
    </Dialog>
  );
}
