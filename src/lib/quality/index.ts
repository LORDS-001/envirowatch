/**
 * Data-quality rules (FR-018). The single source for how trustworthy a reading is, and the
 * words used to say so. Tiles, charts, the map, tables and exports all call these.
 */
import { config, staleAfterMs } from "@/lib/config";
import { formatDuration } from "@/lib/format";

/** Quality as stored by the backend. */
export type StoredQuality = "valid" | "suspicious" | "quarantined" | "estimated";

/** Quality as shown to people: stored quality plus what time tells us (stale). */
export type Quality = StoredQuality | "stale";

export interface QualityInput {
  quality_status: StoredQuality;
  quality_reason?: string | null | undefined;
  event_time: string;
  received_at: string;
}

export interface QualityAssessment {
  status: Quality;
  /** Short reason, e.g. "spike +340 %" or "clock error". */
  reason: string | null;
  ageMs: number;
  /** Delay between event and receipt when it exceeds one cadence, else null. */
  lateByMs: number | null;
}

/** A reading arriving more than one cadence after its event time is late. */
const LATE_AFTER_MS = config.cadenceMs;

export function assessQuality(r: QualityInput, now: number, staleMs: number = staleAfterMs): QualityAssessment {
  const eventMs = Date.parse(r.event_time);
  const receivedMs = Date.parse(r.received_at);
  const ageMs = Math.max(0, now - eventMs);
  const delay = receivedMs - eventMs;
  const lateByMs = delay > LATE_AFTER_MS ? delay : null;
  const reason = r.quality_reason ?? null;

  // Quarantined and suspicious outrank staleness: they are stronger statements about the value.
  if (r.quality_status === "quarantined" || r.quality_status === "suspicious") {
    return { status: r.quality_status, reason, ageMs, lateByMs };
  }
  if (ageMs > staleMs) return { status: "stale", reason: null, ageMs, lateByMs };
  return { status: r.quality_status, reason, ageMs, lateByMs };
}

export const QUALITY_WORD: Record<Quality, string> = {
  valid: "Valid",
  stale: "Stale",
  suspicious: "Suspicious",
  estimated: "Estimated",
  quarantined: "Quarantined",
};

/** "Stale · 12 min", "Suspicious · spike +340 %", "Quarantined · clock error", "Valid". */
export function qualityLabel(q: Pick<QualityAssessment, "status" | "reason" | "ageMs">): string {
  const word = QUALITY_WORD[q.status];
  if (q.status === "stale") return `${word} · ${formatDuration(q.ageMs)}`;
  if ((q.status === "suspicious" || q.status === "quarantined") && q.reason) return `${word} · ${q.reason}`;
  return word;
}

/** "Arrived 3 min late", or null when on time. */
export function latenessLabel(lateByMs: number | null): string | null {
  return lateByMs === null ? null : `Arrived ${formatDuration(lateByMs)} late`;
}

/** Lines and aggregates leave out suspicious and quarantined points (they are drawn as markers). */
export function includeInLine(status: Quality): boolean {
  return status === "valid" || status === "estimated" || status === "stale";
}

/**
 * The IDW surface uses only fresh, valid readings. Suspicious readings are excluded by default,
 * with an opt-in for investigators.
 */
export function includeInSurface(status: Quality, includeSuspicious = false): boolean {
  if (status === "valid") return true;
  return includeSuspicious && status === "suspicious";
}
