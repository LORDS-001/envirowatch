/**
 * Inverse distance weighting (PRD §11, FR-017). Pure functions so the worker, the mini-map,
 * the PDF export and the tests share one implementation.
 *
 *   ẑ(x) = Σ wᵢ(x)·zᵢ / Σ wᵢ(x),   wᵢ(x) = 1 / d(x, xᵢ)ᵖ
 */

export interface IdwSample {
  lat: number;
  lng: number;
  value: number;
}

export interface IdwEstimate {
  value: number;
  /** Distance in metres to the nearest sample. */
  nearestM: number;
  /** True when the point coincides with a sample and its value was returned unchanged. */
  exact: boolean;
}

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distances below this are treated as "at the sensor" (1 mm). */
const EXACT_M = 1e-3;

export function idw(lat: number, lng: number, samples: readonly IdwSample[], power = 2): IdwEstimate | null {
  if (samples.length === 0) return null;
  let num = 0;
  let den = 0;
  let nearestM = Infinity;
  for (const s of samples) {
    const d = haversine(lat, lng, s.lat, s.lng);
    if (d < EXACT_M) return { value: s.value, nearestM: d, exact: true };
    if (d < nearestM) nearestM = d;
    const w = 1 / d ** power;
    num += w * s.value;
    den += w;
  }
  return { value: num / den, nearestM, exact: false };
}

/**
 * Coverage opacity: 1 within 55 % of the radius from the nearest valid sensor, fading linearly
 * to 0 at the radius, and 0 beyond. The surface is never extrapolated past coverage.
 */
export function coverageAlpha(nearestM: number, radiusM: number, fadeStart = 0.55): number {
  const inner = radiusM * fadeStart;
  if (nearestM <= inner) return 1;
  if (nearestM >= radiusM) return 0;
  return 1 - (nearestM - inner) / (radiusM - inner);
}

export interface GridRequest {
  /** [south, west, north, east] in degrees. */
  bounds: [number, number, number, number];
  cols: number;
  rows: number;
  samples: IdwSample[];
  power: number;
  radiusM: number;
}

export interface GridResult {
  cols: number;
  rows: number;
  /** Row-major, north row first. NaN where outside coverage. */
  values: Float32Array;
  alpha: Float32Array;
}

/** Evaluates IDW at cell centres. Used by the worker; cheap enough on the main thread for small grids. */
export function computeGrid({ bounds, cols, rows, samples, power, radiusM }: GridRequest): GridResult {
  const [south, west, north, east] = bounds;
  const values = new Float32Array(cols * rows);
  const alpha = new Float32Array(cols * rows);
  const dLat = (north - south) / rows;
  const dLng = (east - west) / cols;
  for (let r = 0; r < rows; r++) {
    const lat = north - (r + 0.5) * dLat;
    for (let c = 0; c < cols; c++) {
      const lng = west + (c + 0.5) * dLng;
      const i = r * cols + c;
      const est = idw(lat, lng, samples, power);
      const a = est ? coverageAlpha(est.nearestM, radiusM) : 0;
      alpha[i] = a;
      values[i] = est && a > 0 ? est.value : Number.NaN;
    }
  }
  return { cols, rows, values, alpha };
}
