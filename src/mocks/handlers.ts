/** MSW REST handlers for every route in the contract (PRD §9) plus the logged gap endpoints. */
import { delay, http, HttpResponse } from "msw";
import type { Aggregate, Device, HeatmapSample, Measurement, QualityDay } from "@/lib/api/types";
import { config, staleAfterMs } from "@/lib/config";
import { isMetricId, METRICS, type MetricId } from "@/lib/metrics";
import { latestReadings as computeLatest, trueValue } from "./sim/model";
import { unit } from "./sim/rng";
import { MOCK_PASSWORD, MOCK_USERS, mockOrg, mockSessionUser, mockState, setMockSessionUser, type MockEmail } from "./state";

const base = config.apiBaseUrl;
const url = (path: string) => `${base}${path}`;

const latency = () => delay(120 + Math.random() * 180);

// The mock server runs on the page's main thread. Several endpoints need every device's latest
// reading; compute it at most once per second so the mock doesn't distort client performance.
let latestCache: { second: number; rows: Measurement[] } | null = null;
function latestReadings(world: Parameters<typeof computeLatest>[0], scenario: Parameters<typeof computeLatest>[1], t: number) {
  const second = Math.floor(t / 1000);
  if (latestCache?.second !== second) latestCache = { second, rows: computeLatest(world, scenario, t) };
  return latestCache.rows;
}

function requireAuth(request: Request) {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer mock.") ? null : HttpResponse.json({ detail: "Not signed in" }, { status: 401 });
}

function loginBody(email: MockEmail) {
  const u = MOCK_USERS[email];
  return {
    access_token: `mock.${u.id}.${Date.now()}`,
    user: { id: u.id, organization_id: mockOrg.id, email, role: u.role },
    organization: mockOrg,
  };
}

