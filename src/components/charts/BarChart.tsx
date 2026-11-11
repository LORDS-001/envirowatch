import { memo, useMemo, useState, type KeyboardEvent } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { cn } from "@/lib/cn";
import { useSize } from "@/lib/hooks";
import { StateIcon } from "@/components/ui/StateIcon";

export interface Bar {
  key: string;
  /** Axis label, e.g. "14". */
  label: string;
  value: number;
  /** Full description for the live region, e.g. "14:00 WAT, 23.4 µg/m³". */
  description: string;
}

interface BarChartProps {
  bars: readonly Bar[];
  /** Index highlighted when nothing is hovered or focused (usually "now"). */
  defaultIndex?: number;
  threshold?: { value: number; label: string; critical?: number };
  formatValue: (v: number) => string;
  /** Names the chart for keyboard users; arrow keys step through the bars. */
  ariaLabel: string;
  height?: number;
}

const PAD = { top: 36, right: 8, bottom: 32, left: 32 };

/**
 * Quiet surface-3 bars with one Lichen bar (now / hovered / focused), an inverse value pill, a
 * Lichen axis-label pill, a dashed warn threshold and triangles over bars that exceed it.
 * Keyboard: it is a slider through the periods. Focus it, then use ← → Home End; each step
 * announces the period and its value.
 */
export const BarChart = memo(function BarChart({ bars, defaultIndex, threshold, formatValue, ariaLabel, height = 240 }: BarChartProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const idx = active ?? defaultIndex ?? bars.length - 1;

  const { x, y } = useMemo(() => {
    // Scale to the data and the warn line; the critical level only matters once data nears it.
    const dataMax = Math.max(0, ...bars.map((b) => b.value));
    const max = Math.max(threshold?.value ?? 0, dataMax) * 1.15 || 1;
    return {
      x: scaleBand<string>()
        .domain(bars.map((b) => b.key))
        .range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)])
        .paddingInner(0.28)
        .paddingOuter(0.1),
      y: scaleLinear().domain([0, max]).nice(4).range([height - PAD.bottom, PAD.top]),
    };
  }, [bars, width, height, threshold]);

  const onKey = (e: KeyboardEvent) => {
    const last = bars.length - 1;
    const map: Record<string, number> = {
      ArrowRight: Math.min(last, idx + 1),
      ArrowLeft: Math.max(0, idx - 1),
      Home: 0,
      End: last,
    };
    if (e.key in map) {
      e.preventDefault();
      setActive(map[e.key]!);
    }
  };

  const bw = x.bandwidth();
  const r = Math.min(6, bw / 2);
  const activeBar = bars[idx];
  const ticks = y.ticks(4);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, bars.length - 1)}
      aria-valuenow={idx}
      aria-valuetext={activeBar?.description}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      onMouseLeave={() => setActive(null)}
      className="relative w-full rounded-md"
      style={{ height }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-fg-muted text-label">
                {t}
              </text>
            </g>
          ))}

          {bars.map((b, i) => {
            const bx = x(b.key) ?? 0;
            const by = y(b.value);
            const isActive = i === idx;
            const over = threshold && b.value > threshold.value;
            const critical = threshold?.critical !== undefined && b.value > threshold.critical;
            return (
              <g key={b.key} onMouseEnter={() => setActive(i)}>
                {/* Full-height hit area */}
                <rect x={bx - 2} y={PAD.top} width={bw + 4} height={height - PAD.top - PAD.bottom} fill="transparent" />
                <rect
                  x={bx}
                  y={by}
                  width={bw}
                  height={Math.max(0, y(0) - by)}
                  rx={r}
                  className={cn(
                    "transition-[fill] duration-tick ease-standard",
                    isActive ? "fill-brand" : "fill-surface-3",
                  )}
                />
                {over && (
                  <foreignObject x={bx + bw / 2 - 6} y={by - 16} width={12} height={12}>
                    <StateIcon
                      shape={critical ? "octagon" : "triangle"}
                      size={12}
                      className={critical ? "text-state-critical" : "text-state-warn"}
                    />
                  </foreignObject>
                )}
                {isActive ? null : (
                  <text
                    x={bx + bw / 2}
                    y={height - 10}
                    textAnchor="middle"
                    className="num fill-fg-muted text-label"
                  >
                    {i % 3 === 0 ? b.label : ""}
                  </text>
                )}
              </g>
            );
          })}

          {threshold && (
            <g>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(threshold.value)}
                y2={y(threshold.value)}
                strokeDasharray="4 4"
                className="stroke-state-warn"
                strokeWidth={1.5}
              />
              <text
                x={width - PAD.right}
                y={y(threshold.value) - 6}
                textAnchor="end"
                className="fill-state-warn text-label"
              >
                {threshold.label}
              </text>
            </g>
          )}
        </svg>
      )}

      {/* Value pill and axis-label pill for the highlighted bar */}
      {width > 0 && activeBar && (
        <>
          <span
            className="num pointer-events-none absolute -translate-x-1/2 rounded-pill bg-surface-inverse px-2 py-1 text-label whitespace-nowrap text-on-inverse"
            style={{ left: (x(activeBar.key) ?? 0) + bw / 2, top: Math.max(0, y(activeBar.value) - (threshold && activeBar.value > threshold.value ? 44 : 30)) }}
          >
            {formatValue(activeBar.value)}
          </span>
          <span
            className="num pointer-events-none absolute -translate-x-1/2 rounded-pill bg-brand px-2 text-label leading-5 font-medium text-on-brand"
            style={{ left: (x(activeBar.key) ?? 0) + bw / 2, top: height - 22 }}
          >
            {activeBar.label}
          </span>
        </>
      )}
    </div>
  );
});
