import { render } from "@testing-library/react";
import { afterAll, beforeAll } from "vitest";
import { LineChart, type LinePoint } from "./LineChart";

// Give useSize a real width so the chart draws.
const RealResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb([{ contentRect: { width: 640, height: 240 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = RealResizeObserver;
});

const cadence = 10_000;
const day = (skip: (i: number) => boolean = () => false): LinePoint[] =>
  Array.from({ length: 8_640 }, (_, i) => ({ t: i * cadence, v: 20 + (i % 7), quality: "valid" as const })).filter((_, i) => !skip(i));

const solidPaths = (container: HTMLElement) =>
  [...container.querySelectorAll("path[stroke-width='1.75']")].map((p) => p.getAttribute("d") ?? "");

describe("LineChart", () => {
  it("draws a day of 10 s readings as one line after thinning", () => {
    const { container } = render(
      <LineChart series={[{ id: "a", label: "A", color: "series-1", points: day() }]} gapMs={cadence * 3} formatValue={String} ariaLabel="test" />,
    );
    const paths = solidPaths(container);
    expect(paths).toHaveLength(1);
    // Thinned to about one point per pixel, not all 8,640.
    expect(paths[0]!.split("L").length).toBeLessThan(1_000);
  });

  it("breaks the line only at real gaps in the readings", () => {
    // One hour missing in the middle of the day.
    const { container } = render(
      <LineChart
        series={[{ id: "a", label: "A", color: "series-1", points: day((i) => i >= 4_000 && i < 4_360) }]}
        gapMs={cadence * 3}
        formatValue={String}
        ariaLabel="test"
      />,
    );
    expect(solidPaths(container)).toHaveLength(2);
  });
});
