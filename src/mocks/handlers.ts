/** MSW REST handlers for every route in the contract (PRD §9) plus the logged gap endpoints. */
import { delay, http, HttpResponse } from "msw";
import type {
  Aggregate,
  Device,
  DeviceHealthEvent,
  DeviceHealthStatus,
  HeatmapSample,
  IngestionEvent,
  Measurement,
  QualityDay,
  Retention,
  Role,
  SimFault,
  SimRun,
} from "@/lib/api/types";
import type { Bucket } from "@/lib/api/endpoints";
import { config, staleAfterMs } from "@/lib/config";
import { isMetricId, METRICS, type MetricId } from "@/lib/metrics";
import { deliveryPlan, latestReadings as computeLatest, readingFor, tickAt, trueValue } from "./sim/model";
import { unit } from "./sim/rng";
import { planRun, runSnapshot } from "./sim/runPlan";
import { CADENCE_MS, type SimDevice, type SimSite } from "./sim/world";
import { broadcastEvent } from "./live";
import { simplePdf } from "./pdf";
import {
  MOCK_PASSWORD,
  MOCK_USERS,
  mockOrg,
  mockSessionUser,
  mockState,
  setMockSessionUser,
  type MockEmail,
  type SimRunState,
} from "./state";

const base = config.apiBaseUrl;
const url = (path: string) => `${base}${path}`;
const HOUR = 3_600_000;

const latency = () => delay(120 + Math.random() * 180);
const iso = (t: number) => new Date(t).toISOString();
const notFound = (what: string) => HttpResponse.json({ detail: `${what} not found` }, { status: 404 });
const bad = (detail: string) => HttpResponse.json({ detail }, { status: 400 });

// The mock server runs on the page's main thread. Several endpoints need every device's latest
// reading; compute it at most once per second so the mock doesn't distort client performance.
let latestCache: { second: number; rows: Measurement[] } | null = null;
function latestReadings(t: number) {
  const second = Math.floor(t / 1000);
  if (latestCache?.second !== second) {
    const { world, scenario } = mockState();
    latestCache = { second, rows: computeLatest(world, scenario, t) };
  }
  return latestCache.rows;
}

function requireAuth(request: Request) {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer mock.") ? null : HttpResponse.json({ detail: "Not signed in" }, { status: 401 });
}

/** Admin-only routes are rejected by the API too, never only hidden in the UI. */
function requireAdmin(request: Request) {
  const denied = requireAuth(request);
  if (denied) return denied;
  const id = request.headers.get("Authorization")!.split(".")[1];
  return id === MOCK_USERS["admin@envirowatch.test"].id
    ? null
    : HttpResponse.json({ detail: "Administrators only" }, { status: 403 });
}

function loginBody(email: MockEmail) {
  const u = MOCK_USERS[email];
  return {
    access_token: `mock.${u.id}.${Date.now()}`,
    user: { id: u.id, organization_id: mockOrg.id, email, role: u.role },
    organization: { id: mockOrg.id, name: mockState().orgName },
  };
}

function toDevice(d: SimDevice, lastSeen: string | null): Device {
  return {
    id: d.id,
    site_id: d.site.id,
    type: d.type,
    status: d.deactivatedAt ? "deactivated" : "active",
    last_seen_at: lastSeen,
    metrics: d.metrics,
  };
}

