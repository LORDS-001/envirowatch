/**
 * The simulated network: 46 sites across Lagos and 1,000 devices. Generated from a seed, so the
 * same seed always produces the same world.
 */
import type { MetricId } from "@/lib/metrics";
import { gauss, unit } from "./rng";

export const ORG = { id: "org-lagos", name: "Lagos Community Sensor Network" } as const;
export const OTHER_ORG = { id: "org-ibadan", name: "Ibadan Air Watch" } as const;

export interface SimSite {
  idx: number;
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Typical PM2.5 level, µg/m³ (industrial and port areas run higher). */
  pmBase: number;
  tempOffset: number;
  humOffset: number;
  phase: number;
}

export interface SimDevice {
  idx: number;
  id: string;
  site: SimSite;
  type: "air-quality" | "weather";
  metrics: MetricId[];
  lat: number;
  lng: number;
  /** Offset of this device's 10 s reporting slot, ms. */
  phaseMs: number;
}

// [name, lat, lng, PM2.5 base]
const SITE_TABLE: ReadonlyArray<readonly [string, number, number, number]> = [
  ["Yaba", 6.5095, 3.3711, 19],
  ["Yaba North", 6.52, 3.379, 18],
  ["Akoka", 6.525, 3.388, 16],
  ["Bariga", 6.54, 3.385, 20],
  ["Ebute Metta", 6.485, 3.38, 24],
  ["Costain", 6.49, 3.365, 26],
  ["Surulere", 6.5, 3.35, 22],
  ["Mushin", 6.53, 3.35, 27],
  ["Palmgrove", 6.545, 3.365, 21],
  ["Ilupeju", 6.555, 3.36, 25],
  ["Oshodi", 6.555, 3.343, 45],
  ["Isolo", 6.53, 3.32, 26],
  ["Ejigbo", 6.55, 3.3, 22],
  ["Ikotun", 6.55, 3.27, 21],
  ["Egbeda", 6.59, 3.285, 20],
  ["Alimosho", 6.61, 3.29, 21],
  ["Agege", 6.615, 3.32, 24],
  ["Ogba", 6.625, 3.34, 20],
  ["Ikeja", 6.6018, 3.3515, 23],
  ["Ikeja GRA", 6.58, 3.355, 15],
  ["Maryland", 6.57, 3.367, 24],
  ["Ojota", 6.584, 3.379, 25],
  ["Ogudu", 6.58, 3.395, 18],
  ["Ketu", 6.597, 3.39, 23],
  ["Magodo", 6.615, 3.38, 14],
  ["Ojodu", 6.642, 3.37, 19],
  ["Isheri", 6.63, 3.4, 15],
  ["Gbagada", 6.555, 3.39, 19],
  ["Ikorodu", 6.6194, 3.5105, 20],
  ["Lagos Island", 6.4541, 3.3947, 26],
  ["Ikoyi", 6.455, 3.435, 13],
  ["Victoria Island", 6.428, 3.421, 14],
  ["Oniru", 6.432, 3.45, 13],
  ["Lekki Phase 1", 6.4474, 3.472, 12],
  ["Ikota", 6.445, 3.55, 13],
  ["Ajah", 6.4667, 3.5667, 15],
  ["Sangotedo", 6.47, 3.63, 14],
  ["Ijora", 6.47, 3.365, 38],
  ["Apapa GRA", 6.449, 3.359, 28],
  ["Apapa Port", 6.443, 3.365, 52],
  ["Amuwo Odofin", 6.46, 3.3, 22],
  ["Festac", 6.467, 3.283, 20],
  ["Satellite Town", 6.45, 3.27, 21],
  ["Badagry Road", 6.465, 3.23, 19],
  ["Ojo", 6.46, 3.18, 17],
  ["Iganmu", 6.478, 3.372, 30],
];

export const DEVICE_COUNT = 1000;
export const CADENCE_MS = 10_000;

export interface World {
  seed: number;
  sites: SimSite[];
  devices: SimDevice[];
  deviceById: Map<string, SimDevice>;
}

export function deviceId(idx: number): string {
  return `sensor-${String(idx + 1).padStart(3, "0")}`;
}

export function createWorld(seed: number): World {
  const sites: SimSite[] = SITE_TABLE.map(([name, lat, lng, pmBase], idx) => ({
    idx,
    id: `site-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    lat,
    lng,
    pmBase,
    tempOffset: gauss(seed, idx, 11) * 0.8,
    humOffset: gauss(seed, idx, 12) * 3,
    phase: unit(seed, idx, 13) * Math.PI * 2,
  }));

  const devices: SimDevice[] = [];
  for (let i = 0; i < DEVICE_COUNT; i++) {
    const site = sites[i % sites.length]!;
    const weather = i % 5 === 4;
    // Scatter devices up to ~450 m around their site centre.
    const r = Math.sqrt(unit(seed, i, 21)) * 0.004;
    const a = unit(seed, i, 22) * Math.PI * 2;
    devices.push({
      idx: i,
      id: deviceId(i),
      site,
      type: weather ? "weather" : "air-quality",
      metrics: weather ? ["temperature_c", "humidity_percent"] : ["pm25", "temperature_c", "humidity_percent"],
      lat: site.lat + r * Math.sin(a),
      lng: site.lng + r * Math.cos(a),
      phaseMs: Math.floor(unit(seed, i, 23) * CADENCE_MS),
    });
  }
  return { seed, sites, devices, deviceById: new Map(devices.map((d) => [d.id, d])) };
}
