// @vitest-environment node
import { baselineScenario, deliveryPlan, readingFor, tickAt } from "./model";
import { createWorld } from "./world";

const t0 = Date.parse("2026-11-05T10:00:00Z");

describe("seeded simulator", () => {
  it("produces the same world and readings for the same seed", () => {
    const a = createWorld(4242);
    const b = createWorld(4242);
    const s = baselineScenario(t0);
    expect(a.devices[17]).toEqual(b.devices[17]);
    const d = a.devices[17]!;
    const tick = tickAt(d, t0);
    expect(readingFor(a, s, d, tick)).toEqual(readingFor(b, s, b.devices[17]!, tick));
  });

  it("has 1,000 devices across 46 sites", () => {
    const w = createWorld(1);
    expect(w.devices).toHaveLength(1000);
    expect(new Set(w.devices.map((d) => d.site.id)).size).toBe(46);
  });

  it("silences sensor-014 and keeps one reading_id per logical reading", () => {
    const w = createWorld(4242);
    const s = baselineScenario(t0);
    const silent = w.deviceById.get("sensor-014")!;
    expect(readingFor(w, s, silent, tickAt(silent, t0))).toBeNull();
    const d = w.devices[3]!;
    const r = readingFor(w, s, d, tickAt(d, t0))!;
    expect(new Set(r.rows.map((x) => x.reading_id)).size).toBe(1);
  });

  it("quarantines the wrong-clock device with its reason", () => {
    const w = createWorld(4242);
    const s = baselineScenario(t0);
    const d = w.deviceById.get("sensor-733")!;
    const r = readingFor(w, s, d, tickAt(d, t0))!;
    expect(r.rows.every((x) => x.quality_status === "quarantined" && x.quality_reason === "clock error")).toBe(true);
    expect(r.faults).toContain("clock_error");
  });

  it("injects duplicates at roughly the configured rate", () => {
    const w = createWorld(4242);
    const s = baselineScenario(t0);
    let dupes = 0;
    let n = 0;
    for (const d of w.devices.slice(0, 200)) {
      for (let k = 0; k < 20; k++) {
        const r = readingFor(w, s, d, tickAt(d, t0 - 7 * 60_000) + k);
        if (!r) continue;
        n++;
        if (deliveryPlan(w, s, r).length > 1) dupes++;
      }
    }
    expect(dupes / n).toBeGreaterThan(0.004);
    expect(dupes / n).toBeLessThan(0.02);
  });
});
