/**
 * Ground truth for a fault-injection run (PRD §12, §15). Deterministic per seed: the same seed
 * and scenario always inject the same faults at the same simulated times, and the simulated
 * detectors catch, delay or miss them the same way. The UI compares detections with this log.
 */
import type { SimFault, SimRun } from "@/lib/api/types";
import { unit } from "./rng";
import { deviceId } from "./world";

export interface PlannedEvent {
  id: string;
  fault_type: SimFault;
  device_id: string;
  injected_s: number;
  /** null: the detectors never catch it. */
  detected_s: number | null;
}

export interface Plan {
  duration_s: number;
  events: PlannedEvent[];
  false_alerts: Array<{ id: string; device_id: string; fault_type: SimFault; detected_s: number }>;
}

/** Detector behaviour per fault: chance of detection and delay range in seconds. */
const DETECTOR: Record<SimFault, { p: number; delay: [number, number] }> = {
  duplicate: { p: 1, delay: [0, 2] },
  late: { p: 1, delay: [0, 5] },
  clock_error: { p: 0.95, delay: [5, 30] },
  silent: { p: 0.92, delay: [30, 60] },
  network: { p: 0.9, delay: [30, 90] },
  spike: { p: 0.85, delay: [10, 40] },
  drift: { p: 0.6, delay: [600, 1500] },
};

/** A fault still undetected after this window counts as missed. Drift gets longer. */
export function detectionWindow(f: SimFault): number {
  return f === "drift" ? 1800 : 600;
}

export const ALL_FAULTS: SimFault[] = ["duplicate", "late", "silent", "clock_error", "spike", "drift", "network"];

export function planRun(seed: number, scenario: SimRun["scenario"], faults: SimFault[]): Plan {
  const duration_s = scenario === "baseline" ? 1800 : 3600;
  const kinds = scenario === "baseline" ? [] : scenario === "fault_hour" ? ALL_FAULTS : faults;
  const events: PlannedEvent[] = [];
  if (kinds.length) {
    // About one injected fault every 90 s, spread over the first 80 % of the run.
    const count = Math.round((duration_s * 0.8) / 90);
    for (let i = 0; i < count; i++) {
      const fault_type = kinds[Math.floor(unit(seed, i, 101) * kinds.length)]!;
      const injected_s = Math.round(((i + unit(seed, i, 102)) / count) * duration_s * 0.8);
      const det = DETECTOR[fault_type];
      const caught = unit(seed, i, 103) < det.p;
      const delay = det.delay[0] + unit(seed, i, 104) * (det.delay[1] - det.delay[0]);
      events.push({
        id: `gt-${String(i + 1).padStart(3, "0")}`,
        fault_type,
        device_id: deviceId(Math.floor(unit(seed, i, 105) * 1000)),
        injected_s,
        detected_s: caught ? Math.round(injected_s + delay) : null,
      });
    }
  }
  // Detectors aren't perfect: a few alerts fire where nothing was injected.
  const falseCount = scenario === "baseline" ? 1 : 3;
  const false_alerts = Array.from({ length: falseCount }, (_, i) => ({
    id: `fp-${i + 1}`,
    device_id: deviceId(Math.floor(unit(seed, i, 201) * 1000)),
    fault_type: (["spike", "drift", "silent"] as const)[i % 3]!,
    detected_s: Math.round(unit(seed, i, 202) * duration_s),
  }));
  return { duration_s, events, false_alerts };
}

/** What the run looks like `elapsed` simulated seconds in. */
export function runSnapshot(plan: Plan, elapsed: number, finished: boolean): Pick<SimRun, "events" | "false_alerts"> {
  return {
    events: plan.events
      .filter((e) => e.injected_s <= elapsed)
      .map((e) => {
        const detected = e.detected_s !== null && e.detected_s <= elapsed;
        const expired = finished || elapsed >= e.injected_s + detectionWindow(e.fault_type);
        return {
          ...e,
          detected_s: detected ? e.detected_s : null,
          outcome: detected ? "detected" : expired ? "missed" : "pending",
        } as const;
      }),
    false_alerts: plan.false_alerts.filter((f) => f.detected_s <= elapsed),
  };
}
