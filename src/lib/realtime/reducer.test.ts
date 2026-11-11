// @vitest-environment node
import type { Measurement, WsEvent } from "@/lib/api/types";
import { applyEvents, emptySnapshot, latestKey, SeenIds } from "./reducer";

function msg(readingId: string, eventTime: string, value: number, extra: Partial<Measurement> = {}): WsEvent {
  return {
    type: "measurement.updated",
    data: [
      {
        device_id: "sensor-001",
        reading_id: readingId,
        metric: "pm25",
        value,
        unit: "µg/m³",
        event_time: eventTime,
        received_at: eventTime,
        quality_status: "valid",
        ...extra,
      },
    ],
  };
}

const now = Date.parse("2026-11-05T10:00:10Z");
const key = latestKey("sensor-001", "pm25");

describe("applyEvents", () => {
  it("de-duplicates by reading_id, across flushes too", () => {
    const seen = new SeenIds();
    let s = applyEvents(emptySnapshot(), [msg("r1", "2026-11-05T10:00:00Z", 20), msg("r1", "2026-11-05T10:00:00Z", 20)], seen, now);
    expect(s.readings).toBe(1);
    expect(s.duplicates).toBe(1);
    s = applyEvents(s, [msg("r1", "2026-11-05T10:00:00Z", 20)], seen, now);
    expect(s.readings).toBe(1);
    expect(s.duplicates).toBe(2);
  });

  it("orders by event_time: a late reading never overwrites a newer one", () => {
    const seen = new SeenIds();
    const s = applyEvents(
      emptySnapshot(),
      [msg("r2", "2026-11-05T10:00:10Z", 25), msg("r1", "2026-11-05T10:00:00Z", 20, { received_at: "2026-11-05T10:00:12Z" })],
      seen,
      now,
    );
    expect(s.latest[key]?.value).toBe(25);
    expect(s.outOfOrder).toBe(1);
    expect(s.readings).toBe(2);
  });

  it("keeps quarantined readings out of latest and freshness", () => {
    const seen = new SeenIds();
    const s = applyEvents(
      emptySnapshot(),
      [msg("r9", "2026-11-05T12:00:00Z", 99, { quality_status: "quarantined", quality_reason: "clock error" })],
      seen,
      now,
    );
    expect(s.latest[key]).toBeUndefined();
    expect(s.quarantined).toBe(1);
    expect(s.newestEventMs).toBe(0);
  });

  it("tracks per-device last seen and the unique-reading rate", () => {
    const seen = new SeenIds();
    const s = applyEvents(
      emptySnapshot(),
      [msg("a", "2026-11-05T10:00:01Z", 1), msg("b", "2026-11-05T10:00:02Z", 2), msg("b", "2026-11-05T10:00:02Z", 2)],
      seen,
      now,
    );
    expect(s.deviceLastSeen["sensor-001"]).toBe(Date.parse("2026-11-05T10:00:02Z"));
    expect(s.ratePerSec).toBe(2);
  });

  it("bounds the seen-id set", () => {
    const seen = new SeenIds(3);
    ["a", "b", "c", "d"].forEach((id) => seen.add(id));
    expect(seen.size).toBe(3);
    expect(seen.add("a")).toBe(true); // evicted, so treated as new
  });
});
