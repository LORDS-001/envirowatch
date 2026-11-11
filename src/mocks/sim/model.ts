/**
 * Environmental model and fault injection (PRD §12). Values are smooth, correlated functions of
 * time and place plus seeded noise, so the same seed and time always give the same reading.
 */
import type { Measurement } from "@/lib/api/types";
import { METRICS, type MetricId } from "@/lib/metrics";
import { gauss, unit } from "./rng";
import { CADENCE_MS, type SimDevice, type SimSite, type World } from "./world";

const HOUR = 3_600_000;
const TAU = Math.PI * 2;

function hourWat(t: number): number {
  return ((t / HOUR + 1) % 24 + 24) % 24; // WAT = UTC+1
}

/** Gaussian bump around hour `c` with width `s`, wrapping at midnight. */
function bump(h: number, c: number, s: number): number {
  const d = Math.min(Math.abs(h - c), 24 - Math.abs(h - c));
  return Math.exp(-(d * d) / (2 * s * s));
}

/** The noise-free "true" value at a site: what a perfect sensor would read. */
export function trueValue(site: SimSite, metric: MetricId, t: number): number {
  const h = hourWat(t);
  const diurnal = Math.sin((TAU * (h - 9)) / 24); // peaks mid-afternoon
  const weather = Math.sin((TAU * t) / (5.3 * HOUR) + site.phase); // slow, citywide-correlated drift
  switch (metric) {
    case "temperature_c":
      return 27.6 + 3.9 * diurnal + 0.6 * weather + site.tempOffset;
    case "humidity_percent":
      return Math.min(99, 77 - 13 * diurnal - 3 * weather + site.humOffset);
    case "pm25": {
      const traffic = 0.72 + 0.42 * bump(h, 8, 1.6) + 0.5 * bump(h, 19.5, 2.2);
      return Math.max(1, site.pmBase * traffic * (1 + 0.12 * weather));
    }
  }
}

// ---- Faults ----

export type FaultKind = "silent" | "drift" | "spike" | "clock_error" | "duplicate" | "late";

export interface Scenario {
  /** Sim start (ms). Faults are placed relative to it so a fresh page always shows them. */
  t0: number;
  silentDevice: number;
  silentSince: number;
  driftDevice: number;
  driftStart: number;
  /** µg/m³ per hour. */
  driftRate: number;
  spikeDevice: number;
  clockDevice: number;
  /** Probability a reading is sent twice. */
  duplicateRate: number;
  /** Probability a reading is delayed 30–180 s. */
  lateRate: number;
}

export function baselineScenario(t0: number): Scenario {
  return {
    t0,
    silentDevice: 13, // sensor-014
    silentSince: t0 - 6 * 60_000,
    driftDevice: 206, // sensor-207
    driftStart: t0 - 6 * HOUR,
    driftRate: 0.7,
    spikeDevice: 511, // sensor-512
    clockDevice: 732, // sensor-733
    duplicateRate: 0.01,
    lateRate: 0.02,
  };
}

export interface SimReading {
  device: SimDevice;
  tick: number;
  /** Nominal emission time (ms). */
  emitAt: number;
  rows: Measurement[];
  /** Ground truth for the evaluation log. */
  faults: FaultKind[];
}

/** Tick k of device d is emitted at k·cadence + phase. */
export function tickAt(device: SimDevice, t: number): number {
  return Math.floor((t - device.phaseMs) / CADENCE_MS);
}

export function emitTime(device: SimDevice, tick: number): number {
  return tick * CADENCE_MS + device.phaseMs;
}

export function isSilent(s: Scenario, device: SimDevice, t: number): boolean {
  return device.idx === s.silentDevice && t >= s.silentSince;
}

/** The reading a device produces at a tick, or null if it produced none (silent). */
export function readingFor(world: World, s: Scenario, device: SimDevice, tick: number): SimReading | null {
  const t = emitTime(device, tick);
  if (isSilent(s, device, t)) return null;
  if (device.activeFrom !== undefined && t < device.activeFrom) return null;
  if (device.deactivatedAt && t >= device.deactivatedAt) return null;
  const faults: FaultKind[] = [];
  const seed = world.seed;

  const spike = device.idx === s.spikeDevice && unit(seed, device.idx, tick, 31) < 0.012;
  const clock = device.idx === s.clockDevice;
  if (spike) faults.push("spike");
  if (clock) faults.push("clock_error");
  if (device.idx === s.driftDevice && t > s.driftStart) faults.push("drift");

  const eventMs = clock ? t + 2 * HOUR : t;
  const event_time = new Date(eventMs).toISOString();
  const reading_id = `${device.id}-${String(tick).padStart(9, "0")}`;

  const rows: Measurement[] = device.metrics.map((metric, m) => {
    const def = METRICS[metric];
    let value = trueValue(device.site, metric, t);
    const noise = gauss(seed, device.idx, tick, m);
    if (metric === "pm25") value *= 1 + 0.08 * noise;
    else if (metric === "temperature_c") value += 0.25 * noise;
    else value += 1.2 * noise;
    if (metric === "pm25" && device.idx === s.driftDevice && t > s.driftStart) {
      value += (s.driftRate * (t - s.driftStart)) / HOUR;
    }
    let quality_status: Measurement["quality_status"] = "valid";
    let quality_reason: string | null = null;
    if (spike && metric === "pm25") {
      value *= 4.4;
      quality_status = "suspicious";
      quality_reason = "spike +340 %";
    }
    if (clock) {
      quality_status = "quarantined";
      quality_reason = "clock error";
    }
    value = Math.min(def.plausible[1], Math.max(def.plausible[0], value));
    return {
      device_id: device.id,
      reading_id,
      metric,
      value: Number(value.toFixed(def.decimals === 0 ? 1 : 2)),
      unit: def.unit,
      event_time,
      received_at: event_time, // overwritten on delivery
      quality_status,
      quality_reason,
    };
  });

  return { device, tick, emitAt: t, rows, faults };
}

/** Delivery plan for one reading: when each copy arrives. Duplicates and late delivery live here. */
export function deliveryPlan(world: World, s: Scenario, r: SimReading): number[] {
  const seed = world.seed;
  const base = r.emitAt + 150 + Math.floor(unit(seed, r.device.idx, r.tick, 41) * 900);
  const late = unit(seed, r.device.idx, r.tick, 42) < s.lateRate;
  const first = late ? base + 30_000 + Math.floor(unit(seed, r.device.idx, r.tick, 43) * 150_000) : base;
  if (late) r.faults.push("late");
  const plan = [first];
  if (unit(seed, r.device.idx, r.tick, 44) < s.duplicateRate) {
    r.faults.push("duplicate");
    plan.push(first + 200 + Math.floor(unit(seed, r.device.idx, r.tick, 45) * 2000));
  }
  return plan;
}

/** Latest reading per device and metric as of time t, as the backend would hold it. */
export function latestReadings(world: World, s: Scenario, t: number): Measurement[] {
  const out: Measurement[] = [];
  for (const d of world.devices) {
    let tick = tickAt(d, t);
    let r = readingFor(world, s, d, tick);
    // A silent device's latest stored reading is the one before it went quiet.
    if (!r && isSilent(s, d, emitTime(d, tick))) {
      tick = tickAt(d, s.silentSince) - 1;
      r = readingFor(world, s, d, tick);
    }
    if (!r) continue;
    const received = new Date(r.emitAt + 600).toISOString();
    for (const row of r.rows) out.push({ ...row, received_at: received });
  }
  return out;
}