export const handlers = [
  http.post(url("/auth/login"), async ({ request }) => {
    await latency();
    const { email, password } = (await request.json()) as { email?: string; password?: string };
    const key = (email ?? "").trim().toLowerCase();
    if (!(key in MOCK_USERS) || password !== MOCK_PASSWORD) {
      return HttpResponse.json({ detail: "Email or password is incorrect" }, { status: 401 });
    }
    setMockSessionUser(key as MockEmail);
    return HttpResponse.json(loginBody(key as MockEmail));
  }),

  http.post(url("/auth/refresh"), async () => {
    await delay(60);
    const email = mockSessionUser();
    return email ? HttpResponse.json(loginBody(email)) : HttpResponse.json({ detail: "No session" }, { status: 401 });
  }),

  http.post(url("/auth/logout"), () => {
    setMockSessionUser(null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(url("/sites"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    await latency();
    const { world } = mockState();
    return HttpResponse.json({
      items: world.sites.map((s) => ({
        id: s.id,
        organization_id: mockOrg.id,
        name: s.name,
        latitude: s.lat,
        longitude: s.lng,
      })),
      next_cursor: null,
    });
  }),

  http.get(url("/devices"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const org = new URL(request.url).searchParams.get("organization_id");
    if (org && org !== mockOrg.id) {
      return HttpResponse.json({ detail: "Not permitted for this organization" }, { status: 403 });
    }
    await latency();
    const { world, scenario } = mockState();
    const now = Date.now();
    const lastSeen = new Map<string, string>();
    for (const m of latestReadings(world, scenario, now)) lastSeen.set(m.device_id, m.received_at);
    const items: Device[] = world.devices.map((d) => ({
      id: d.id,
      site_id: d.site.id,
      type: d.type,
      status: "active",
      last_seen_at: lastSeen.get(d.id) ?? null,
      metrics: d.metrics,
    }));
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.get(url("/heatmap"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const metricParam = new URL(request.url).searchParams.get("metric") ?? "pm25";
    if (!isMetricId(metricParam)) return HttpResponse.json({ detail: "Unknown metric" }, { status: 400 });
    await latency();
    return HttpResponse.json(heatmapFor(metricParam, Date.now()));
  }),

  http.get(url("/measurements/aggregates"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const q = new URL(request.url).searchParams;
    const metric = q.get("metric") ?? "pm25";
    if (!isMetricId(metric)) return HttpResponse.json({ detail: "Unknown metric" }, { status: 400 });
    const from = Date.parse(q.get("from") ?? "");
    const to = Date.parse(q.get("to") ?? "");
    const bucketMs = q.get("bucket") === "1d" ? 86_400_000 : 3_600_000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return HttpResponse.json({ detail: "from and to must be ISO timestamps with from < to" }, { status: 400 });
    }
    await latency();
    return HttpResponse.json({ items: aggregatesFor(metric, from, to, bucketMs), next_cursor: null });
  }),

  http.get(url("/measurements/quality-summary"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const days = Math.min(30, Number(new URL(request.url).searchParams.get("days") ?? 7));
    await latency();
    return HttpResponse.json({ days: qualityDays(days, Date.now()) });
  }),

  http.get(url("/alerts"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const statuses = new URL(request.url).searchParams.getAll("status");
    await latency();
    const { alerts } = mockState();
    const items = statuses.length ? alerts.filter((a) => statuses.includes(a.status)) : alerts;
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.post(url("/alerts/:id/acknowledge"), async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    await latency();
    const alert = mockState().alerts.find((a) => a.id === params.id);
    if (!alert) return HttpResponse.json({ detail: "Alert not found" }, { status: 404 });
    if (alert.status === "resolved") return HttpResponse.json({ detail: "Alert is already resolved" }, { status: 409 });
    alert.status = "acknowledged";
    alert.acknowledged_at = new Date().toISOString();
    return HttpResponse.json(alert);
  }),

  http.get(url("/system/health"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    await latency();
    const t = Math.floor(Date.now() / 5000);
    const wobble = (k: number) => unit(mockState().world.seed, t, k);
    return HttpResponse.json({
      status: "ok",
      generated_at: new Date().toISOString(),
      queue_depth: Math.round(40 + wobble(1) * 160),
      ingest_rate_per_s: 99.9 + wobble(2) * 3.2,
      latency_ms: { p50: 310 + wobble(3) * 90, p95: 1180 + wobble(4) * 420, p99: 2300 + wobble(5) * 900 },
      error_rate: 0.002 + wobble(6) * 0.003,
      db_writes_per_s: 296 + wobble(7) * 14,
      valid_rate_24h: 0.9712 + wobble(8) * 0.004,
    });
  }),

  http.get(url("/public/summary"), async () => {
    await latency();
    const heat = heatmapFor("pm25", Date.now());
    const temps = heatmapFor("temperature_c", Date.now());
    const tempBySite = new Map(temps.samples.map((s) => [s.site_id, s]));
    const { world } = mockState();
    return HttpResponse.json({
      generated_at: heat.generated_at,
      areas: heat.samples.map((s) => {
        const site = world.sites.find((x) => x.id === s.site_id)!;
        const t = tempBySite.get(s.site_id);
        return {
          site_id: s.site_id,
          name: site.name,
          latitude: s.latitude,
          longitude: s.longitude,
          readings: [
            { metric: "pm25", value: s.value, event_time: s.event_time, quality_status: "valid" },
            ...(t ? [{ metric: "temperature_c", value: t.value, event_time: t.event_time, quality_status: "valid" }] : []),
          ],
        };
      }),
    });
  }),
];

/** Per-site mean of fresh, valid device readings: the IDW input. */
export function heatmapFor(metric: MetricId, now: number) {
  const { world, scenario } = mockState();
  const bySite = new Map<string, { sum: number; n: number; event: number; received: number }>();
  const rows: Measurement[] = latestReadings(world, scenario, now);
  const deviceSite = new Map(world.devices.map((d) => [d.id, d.site]));
  for (const m of rows) {
    if (m.metric !== metric || m.quality_status !== "valid") continue;
    if (now - Date.parse(m.event_time) > staleAfterMs) continue;
    const site = deviceSite.get(m.device_id)!;
    const acc = bySite.get(site.id) ?? { sum: 0, n: 0, event: 0, received: 0 };
    acc.sum += m.value;
    acc.n += 1;
    acc.event = Math.max(acc.event, Date.parse(m.event_time));
    acc.received = Math.max(acc.received, Date.parse(m.received_at));
    bySite.set(site.id, acc);
  }
  const samples: HeatmapSample[] = world.sites.flatMap((s) => {
    const acc = bySite.get(s.id);
    if (!acc) return [];
    return [
      {
        site_id: s.id,
        latitude: s.lat,
        longitude: s.lng,
        value: Number((acc.sum / acc.n).toFixed(2)),
        quality_status: "valid" as const,
        event_time: new Date(acc.event).toISOString(),
        received_at: new Date(acc.received).toISOString(),
        device_count: acc.n,
      },
    ];
  });
  return { metric, unit: METRICS[metric].unit, generated_at: new Date(now).toISOString(), samples };
}

/** City-wide aggregates from the noise-free model with a noise envelope. Fast enough for any range. */
function aggregatesFor(metric: MetricId, from: number, to: number, bucketMs: number): Aggregate[] {
  const { world } = mockState();
  const sites = world.sites;
  const out: Aggregate[] = [];
  const start = Math.floor(from / bucketMs) * bucketMs;
  const devicesPerSite = world.devices.filter((d) => d.metrics.includes(metric)).length / sites.length;
  for (let b = start; b < to; b += bucketMs) {
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    const samples = 6;
    for (const s of sites) {
      for (let k = 0; k < samples; k++) {
        const v = trueValue(s, metric, b + ((k + 0.5) * bucketMs) / samples);
        sum += v;
        const spread = metric === "pm25" ? v * 0.16 : metric === "temperature_c" ? 0.5 : 2.4;
        min = Math.min(min, v - spread);
        max = Math.max(max, v + spread);
      }
    }
    const end = Math.min(b + bucketMs, Date.now());
    if (end <= b) break;
    const readingsPerDevice = Math.floor((end - b) / config.cadenceMs);
    out.push({
      device_id: null,
      metric,
      bucket_start: new Date(b).toISOString(),
      min: Number(Math.max(0, min).toFixed(2)),
      max: Number(max.toFixed(2)),
      avg: Number((sum / (sites.length * samples)).toFixed(2)),
      count: Math.round(readingsPerDevice * devicesPerSite * sites.length * 0.975),
    });
  }
  return out;
}

function qualityDays(days: number, now: number): QualityDay[] {
  const DAY = 86_400_000;
  const seed = mockState().world.seed;
  const today = Math.floor((now + 3_600_000) / DAY) * DAY - 3_600_000; // midnight WAT
  const out: QualityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = today - i * DAY;
    const span = Math.min(DAY, now - start);
    const total = Math.round((1000 * span) / config.cadenceMs);
    const k = Math.floor(start / DAY);
    const missing = Math.round(total * (0.008 + unit(seed, k, 1) * 0.014));
    const suspicious = Math.round(total * (0.002 + unit(seed, k, 2) * 0.006));
    const estimated = Math.round(total * (0.004 + unit(seed, k, 3) * 0.008));
    out.push({
      date: new Date(start).toISOString(),
      valid: total - missing - suspicious - estimated,
      estimated,
      suspicious,
      missing,
    });
  }
  return out;
}
