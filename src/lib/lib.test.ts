// @vitest-environment node
import type { SimRun } from "@/lib/api/types";
import { evaluate } from "./evaluation";
import { lttb } from "./lttb";

describe("evaluate", () => {
  const ev = (outcome: "detected" | "missed" | "pending", injected = 0, detected: number | null = null) => ({
    id: Math.random().toString(),
    fault_type: "spike" as const,
    device_id: "sensor-001",
    injected_s: injected,
    detected_s: detected,
    outcome,
  });

  it("computes recall = TP/(TP+FN) and precision = TP/(TP+FP), ignoring pending", () => {
    const run: Pick<SimRun, "events" | "false_alerts"> = {
      events: [ev("detected", 0, 30), ev("detected", 100, 190), ev("detected", 200, 260), ev("missed"), ev("pending")],
      false_alerts: [{ id: "f1", device_id: "sensor-002", fault_type: "drift", detected_s: 50 }],
    };
    const e = evaluate(run);
    expect(e).toMatchObject({ injected: 5, detected: 3, missed: 1, pending: 1, falseAlerts: 1 });
    expect(e.recall).toBeCloseTo(3 / 4, 12);
    expect(e.precision).toBeCloseTo(3 / 4, 12);
    expect(e.meanDelayS).toBeCloseTo(60, 12);
  });

  it("returns null ratios when nothing is resolved yet", () => {
    const e = evaluate({ events: [ev("pending")], false_alerts: [] });
    expect(e.recall).toBeNull();
    expect(e.precision).toBeNull();
  });
});

describe("lttb", () => {
  const data = Array.from({ length: 1000 }, (_, i) => ({ t: i, v: i === 500 ? 999 : Math.sin(i / 20) }));

  it("keeps the first, last and the peak, and hits the threshold", () => {
    const out = lttb(data, 100, (d) => d.t, (d) => d.v);
    expect(out).toHaveLength(100);
    expect(out[0]).toBe(data[0]);
    expect(out[99]).toBe(data[999]);
    expect(out.some((d) => d.v === 999)).toBe(true);
  });

  it("returns the input when it is already small", () => {
    expect(lttb(data.slice(0, 10), 100, (d) => d.t, (d) => d.v)).toHaveLength(10);
  });
});