function lastSeenMap(now: number) {
  const m = new Map<string, string>();
  for (const r of latestReadings(now)) m.set(r.device_id, r.received_at);
  return m;
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `ewk_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// ---- Device health (mock detectors) ----

function healthOf(d: SimDevice, now: number, lastSeen: string | null): { health: DeviceHealthStatus; events: DeviceHealthEvent[] } {
  const { scenario } = mockState();
  if (d.deactivatedAt) return { health: "deactivated", events: [] };
  const events: DeviceHealthEvent[] = [];
  if (d.idx === scenario.silentDevice) {
    events.push({ device_id: d.id, fault_type: "silent", severity: "critical", detected_at: iso(scenario.silentSince + 60_000), detail: "No readings since the device went quiet" });
  }
  if (d.idx === scenario.driftDevice) {
    events.push({ device_id: d.id, fault_type: "drift", severity: "warn", detected_at: iso(scenario.driftStart + 5 * HOUR), detail: "+4.2 µg/m³ against neighbours over 6 h" });
  }
  if (d.idx === scenario.spikeDevice) {
    for (let k = 1; k <= 4; k++) {
      events.push({ device_id: d.id, fault_type: "spike", severity: "warn", detected_at: iso(scenario.t0 - k * 5 * 60_000), detail: "spike +340 % against recent history" });
    }
  }
  if (d.idx === scenario.clockDevice) {
    events.push({ device_id: d.id, fault_type: "clock_error", severity: "warn", detected_at: iso(scenario.t0 - 2 * HOUR), detail: "Event times 2 h ahead of receipt; readings quarantined" });
  }
  const seen = lastSeen ? Date.parse(lastSeen) : 0;
  const settled = d.activeFrom === undefined || now - d.activeFrom > staleAfterMs;
  if (now - seen > staleAfterMs && d.idx !== scenario.silentDevice && settled) {
    events.push({ device_id: d.id, fault_type: "silent", severity: "critical", detected_at: iso(Math.max(seen, now - staleAfterMs)) });
  }
  events.sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at));
  const top = events[0];
  const health: DeviceHealthStatus = !top
    ? "online"
    : top.fault_type === "silent"
      ? "silent"
      : top.fault_type === "drift"
        ? "drifting"
        : "suspicious";
  return { health, events };
}

// ---- Aggregates ----

const BUCKET_MS: Record<Bucket, number> = { "1m": 60_000, "15m": 900_000, "1h": HOUR, "6h": 6 * HOUR, "1d": 24 * HOUR };

/** Aggregates from the noise-free model with a noise envelope. Fast enough for any range. */
function aggregatesFor(
  metric: MetricId,
  from: number,
  to: number,
  bucketMs: number,
  target: { sites: SimSite[]; device?: SimDevice; devices: number },
): Aggregate[] {
  const { scenario } = mockState();
  const out: Aggregate[] = [];
  const start = Math.floor(from / bucketMs) * bucketMs;
  const now = Date.now();
  const samples = bucketMs <= 60_000 ? 2 : 6;
  for (let b = start; b < to; b += bucketMs) {
    const end = Math.min(b + bucketMs, now);
    if (end <= b) break;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let n = 0;
    for (const s of target.sites) {
      for (let k = 0; k < samples; k++) {
        const t = b + ((k + 0.5) * (end - b)) / samples;
        let v = trueValue(s, metric, t);
        const d = target.device;
        if (d && metric === "pm25" && d.idx === scenario.driftDevice && t > scenario.driftStart) {
          v += (scenario.driftRate * (t - scenario.driftStart)) / HOUR;
        }
        // Small per-bucket wobble so single-device lines look like sensor data.
        if (d) v *= 1 + 0.03 * (unit(d.idx, Math.floor(b / bucketMs), k) - 0.5);
        sum += v;
        n++;
        const spread = metric === "pm25" ? v * (d ? 0.08 : 0.16) : metric === "temperature_c" ? 0.5 : 2.4;
        min = Math.min(min, v - spread);
        max = Math.max(max, v + spread);
      }
    }
    const perDevice = Math.max(1, Math.floor((end - b) / config.cadenceMs));
    out.push({
      device_id: target.device?.id ?? null,
      metric,
      bucket_start: iso(b),
      min: Number(Math.max(0, min).toFixed(2)),
      max: Number(max.toFixed(2)),
      avg: Number((sum / n).toFixed(2)),
      count: Math.round(perDevice * target.devices * 0.975),
    });
  }
  return out;
}

function cityTarget(metric: MetricId) {
  const { world } = mockState();
  return { sites: world.sites, devices: world.devices.filter((d) => d.metrics.includes(metric)).length };
}

// ---- Heatmap ----

/** Per-site mean of fresh device readings: the IDW input. */
export function heatmapFor(metric: MetricId, now: number, opts: { at?: number; includeSuspicious?: boolean } = {}) {
  const { world } = mockState();
  // A past moment: per-site model values (the backend would read its hourly aggregates).
  if (opts.at !== undefined && now - opts.at > 60_000) {
    const at = opts.at;
    const samples: HeatmapSample[] = world.sites.map((s) => ({
      site_id: s.id,
      latitude: s.lat,
      longitude: s.lng,
      value: Number(trueValue(s, metric, at).toFixed(2)),
      quality_status: "valid",
      event_time: iso(at),
      received_at: iso(at),
      device_count: world.devices.filter((d) => d.site.id === s.id && d.metrics.includes(metric)).length,
    }));
    return { metric, unit: METRICS[metric].unit, generated_at: iso(now), samples };
  }
  const bySite = new Map<string, { sum: number; n: number; event: number; received: number }>();
  const deviceSite = new Map(world.devices.map((d) => [d.id, d.site]));
  for (const m of latestReadings(now)) {
    if (m.metric !== metric) continue;
    const ok = m.quality_status === "valid" || (opts.includeSuspicious && m.quality_status === "suspicious");
    if (!ok || now - Date.parse(m.event_time) > staleAfterMs) continue;
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
        event_time: iso(acc.event),
        received_at: iso(acc.received),
        device_count: acc.n,
      },
    ];
  });
  return { metric, unit: METRICS[metric].unit, generated_at: iso(now), samples };
}

function qualityDays(days: number, now: number): QualityDay[] {
  const DAY = 86_400_000;
  const seed = mockState().world.seed;
  const today = Math.floor((now + HOUR) / DAY) * DAY - HOUR; // midnight WAT
  const out: QualityDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = today - i * DAY;
    const span = Math.min(DAY, now - start);
    const total = Math.round((1000 * span) / config.cadenceMs);
    const k = Math.floor(start / DAY);
    const missing = Math.round(total * (0.008 + unit(seed, k, 1) * 0.014));
    const suspicious = Math.round(total * (0.002 + unit(seed, k, 2) * 0.006));
    const estimated = Math.round(total * (0.004 + unit(seed, k, 3) * 0.008));
    out.push({ date: iso(start), valid: total - missing - suspicious - estimated, estimated, suspicious, missing });
  }
  return out;
}

// ---- Simulator ----

function simElapsed(r: SimRunState, now: number) {
  const running = r.resumedAt !== null ? ((now - r.resumedAt) / 1000) * r.speed : 0;
  return Math.min(r.plan.duration_s, r.bankedS + running);
}

function simView(r: SimRunState | null): SimRun | null {
  if (!r) return null;
  const elapsed = simElapsed(r, Date.now());
  const completed = elapsed >= r.plan.duration_s;
  const status: SimRun["status"] = r.stopped ? "stopped" : completed ? "completed" : r.resumedAt === null ? "paused" : "running";
  return {
    id: r.id,
    scenario: r.scenario,
    seed: r.seed,
    faults: r.faults,
    speed: r.speed,
    status,
    started_at: iso(r.startedAt),
    elapsed_s: Math.round(elapsed),
    duration_s: r.plan.duration_s,
    ...runSnapshot(r.plan, elapsed, status === "completed" || status === "stopped"),
  };
}

// ---- Exports ----

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportRows(siteIds: string[], metrics: MetricId[], from: number, to: number) {
  const { world } = mockState();
  const sites = world.sites.filter((s) => siteIds.length === 0 || siteIds.includes(s.id));
  const bucket = to - from > 7 * 24 * HOUR ? 24 * HOUR : HOUR;
  const rows: Array<{ site: SimSite; metric: MetricId; a: Aggregate }> = [];
  for (const site of sites) {
    for (const metric of metrics) {
      const devices = world.devices.filter((d) => d.site.id === site.id && d.metrics.includes(metric)).length;
      for (const a of aggregatesFor(metric, from, to, bucket, { sites: [site], devices })) rows.push({ site, metric, a });
    }
  }
  return { rows: rows.slice(0, 50_000), bucket, truncated: rows.length > 50_000 };
}

const QUALITY_NOTES = [
  "Values are per-site summaries of valid readings only.",
  "Suspicious and quarantined readings are excluded from min, max and mean.",
  "Readings arriving late are placed at their event time.",
  "Counts are valid readings per bucket; gaps mean sensors were silent.",
];

export const handlers = [
  // ---- Auth ----
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

  // ---- Organization, users ----
  http.patch(url("/organization"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { name } = (await request.json()) as { name?: string };
    if (!name?.trim()) return bad("Enter an organization name");
    await latency();
    mockState().orgName = name.trim();
    return HttpResponse.json({ id: mockOrg.id, name: mockState().orgName });
  }),

  http.get(url("/users"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    await latency();
    return HttpResponse.json({ items: mockState().users, next_cursor: null });
  }),

  http.post(url("/users"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { email, role } = (await request.json()) as { email?: string; role?: Role };
    const clean = (email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return bad("Enter a valid email address");
    if (mockState().users.some((u) => u.email === clean)) {
      return HttpResponse.json({ detail: "That email already has an account" }, { status: 409 });
    }
    await latency();
    const user = { id: `user-${Date.now()}`, organization_id: mockOrg.id, email: clean, role: role === "admin" ? "admin" : "operator" } as const;
    mockState().users.push(user);
    return HttpResponse.json(user, { status: 201 });
  }),

  http.patch(url("/users/:id"), async ({ request, params }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const user = mockState().users.find((u) => u.id === params.id);
    if (!user) return notFound("User");
    const { role } = (await request.json()) as { role?: Role };
    await latency();
    if (role === "admin" || role === "operator") user.role = role;
    return HttpResponse.json(user);
  }),

  // ---- Sites ----
  http.get(url("/sites"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    await latency();
    const { world, extraSites } = mockState();
    return HttpResponse.json({
      items: [
        ...world.sites.map((s) => ({ id: s.id, organization_id: mockOrg.id, name: s.name, latitude: s.lat, longitude: s.lng })),
        ...extraSites,
      ],
      next_cursor: null,
    });
  }),

  http.post(url("/sites"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { name, latitude, longitude } = (await request.json()) as { name?: string; latitude?: number; longitude?: number };
    if (!name?.trim()) return bad("Enter a site name");
    if (typeof latitude !== "number" || latitude < -90 || latitude > 90) return bad("Latitude must be between −90 and 90");
    if (typeof longitude !== "number" || longitude < -180 || longitude > 180) return bad("Longitude must be between −180 and 180");
    await latency();
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
    const site = { id: `site-${slug}-${Date.now() % 10000}`, organization_id: mockOrg.id, name: name.trim(), latitude, longitude };
    mockState().extraSites.push(site);
    return HttpResponse.json(site, { status: 201 });
  }),

  // ---- Devices ----
  http.get(url("/devices"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const org = new URL(request.url).searchParams.get("organization_id");
    if (org && org !== mockOrg.id) {
      return HttpResponse.json({ detail: "Not permitted for this organization" }, { status: 403 });
    }
    await latency();
    const seen = lastSeenMap(Date.now());
    const items = mockState().world.devices.map((d) => toDevice(d, seen.get(d.id) ?? null));
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.post(url("/devices"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const body = (await request.json()) as {
      id?: string;
      type?: string;
      site_id?: string;
      latitude?: number;
      longitude?: number;
      metrics?: string[];
    };
    const { world } = mockState();
    const id = (body.id ?? "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(id)) return bad("Device ID must be 3–40 lowercase letters, numbers or hyphens");
    if (world.deviceById.has(id)) return HttpResponse.json({ detail: `${id} is already registered` }, { status: 409 });
    const site = world.sites.find((s) => s.id === body.site_id);
    if (!site) return bad("Choose a site");
    const metrics = (body.metrics ?? []).filter(isMetricId);
    if (metrics.length === 0) return bad("Choose at least one metric");
    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") return bad("Enter coordinates");
    await latency();
    const device: SimDevice = {
      idx: world.devices.length,
      id,
      site,
      type: body.type === "weather" ? "weather" : "air-quality",
      metrics,
      lat: body.latitude,
      lng: body.longitude,
      phaseMs: Math.floor(Math.random() * CADENCE_MS),
      // The simulator starts reporting for the new device a few seconds after registration.
      activeFrom: Date.now() + 4000,
    };
    world.devices.push(device);
    world.deviceById.set(id, device);
    return HttpResponse.json({ device: toDevice(device, null), api_key: newKey() }, { status: 201 });
  }),

  http.get(url("/devices/:id"), async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const d = mockState().world.deviceById.get(String(params.id));
    if (!d) return notFound("Device");
    await latency();
    return HttpResponse.json(toDevice(d, lastSeenMap(Date.now()).get(d.id) ?? null));
  }),

  http.patch(url("/devices/:id"), async ({ request, params }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const { world } = mockState();
    const d = world.deviceById.get(String(params.id));
    if (!d) return notFound("Device");
    const patch = (await request.json()) as { type?: string; site_id?: string; status?: string };
    await latency();
    if (patch.type === "weather" || patch.type === "air-quality") d.type = patch.type;
    if (patch.site_id) {
      const site = world.sites.find((s) => s.id === patch.site_id);
      if (!site) return bad("Unknown site");
      d.site = site;
    }
    if (patch.status === "deactivated") d.deactivatedAt = Date.now();
    if (patch.status === "active") d.deactivatedAt = null;
    return HttpResponse.json(toDevice(d, lastSeenMap(Date.now()).get(d.id) ?? null));
  }),

  http.post(url("/devices/:id/rotate-key"), async ({ request, params }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const d = mockState().world.deviceById.get(String(params.id));
    if (!d) return notFound("Device");
    await latency();
    const now = Date.now();
    mockState().rotatedAt.set(d.id, now);
    return HttpResponse.json({ device_id: d.id, api_key: newKey(), rotated_at: iso(now) });
  }),

  http.get(url("/devices/:id/health"), async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const d = mockState().world.deviceById.get(String(params.id));
    if (!d) return notFound("Device");
    await latency();
    const now = Date.now();
    const lastSeen = lastSeenMap(now).get(d.id) ?? null;
    return HttpResponse.json({ device_id: d.id, last_seen_at: lastSeen, ...healthOf(d, now, lastSeen) });
  }),

  http.get(url("/devices/:id/ingestion-events"), async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const { world, scenario } = mockState();
    const d = world.deviceById.get(String(params.id));
    if (!d) return notFound("Device");
    await latency();
    const now = Date.now();
    const items: IngestionEvent[] = [];
    const last = tickAt(d, now);
    for (let tick = last; tick > last - 60 && items.length < 50; tick--) {
      const r = readingFor(world, scenario, d, tick);
      if (!r) continue;
      const plan = deliveryPlan(world, scenario, r);
      const id = r.rows[0]!.reading_id;
      const first = plan[0]!;
      if (first > now) continue;
      if (r.faults.includes("clock_error")) {
        items.push({ device_id: d.id, reading_id: id, outcome: "quarantined", reason: "Event time 2 h ahead of receipt", received_at: iso(first) });
      } else if (r.faults.includes("late")) {
        const late = Math.round((first - r.emitAt) / 1000);
        items.push({ device_id: d.id, reading_id: id, outcome: "late", reason: `Arrived ${late} s after its event time; stored in order`, received_at: iso(first) });
      } else {
        const reason = r.faults.includes("spike") ? "Accepted and flagged suspicious: spike" : null;
        items.push({ device_id: d.id, reading_id: id, outcome: "accepted", reason, received_at: iso(first) });
      }
      if (plan[1] && plan[1] <= now) {
        items.push({ device_id: d.id, reading_id: id, outcome: "duplicate", reason: "Same reading_id already stored; ignored", received_at: iso(plan[1]) });
      }
    }
    items.sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.get(url("/health/devices"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    await latency();
    const now = Date.now();
    const seen = lastSeenMap(now);
    const items = mockState().world.devices.map((d) => {
      const lastSeen = seen.get(d.id) ?? null;
      const h = healthOf(d, now, lastSeen);
      return { device_id: d.id, site_id: d.site.id, health: h.health, last_seen_at: lastSeen, latest_event: h.events[0] ?? null };
    });
    return HttpResponse.json({ items, next_cursor: null });
  }),

  // ---- Measurements ----
  http.get(url("/measurements"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const q = new URL(request.url).searchParams;
    const metric = q.get("metric") ?? "";
    const from = Date.parse(q.get("from") ?? "");
    const to = Math.min(Date.parse(q.get("to") ?? ""), Date.now());
    const { world, scenario } = mockState();
    const d = world.deviceById.get(q.get("device_id") ?? "");
    if (!d) return bad("device_id is required");
    if (!isMetricId(metric)) return bad("Unknown metric");
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return bad("from and to must be ISO timestamps with from < to");
    if (to - from > 24 * HOUR + 60_000) return bad("Raw readings are limited to 24 h. Use aggregates for longer ranges");
    const limit = Math.min(10_000, Number(q.get("limit") ?? 5000));
    const startTick = q.get("cursor") ? Number(q.get("cursor")) : tickAt(d, from) + 1;
    const endTick = tickAt(d, to);
    await latency();
    const items: Measurement[] = [];
    let tick = startTick;
    for (; tick <= endTick && items.length < limit; tick++) {
      const r = readingFor(world, scenario, d, tick);
      if (!r) continue;
      const row = r.rows.find((x) => x.metric === metric);
      if (!row) continue;
      const received = deliveryPlan(world, scenario, r)[0]!;
      items.push({ ...row, received_at: iso(received) });
    }
    return HttpResponse.json({ items, next_cursor: tick <= endTick ? String(tick) : null });
  }),

  http.get(url("/measurements/aggregates"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const q = new URL(request.url).searchParams;
    const metric = q.get("metric") ?? "pm25";
    if (!isMetricId(metric)) return bad("Unknown metric");
    const from = Date.parse(q.get("from") ?? "");
    const to = Date.parse(q.get("to") ?? "");
    const bucketMs = BUCKET_MS[(q.get("bucket") ?? "1h") as Bucket] ?? HOUR;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return bad("from and to must be ISO timestamps with from < to");
    if ((to - from) / bucketMs > 5000) return bad("Too many buckets; choose a larger bucket");
    const { world } = mockState();
    const group = q.get("group_by") ?? "all";
    let target: Parameters<typeof aggregatesFor>[4];
    if (group === "site") {
      const site = world.sites.find((s) => s.id === q.get("site_id"));
      if (!site) return bad("site_id is required for group_by=site");
      target = { sites: [site], devices: world.devices.filter((d) => d.site.id === site.id && d.metrics.includes(metric)).length };
    } else if (group === "device") {
      const d = world.deviceById.get(q.get("device_id") ?? "");
      if (!d) return bad("device_id is required for group_by=device");
      target = { sites: [d.site], device: d, devices: 1 };
    } else {
      target = cityTarget(metric);
    }
    await latency();
    return HttpResponse.json({ items: aggregatesFor(metric, from, to, bucketMs, target), next_cursor: null });
  }),

  http.get(url("/measurements/quality-summary"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const days = Math.min(30, Number(new URL(request.url).searchParams.get("days") ?? 7));
    await latency();
    return HttpResponse.json({ days: qualityDays(days, Date.now()) });
  }),

  http.get(url("/heatmap"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const q = new URL(request.url).searchParams;
    const metric = q.get("metric") ?? "pm25";
    if (!isMetricId(metric)) return bad("Unknown metric");
    const atParam = q.get("at");
    const at = atParam ? Date.parse(atParam) : undefined;
    await latency();
    return HttpResponse.json(heatmapFor(metric, Date.now(), { at, includeSuspicious: q.get("include_suspicious") === "true" }));
  }),

  // ---- Alerts ----
  http.get(url("/alerts"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const statuses = new URL(request.url).searchParams.getAll("status");
    await latency();
    const { alerts } = mockState();
    const items = statuses.length ? alerts.filter((a) => statuses.includes(a.status)) : alerts;
    return HttpResponse.json({ items, next_cursor: null });
  }),

  http.get(url("/alerts/:id"), async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const alert = mockState().alerts.find((a) => a.id === params.id);
    if (!alert) return notFound("Alert");
    await latency();
    return HttpResponse.json(alert);
  }),

  http.post(url("/alerts/:id/acknowledge"), async ({ request, params }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    await latency();
    const alert = mockState().alerts.find((a) => a.id === params.id);
    if (!alert) return notFound("Alert");
    if (alert.status === "resolved") return HttpResponse.json({ detail: "Alert is already resolved" }, { status: 409 });
    alert.status = "acknowledged";
    alert.acknowledged_at = iso(Date.now());
    // Environmental hazards recover in the mock shortly after acknowledgement, so the full
    // lifecycle (Active → Acknowledged → Resolved) can be seen. Device faults stay open.
    if (alert.kind === "environment") {
      setTimeout(() => {
        if (alert.status !== "acknowledged") return;
        alert.status = "resolved";
        alert.resolved_at = iso(Date.now());
        broadcastEvent({ type: "alert.resolved", data: alert });
      }, 12_000);
    }
    return HttpResponse.json(alert);
  }),

  // ---- Alert rules, retention ----
  http.get(url("/alert-rules"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    await latency();
    return HttpResponse.json({ items: mockState().rules, next_cursor: null });
  }),

  http.patch(url("/alert-rules/:id"), async ({ request, params }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const rule = mockState().rules.find((r) => r.id === params.id);
    if (!rule) return notFound("Alert rule");
    const patch = (await request.json()) as Partial<typeof rule>;
    if (patch.hysteresis !== undefined && patch.hysteresis < 0) return bad("Hysteresis can’t be negative");
    if (patch.consecutive_readings !== undefined && patch.consecutive_readings < 1) return bad("Use at least 1 consecutive reading");
    if (patch.cooldown_min !== undefined && patch.cooldown_min < 0) return bad("Cooldown can’t be negative");
    await latency();
    Object.assign(rule, patch, { id: rule.id });
    return HttpResponse.json(rule);
  }),

  http.get(url("/retention"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    await latency();
    return HttpResponse.json(mockState().retention);
  }),

  http.put(url("/retention"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const body = (await request.json()) as Retention;
    if (Object.values(body).some((v) => !Number.isInteger(v) || v < 1)) return bad("Every period must be a whole number of days, at least 1");
    if (body.raw_days > body.hourly_days || body.hourly_days > body.daily_days) {
      return bad("Keep raw ≤ hourly ≤ daily: summaries must outlive the data they summarise");
    }
    await latency();
    mockState().retention = body;
    return HttpResponse.json(body);
  }),

  // ---- System ----
  http.get(url("/system/health"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    await latency();
    const t = Math.floor(Date.now() / 5000);
    const wobble = (k: number) => unit(mockState().world.seed, t, k);
    return HttpResponse.json({
      status: "ok",
      generated_at: iso(Date.now()),
      queue_depth: Math.round(40 + wobble(1) * 160),
      ingest_rate_per_s: 99.9 + wobble(2) * 3.2,
      latency_ms: { p50: 310 + wobble(3) * 90, p95: 1180 + wobble(4) * 420, p99: 2300 + wobble(5) * 900 },
      error_rate: 0.002 + wobble(6) * 0.003,
      db_writes_per_s: 296 + wobble(7) * 14,
      valid_rate_24h: 0.9712 + wobble(8) * 0.004,
    });
  }),

  // ---- Reports ----
  http.get(url("/reports/export"), async ({ request }) => {
    const denied = requireAuth(request);
    if (denied) return denied;
    const q = new URL(request.url).searchParams;
    const format = q.get("format") === "pdf" ? "pdf" : "csv";
    const metrics = q.getAll("metrics").filter(isMetricId);
    const siteIds = q.getAll("site_ids");
    const from = Date.parse(q.get("from") ?? "");
    const to = Math.min(Date.parse(q.get("to") ?? ""), Date.now());
    const notes = q.get("quality_notes") === "true";
    if (metrics.length === 0) return bad("Choose at least one metric");
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return bad("Choose a valid time range");
    if (to - from > 90 * 24 * HOUR) return bad("Exports are limited to 90 days");
    await delay(900 + Math.random() * 900);
    const { rows, bucket, truncated } = exportRows(siteIds, metrics, from, to);
    const header = [
      "EnviroWatch export",
      `Generated ${iso(Date.now())}`,
      `Range ${iso(from)} to ${iso(to)} (UTC)`,
      `Summary ${bucket === HOUR ? "hourly" : "daily"} per site`,
      `Units ${metrics.map((m) => `${m} = ${METRICS[m].unit}`).join("; ")}`,
      ...(truncated ? ["Truncated at 50,000 rows; narrow the range or sites"] : []),
      ...(notes ? QUALITY_NOTES.map((n) => `Quality note: ${n}`) : []),
    ];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    if (format === "csv") {
      const lines = [
        ...header.map((h) => `# ${h}`),
        ["site_id", "site_name", "metric", "unit", "bucket_start_utc", "min", "max", "mean", "valid_readings"].join(","),
        ...rows.map(({ site, metric, a }) =>
          [site.id, site.name, metric, METRICS[metric].unit, a.bucket_start, a.min, a.max, a.avg, a.count].map(csvCell).join(","),
        ),
      ];
      return new HttpResponse("﻿" + lines.join("\n"), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="envirowatch-${stamp}.csv"` },
      });
    }
    const table = rows
      .slice(0, 2000)
      .map(
        ({ site, metric, a }) =>
          `${site.name.padEnd(16).slice(0, 16)} ${metric.padEnd(17)} ${a.bucket_start.slice(0, 16)}  ${a.min.toFixed(1).padStart(7)} ${a.max.toFixed(1).padStart(7)} ${a.avg.toFixed(1).padStart(7)} ${String(a.count).padStart(7)}`,
      );
    const pdf = simplePdf(
      [
        ...header.slice(1),
        "",
        "Site             Metric            Bucket (UTC)          Min     Max    Mean   Count",
        ...table,
        ...(rows.length > 2000 ? ["", `${rows.length - 2000} more rows in the CSV export`] : []),
      ],
      { title: "EnviroWatch report" },
    );
    return new HttpResponse(pdf, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="envirowatch-${stamp}.pdf"` },
    });
  }),

  // ---- Simulator ----
  http.get(url("/simulator/run"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    await delay(80);
    return HttpResponse.json({ run: simView(mockState().simRun) });
  }),

  http.post(url("/simulator/run"), async ({ request }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const body = (await request.json()) as { scenario?: SimRun["scenario"]; seed?: number; faults?: SimFault[]; speed?: number };
    const scenario = body.scenario ?? "fault_hour";
    const seed = Number(body.seed);
    if (!Number.isInteger(seed) || seed < 0) return bad("Seed must be a whole number, 0 or more");
    const faults = body.faults ?? [];
    if (scenario === "custom" && faults.length === 0) return bad("Choose at least one fault for a custom mix");
    const speed = Math.min(600, Math.max(1, Number(body.speed ?? 60)));
    await latency();
    const now = Date.now();
    mockState().simRun = {
      id: `run-${now}`,
      scenario,
      seed,
      faults,
      speed,
      startedAt: now,
      bankedS: 0,
      resumedAt: now,
      stopped: false,
      plan: planRun(seed, scenario, faults),
    };
    return HttpResponse.json({ run: simView(mockState().simRun) }, { status: 201 });
  }),

  http.post(url("/simulator/run/:action"), async ({ request, params }) => {
    const denied = requireAdmin(request);
    if (denied) return denied;
    const r = mockState().simRun;
    if (!r) return HttpResponse.json({ detail: "No run in progress" }, { status: 409 });
    const now = Date.now();
    if (params.action === "pause" && r.resumedAt !== null) {
      r.bankedS = simElapsed(r, now);
      r.resumedAt = null;
    } else if (params.action === "resume" && r.resumedAt === null && !r.stopped) {
      r.resumedAt = now;
    } else if (params.action === "stop") {
      r.bankedS = simElapsed(r, now);
      r.resumedAt = null;
      r.stopped = true;
    }
    await delay(80);
    return HttpResponse.json({ run: simView(r) });
  }),

  // ---- Public (no auth; approved data only) ----
  http.get(url("/public/summary"), async () => {
    await latency();
    const now = Date.now();
    const heat = heatmapFor("pm25", now);
    const tempBySite = new Map(heatmapFor("temperature_c", now).samples.map((s) => [s.site_id, s]));
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

  http.get(url("/public/heatmap"), async ({ request }) => {
    const metric = new URL(request.url).searchParams.get("metric") ?? "pm25";
    if (!isMetricId(metric)) return bad("Unknown metric");
    await latency();
    return HttpResponse.json(heatmapFor(metric, Date.now()));
  }),

  http.get(url("/public/trend"), async ({ request }) => {
    const metric = new URL(request.url).searchParams.get("metric") ?? "pm25";
    if (!isMetricId(metric)) return bad("Unknown metric");
    await latency();
    const to = Date.now();
    const from = Math.floor(to / HOUR) * HOUR - 23 * HOUR;
    const points = aggregatesFor(metric, from, to, HOUR, cityTarget(metric)).map((a) => ({ bucket_start: a.bucket_start, avg: a.avg }));
    return HttpResponse.json({ metric, unit: METRICS[metric].unit, points });
  }),

  http.get(url("/public/export.csv"), async () => {
    await delay(400);
    const now = Date.now();
    const pm = heatmapFor("pm25", now);
    const temp = new Map(heatmapFor("temperature_c", now).samples.map((s) => [s.site_id, s]));
    const { world } = mockState();
    const lines = [
      "# EnviroWatch public readings",
      `# Generated ${iso(now)} (UTC)`,
      "# Each value is the mean of valid sensors in the area. Suspicious and stale readings are excluded.",
      "area,pm25_ug_m3,temperature_c,newest_reading_utc,sensors",
      ...pm.samples.map((s) =>
        [
          world.sites.find((x) => x.id === s.site_id)?.name ?? s.site_id,
          s.value.toFixed(1),
          temp.get(s.site_id)?.value.toFixed(1) ?? "",
          s.event_time,
          s.device_count,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    return new HttpResponse("﻿" + lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="envirowatch-public-${iso(now).slice(0, 10)}.csv"`,
      },
    });
  }),
];
