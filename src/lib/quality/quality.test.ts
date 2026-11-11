// @vitest-environment node
import { assessQuality, includeInLine, includeInSurface, latenessLabel, qualityLabel } from "./index";

const now = Date.parse("2026-11-05T10:20:00Z");

function reading(overrides: Partial<Parameters<typeof assessQuality>[0]> = {}) {
  return {
    quality_status: "valid" as const,
    event_time: "2026-11-05T10:19:55Z",
    received_at: "2026-11-05T10:19:56Z",
    ...overrides,
  };
}

describe("assessQuality", () => {
  it("passes fresh valid readings through", () => {
    const q = assessQuality(reading(), now);
    expect(q.status).toBe("valid");
    expect(q.lateByMs).toBeNull();
    expect(qualityLabel(q)).toBe("Valid");
  });

  it("marks readings older than 3 × cadence as stale, with their age", () => {
    const q = assessQuality(reading({ event_time: "2026-11-05T10:08:00Z", received_at: "2026-11-05T10:08:01Z" }), now);
    expect(q.status).toBe("stale");
    expect(qualityLabel(q)).toBe("Stale · 12 min");
  });

  it("keeps suspicious and quarantined over stale, with the reason", () => {
    const s = assessQuality(reading({ quality_status: "suspicious", quality_reason: "spike +340 %" }), now);
    expect(qualityLabel(s)).toBe("Suspicious · spike +340 %");
    const q = assessQuality(
      reading({ quality_status: "quarantined", quality_reason: "clock error", event_time: "2026-11-04T10:00:00Z" }),
      now,
    );
    expect(qualityLabel(q)).toBe("Quarantined · clock error");
  });

  it("detects late arrival but keeps the reading valid", () => {
    const q = assessQuality(reading({ event_time: "2026-11-05T10:19:50Z", received_at: "2026-11-05T10:19:59Z" }), now);
    expect(q.lateByMs).toBeNull();
    const late = assessQuality(reading({ event_time: "2026-11-05T10:19:40Z", received_at: "2026-11-05T10:19:59Z" }), now);
    expect(late.status).toBe("valid");
    expect(latenessLabel(late.lateByMs)).toBe("Arrived 19 s late");
  });
});

describe("inclusion rules", () => {
  it("leaves suspicious and quarantined points out of lines", () => {
    expect(includeInLine("valid")).toBe(true);
    expect(includeInLine("suspicious")).toBe(false);
    expect(includeInLine("quarantined")).toBe(false);
  });

  it("uses only valid readings for the surface unless suspicious are opted in", () => {
    expect(includeInSurface("valid")).toBe(true);
    expect(includeInSurface("stale")).toBe(false);
    expect(includeInSurface("suspicious")).toBe(false);
    expect(includeInSurface("suspicious", true)).toBe(true);
    expect(includeInSurface("quarantined", true)).toBe(false);
  });
});
