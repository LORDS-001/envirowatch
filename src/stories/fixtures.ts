// Data for stories: real Lagos sites from the seeded simulator, fixed values, times relative to load.
import type { Alert, HeatmapSample, QualityDay, Site } from "@/lib/api/types";
import type { LinePoint } from "@/components/charts/LineChart";
import { createWorld } from "@/mocks/sim/world";

/** Anchored to load time, on the minute, so "4 min ago" reads naturally in every run. */
export const NOW = Math.floor(Date.now() / 60_000) * 60_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;

const world = createWorld(4242);

export const SITES: Site[] = world.sites.map((s) => ({
  id: s.id,
  organization_id: "org-lagos",
  name: s.name,
  latitude: s.lat,
  longitude: s.lng,
}));

const siteId = (name: string) => SITES.find((s) => s.name === name)?.id ?? SITES[0]!.id;

export const PM_SAMPLES: HeatmapSample[] = world.sites.map((s, i) => ({
  site_id: s.id,
  latitude: s.lat,
  longitude: s.lng,
  value: Math.round((s.pmBase + 4 * Math.sin(i)) * 10) / 10,
  quality_status: "valid",
  event_time: iso(10_000),
  received_at: iso(9_000),
  device_count: 22,
}));

export const QUALITY_DAYS: QualityDay[] = [97.1, 97.1, 97.8, 98.3, 96.7, 97.5, 96.6].map((valid, i) => {
  const total = 86_400;
  const rest = total - Math.round((total * valid) / 100);
  return {
    date: new Date(NOW - (6 - i) * 86_400_000).toISOString(),
    valid: total - rest,
    estimated: Math.round(rest * 0.45),
    suspicious: Math.round(rest * 0.2),
    missing: rest - Math.round(rest * 0.45) - Math.round(rest * 0.2),
  };
});

/** Two hours of 10 s PM2.5 readings with a 6-minute outage and three spikes flagged suspicious. */
export function pmSeries(base: number, phase = 0): LinePoint[] {
  const out: LinePoint[] = [];
  for (let t = NOW - 2 * 3_600_000; t <= NOW; t += 10_000) {
    const i = (t - NOW) / 10_000;
    if (t > NOW - 50 * MIN && t < NOW - 44 * MIN) continue;
    const spike = i % 211 === 0;
    out.push({
      t,
      v: Math.round((base + 6 * Math.sin(i / 90 + phase) + 1.5 * Math.sin(i / 7)) * 10) / 10 + (spike ? 90 : 0),
      quality: spike ? "suspicious" : "valid",
      reason: spike ? "spike +340 %" : null,
    });
  }
  return out;
}

const base = {
  hysteresis: 5,
  corroborating_devices: null,
  activated_at: null,
  acknowledged_at: null,
  resolved_at: null,
  notifications: [],
} satisfies Partial<Alert>;

export const ALERTS: Alert[] = [
  {
    ...base,
    id: "alert-101",
    kind: "environment",
    metric: "pm25",
    site_id: siteId("Apapa Port"),
    device_id: null,
    title: "PM2.5 above 35 µg/m³ for 10 min · Apapa Port",
    status: "active",
    threshold: 35,
    value: 58.2,
    opened_at: iso(14 * MIN),
    activated_at: iso(12 * MIN),
    corroborating_devices: 4,
    notifications: [
      { alert_id: "alert-101", channel: "email", outcome: "delivered", attempted_at: iso(12 * MIN) },
      { alert_id: "alert-101", channel: "sms", outcome: "failed", attempted_at: iso(12 * MIN) },
    ],
  },
  {
    ...base,
    id: "alert-102",
    kind: "environment",
    metric: "pm25",
    site_id: siteId("Oshodi"),
    device_id: null,
    title: "PM2.5 above 35 µg/m³ · Oshodi",
    status: "pending",
    threshold: 35,
    value: 37.4,
    opened_at: iso(2 * MIN),
  },
  {
    ...base,
    id: "alert-103",
    kind: "device",
    metric: null,
    site_id: siteId("Ikotun"),
    device_id: "sensor-014",
    title: "Sensor 014 · silent for 6 min",
    status: "acknowledged",
    threshold: null,
    hysteresis: null,
    value: null,
    opened_at: iso(40 * MIN),
    activated_at: iso(39 * MIN),
    acknowledged_at: iso(20 * MIN),
    notifications: [{ alert_id: "alert-103", channel: "email", outcome: "delivered", attempted_at: iso(39 * MIN) }],
  },
  {
    ...base,
    id: "alert-104",
    kind: "environment",
    metric: "pm25",
    site_id: siteId("Ijora"),
    device_id: null,
    title: "PM2.5 above 35 µg/m³ for 10 min · Ijora",
    status: "resolved",
    threshold: 35,
    value: 41.0,
    opened_at: iso(180 * MIN),
    activated_at: iso(178 * MIN),
    acknowledged_at: iso(170 * MIN),
    resolved_at: iso(150 * MIN),
    notifications: [{ alert_id: "alert-104", channel: "webhook", outcome: "delivered", attempted_at: iso(178 * MIN) }],
  },
];
