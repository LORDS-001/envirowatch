// @vitest-environment node
import { computeGrid, coverageAlpha, haversine, idw, type IdwSample } from "./index";

// Fixed dataset: four Lagos sites.
const samples: IdwSample[] = [
  { lat: 6.5095, lng: 3.3711, value: 18.2 }, // Yaba
  { lat: 6.443, lng: 3.365, value: 41.7 }, // Apapa Port
  { lat: 6.6018, lng: 3.3515, value: 22.9 }, // Ikeja
  { lat: 6.4474, lng: 3.472, value: 12.4 }, // Lekki Phase 1
];

/**
 * Independent reference: the atan2 form of the haversine (a different, well-conditioned
 * formulation from the implementation's asin form) plus an explicit IDW sum.
 * The spherical law of cosines is deliberately not used: acos loses ~1e-9 precision at km scale.
 */
function referenceIdw(lat: number, lng: number, p: number): number {
  const R = 6_371_008.8;
  const rad = Math.PI / 180;
  let num = 0;
  let den = 0;
  for (const s of samples) {
    const h =
      Math.sin(((s.lat - lat) * rad) / 2) ** 2 +
      Math.cos(lat * rad) * Math.cos(s.lat * rad) * Math.sin(((s.lng - lng) * rad) / 2) ** 2;
    const d = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    const w = 1 / Math.pow(d, p);
    num += w * s.value;
    den += w;
  }
  return num / den;
}

describe("haversine", () => {
  it("is zero for the same point", () => {
    expect(haversine(6.5, 3.4, 6.5, 3.4)).toBe(0);
  });

  it("matches a known distance (one degree of latitude ≈ 111.195 km)", () => {
    expect(haversine(0, 0, 1, 0)).toBeCloseTo(111_195.08, 1);
  });

  it("is symmetric", () => {
    expect(haversine(6.5, 3.3, 6.6, 3.5)).toBeCloseTo(haversine(6.6, 3.5, 6.5, 3.3), 9);
  });
});

describe("idw", () => {
  it.each([
    [6.5, 3.4],
    [6.47, 3.39],
    [6.55, 3.36],
    [6.46, 3.44],
  ])("matches an independent calculation within 1e-9 at (%f, %f)", (lat, lng) => {
    const est = idw(lat, lng, samples, 2);
    expect(est).not.toBeNull();
    expect(Math.abs(est!.value - referenceIdw(lat, lng, 2))).toBeLessThan(1e-9);
  });

  it("returns the sensor value at a sensor location without dividing by zero", () => {
    const est = idw(6.443, 3.365, samples, 2);
    expect(est).toEqual({ value: 41.7, nearestM: 0, exact: true });
  });

  it("stays within the range of the inputs", () => {
    const est = idw(6.52, 3.41, samples, 2)!;
    expect(est.value).toBeGreaterThanOrEqual(12.4);
    expect(est.value).toBeLessThanOrEqual(41.7);
  });

  it("honours the power parameter", () => {
    expect(Math.abs(idw(6.5, 3.4, samples, 3)!.value - referenceIdw(6.5, 3.4, 3))).toBeLessThan(1e-9);
  });

  it("returns null with no samples", () => {
    expect(idw(6.5, 3.4, [], 2)).toBeNull();
  });
});

describe("coverageAlpha", () => {
  it("is opaque within 55 % of the radius, fades, then is transparent", () => {
    expect(coverageAlpha(500, 2000)).toBe(1);
    expect(coverageAlpha(1100, 2000)).toBe(1);
    expect(coverageAlpha(1550, 2000)).toBeCloseTo(0.5, 9);
    expect(coverageAlpha(2000, 2000)).toBe(0);
    expect(coverageAlpha(5000, 2000)).toBe(0);
  });
});

describe("computeGrid", () => {
  it("never extrapolates past coverage", () => {
    const grid = computeGrid({
      bounds: [6.0, 2.9, 7.0, 3.9],
      cols: 20,
      rows: 20,
      samples,
      power: 2,
      radiusM: 4000,
    });
    // The top-left corner is far from every sensor.
    expect(grid.alpha[0]).toBe(0);
    expect(Number.isNaN(grid.values[0])).toBe(true);
    expect(Array.from(grid.alpha).some((a) => a > 0)).toBe(true);
  });
});
