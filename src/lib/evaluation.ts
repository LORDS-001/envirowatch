/**
 * Fault-detection evaluation (PRD §15): recall = TP / (TP + FN), precision = TP / (TP + FP).
 * Pending faults (injected, detection window still open) count as neither.
 */
import type { SimRun } from "@/lib/api/types";

export interface Evaluation {
  injected: number;
  detected: number;
  missed: number;
  pending: number;
  falseAlerts: number;
  /** null when undefined (no resolved faults / no detections yet). */
  recall: number | null;
  precision: number | null;
  /** Mean seconds from injection to detection (simulated time). */
  meanDelayS: number | null;
}

export function evaluate(run: Pick<SimRun, "events" | "false_alerts">): Evaluation {
  let detected = 0;
  let missed = 0;
  let pending = 0;
  let delay = 0;
  for (const e of run.events) {
    if (e.outcome === "detected") {
      detected++;
      if (e.detected_s !== null) delay += e.detected_s - e.injected_s;
    } else if (e.outcome === "missed") missed++;
    else pending++;
  }
  const falseAlerts = run.false_alerts.length;
  return {
    injected: run.events.length,
    detected,
    missed,
    pending,
    falseAlerts,
    recall: detected + missed > 0 ? detected / (detected + missed) : null,
    precision: detected + falseAlerts > 0 ? detected / (detected + falseAlerts) : null,
    meanDelayS: detected > 0 ? delay / detected : null,
  };
}
