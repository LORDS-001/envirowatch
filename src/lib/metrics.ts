/**
 * Metric catalogue. Units, precision, plausible ranges, alert thresholds and heat-map bins
 * live here so the tile, chart, map, legend and export all agree.
 */

export type MetricId = "pm25" | "temperature_c" | "humidity_percent";

export interface MetricDef {
  id: MetricId;
  /** Operator label, e.g. "PM2.5". */
  label: string;
  /** Plain-language label for the public portal. */
  publicLabel: string;
  unit: string;
  decimals: number;
  /** Physically plausible range; outside it a reading is invalid. */
  plausible: [number, number];
  /** Alert thresholds. `warn` opens a Pending alert, `critical` an Active one. */
  thresholds: { warn: number; critical: number } | null;
  /** Eight edges for the seven heat bins; the last edge is open-ended ("225+"). */
  heatEdges: readonly [number, number, number, number, number, number, number, number];
  /** Range the radial gauge sweeps across. */
  gaugeRange: [number, number];
}

export const METRICS: Record<MetricId, MetricDef> = {
  pm25: {
    id: "pm25",
    label: "PM2.5",
    publicLabel: "Fine particles",
    unit: "µg/m³",
    decimals: 1,
    plausible: [0, 1000],
    thresholds: { warn: 35, critical: 55 },
    heatEdges: [0, 9, 20, 35, 55, 90, 125, 225],
    gaugeRange: [0, 125],
  },
  temperature_c: {
    id: "temperature_c",
    label: "Temperature",
    publicLabel: "Temperature",
    unit: "°C",
    decimals: 1,
    plausible: [-10, 60],
    thresholds: { warn: 35, critical: 38 },
    heatEdges: [18, 22, 25, 28, 31, 34, 37, 40],
    gaugeRange: [15, 45],
  },
  humidity_percent: {
    id: "humidity_percent",
    label: "Humidity",
    publicLabel: "Humidity",
    unit: "%",
    decimals: 0,
    plausible: [0, 100],
    thresholds: null,
    heatEdges: [30, 45, 55, 65, 75, 85, 92, 100],
    gaugeRange: [0, 100],
  },
};

export const METRIC_IDS = Object.keys(METRICS) as MetricId[];

export function isMetricId(value: string): value is MetricId {
  return value in METRICS;
}

/** Heat bin index 0…6 (heat-1…heat-7). Values below the first edge clamp to 0, above the last to 6. */
export function heatBin(value: number, edges: readonly number[]): number {
  let bin = 0;
  for (let i = 1; i < edges.length - 1; i++) {
    if (value >= (edges[i] as number)) bin = i;
  }
  return bin;
}

/** Air-quality band for plain-language copy (PM2.5 only). */
export function pm25Band(value: number): "good" | "moderate" | "unhealthy for sensitive groups" | "unhealthy" {
  if (value < 9) return "good";
  if (value < 35) return "moderate";
  if (value < 55) return "unhealthy for sensitive groups";
  return "unhealthy";
}
