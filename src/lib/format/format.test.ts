// @vitest-environment node
import {
  formatAge,
  formatClock,
  formatNumber,
  formatPercent,
  formatRange,
  formatReading,
  formatUtc,
} from "./index";

describe("numbers", () => {
  it("uses thousands separators", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("uses a true minus sign and never shows −0", () => {
    expect(formatNumber(-2.4, 1)).toBe("−2.4");
    expect(formatNumber(-0.01, 1)).toBe("0.0");
  });

  it("keeps the sensor precision and the unit", () => {
    expect(formatReading(31.4, "temperature_c")).toBe("31.4 °C");
    expect(formatReading(35, "pm25")).toBe("35.0 µg/m³");
    expect(formatReading(68.2, "humidity_percent")).toBe("68 %");
  });

  it("uses an en dash for ranges", () => {
    expect(formatRange(10, 20, "temperature_c")).toBe("10.0–20.0 °C");
  });

  it("formats percentages", () => {
    expect(formatPercent(0.9921)).toBe("99.2 %");
  });
});

describe("time", () => {
  it("shows relative ages", () => {
    expect(formatAge(800)).toBe("just now");
    expect(formatAge(10_000)).toBe("10 s ago");
    expect(formatAge(6 * 60_000)).toBe("6 min ago");
  });

  it("shows local time in WAT and UTC on hover", () => {
    expect(formatClock("2026-11-05T13:02:00Z", "Africa/Lagos")).toBe("14:02 WAT");
    expect(formatUtc("2026-11-05T10:00:00Z")).toBe("2026-11-05 10:00:00 UTC");
  });
});
