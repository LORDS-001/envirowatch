import { memo, useMemo, useState, type KeyboardEvent } from "react";
import { extent, bisector } from "d3-array";
import { scaleLinear, scaleTime } from "d3-scale";
import { line } from "d3-shape";
import { cn } from "@/lib/cn";
import { formatClock, formatDateTime, formatUtc } from "@/lib/format";
import { useSize } from "@/lib/hooks";
import { lttb } from "@/lib/lttb";
import { QUALITY_WORD, includeInLine, type Quality } from "@/lib/quality";

export interface LinePoint {
  t: number;
  v: number;
  quality: Quality;
  reason?: string | null;
  eventTime?: string;
  receivedAt?: string;
}

export interface LineSeries {
  id: string;
  label: string;
  /** series-1…4 in fixed order; series-other for context. */
  color: "series-1" | "series-2" | "series-3" | "series-4" | "series-other";
  points: readonly LinePoint[];
}

interface LineChartProps {
  series: readonly LineSeries[];
  /** A gap longer than this breaks the line (never interpolated). */
  gapMs: number;
  formatValue: (v: number) => string;
  threshold?: { value: number; label: string };
  /** Marks a moment, e.g. when an alert opened. */
  marker?: { t: number; label: string };
  height?: number;
  ariaLabel: string;
  /** Show date with time on the axis (ranges over a day). */
  longRange?: boolean;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
/** Display cap: about one point per pixel of plot width. */
const MAX_POINTS = 1500;

const STROKE: Record<LineSeries["color"], string> = {
  "series-1": "stroke-series-1",
  "series-2": "stroke-series-2",
  "series-3": "stroke-series-3",
  "series-4": "stroke-series-4",
  "series-other": "stroke-series-other",
};
const FILL: Record<LineSeries["color"], string> = {
  "series-1": "bg-series-1",
  "series-2": "bg-series-2",
  "series-3": "bg-series-3",
  "series-4": "bg-series-4",
  "series-other": "bg-series-other",
};
// Dash patterns so series differ by more than hue.
const DASH: Record<LineSeries["color"], string | undefined> = {
  "series-1": undefined,
  "series-2": "6 3",
  "series-3": "2 3",
  "series-4": "10 3 2 3",
  "series-other": "1 3",
};

const byT = bisector<LinePoint, number>((p) => p.t).center;

/**
 * Multi-series line chart. Gaps are drawn as breaks, suspicious and quarantined points are hollow
 * diamonds left out of the line, estimated stretches are dashed. Long series are thinned with
 * LTTB for display only. Keyboard: ← → step through time; the crosshair reads every series.
 */
export const LineChart = memo(function LineChart({
  series,
  gapMs,
  formatValue,
  threshold,
  marker,
  height = 280,
  ariaLabel,
  longRange = false,
}: LineChartProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);

  const prepared = useMemo(
    () =>
      series.map((s) => {
        const sorted = [...s.points].sort((a, b) => a.t - b.t);
        const inLine = sorted.filter((p) => includeInLine(p.quality));
        const markers = sorted.filter((p) => !includeInLine(p.quality));
        // Gaps are found on every reading, before thinning: thinned neighbours sit further apart
        // than gapMs and would otherwise break the line at every point.
        const runs: LinePoint[][] = [];
        let cur: LinePoint[] = [];
        for (const p of inLine) {
          const prev = cur[cur.length - 1];
          if (prev && p.t - prev.t > gapMs) {
            runs.push(cur);
            cur = [];
          }
          cur.push(p);
        }
        if (cur.length) runs.push(cur);
        // Each run gets its share of the point budget, at least enough to keep its ends.
        const cap = Math.min(MAX_POINTS, Math.max(200, Math.round(width - PAD.left - PAD.right)));
        const segments = runs.map((run) => {
          const share = Math.max(3, Math.round((cap * run.length) / (inLine.length || 1)));
          return run.length > share ? lttb(run, share, (p) => p.t, (p) => p.v) : run;
        });
        return { ...s, all: sorted, segments, markers };
      }),
    [series, width, gapMs],
  );

  const { x, y, allTimes } = useMemo(() => {
    const all = prepared.flatMap((s) => s.all);
    const [t0, t1] = extent(all, (p) => p.t) as [number | undefined, number | undefined];
    const [v0, v1] = extent(all, (p) => p.v) as [number | undefined, number | undefined];
    const lo = Math.min(v0 ?? 0, threshold?.value ?? Infinity);
    const hi = Math.max(v1 ?? 1, threshold?.value ?? -Infinity);
    const pad = (hi - lo) * 0.1 || 1;
    return {
      x: scaleTime()
        .domain([new Date(t0 ?? 0), new Date(t1 ?? 3_600_000)])
        .range([PAD.left, Math.max(PAD.left + 1, width - PAD.right)]),
      y: scaleLinear()
        .domain([Math.max(0, lo - pad), hi + pad])
        .nice(5)
        .range([height - PAD.bottom, PAD.top]),
      allTimes: [...new Set(all.map((p) => p.t))].sort((a, b) => a - b),
    };
  }, [prepared, width, height, threshold]);

  const paths = useMemo(
    () =>
      prepared.map((s) => {
        const gen = line<LinePoint>()
          .x((p) => x(p.t))
          .y((p) => y(p.v));
        const { segments } = s;
        return {
          id: s.id,
          solid: segments.map((seg) => gen(seg.filter((p) => p.quality !== "estimated")) ?? "").filter(Boolean),
          estimated: segments.map((seg) => gen(seg.filter((p) => p.quality === "estimated")) ?? "").filter(Boolean),
          gaps: segments.length - 1,
        };
      }),
    [prepared, x, y],
  );

  const hover = useMemo(() => {
    if (hoverT === null) return null;
    return prepared.map((s) => {
      const i = byT(s.all, hoverT);
      const p = s.all[i];
      return p && Math.abs(p.t - hoverT) <= gapMs ? { s, p } : { s, p: null };
    });
  }, [hoverT, prepared, gapMs]);

  const onKey = (e: KeyboardEvent) => {
    if (!allTimes.length) return;
    const i = hoverT === null ? allTimes.length - 1 : allTimes.findIndex((t) => t >= hoverT);
    const moves: Record<string, number> = {
      ArrowRight: Math.min(allTimes.length - 1, i + 1),
      ArrowLeft: Math.max(0, i - 1),
      Home: 0,
      End: allTimes.length - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      setHoverT(allTimes[moves[e.key]!]!);
    } else if (e.key === "Escape") setHoverT(null);
  };

  const yTicks = y.ticks(5);
  const xTicks = x.ticks(Math.max(2, Math.floor(width / 120)));
  const hoverX = hoverT !== null ? x(hoverT) : null;
  const tip = hover?.find((h) => h.p);
  const valuetext = hover
    ? hover
        .map(({ s, p }) =>
          p ? `${s.label} ${formatValue(p.v)}, ${QUALITY_WORD[p.quality]}${p.reason ? `, ${p.reason}` : ""}` : `${s.label} no reading`,
        )
        .join("; ")
    : undefined;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, allTimes.length - 1)}
      aria-valuenow={hoverT === null ? allTimes.length - 1 : allTimes.indexOf(hoverT)}
      aria-valuetext={hoverT !== null ? `${formatClock(new Date(hoverT))}: ${valuetext}` : "Use arrow keys to read values"}
      onKeyDown={onKey}
      onBlur={() => setHoverT(null)}
      onMouseLeave={() => setHoverT(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const t = x.invert(e.clientX - r.left).getTime();
        setHoverT(allTimes.length ? allTimes[Math.max(0, Math.min(allTimes.length - 1, bisector((v: number) => v).center(allTimes, t)))]! : null);
      }}
      className="relative w-full rounded-md"
      style={{ height }}
    >
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-line" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-fg-muted text-label">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t.getTime()} x={x(t)} y={height - 8} textAnchor="middle" className="num fill-fg-muted text-label">
              {longRange ? formatDateTime(t).replace(/ \d{4},/, ",").replace(/ [A-Z]{3}$/, "") : formatClock(t).replace(/ [A-Z]{3}$/, "")}
            </text>
          ))}

          {threshold && (
            <g>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(threshold.value)}
                y2={y(threshold.value)}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                className="stroke-state-warn"
              />
              <text x={width - PAD.right} y={y(threshold.value) - 6} textAnchor="end" className="fill-state-warn text-label">
                {threshold.label}
              </text>
            </g>
          )}

          {marker && (
            <g>
              <line x1={x(marker.t)} x2={x(marker.t)} y1={PAD.top} y2={height - PAD.bottom} strokeDasharray="2 3" className="stroke-line-strong" />
              <text x={x(marker.t) + 4} y={PAD.top + 10} className="fill-fg-secondary text-label">
                {marker.label}
              </text>
            </g>
          )}

          {prepared.map((s, i) => (
            <g key={s.id}>
              {paths[i]!.solid.map((d, k) => (
                <path key={k} d={d} fill="none" strokeWidth={1.75} strokeDasharray={DASH[s.color]} strokeLinejoin="round" className={STROKE[s.color]} />
              ))}
              {paths[i]!.estimated.map((d, k) => (
                <path key={`e${k}`} d={d} fill="none" strokeWidth={1.5} strokeDasharray="3 4" className="stroke-fg-secondary" />
              ))}
              {s.markers.map((p) => (
                <path
                  key={p.t}
                  d={`M${x(p.t)} ${y(p.v) - 6} L${x(p.t) + 6} ${y(p.v)} L${x(p.t)} ${y(p.v) + 6} L${x(p.t) - 6} ${y(p.v)} Z`}
                  className={cn("stroke-state-suspicious", p.quality === "quarantined" ? "fill-state-suspicious" : "fill-none")}
                  strokeWidth={1.5}
                />
              ))}
            </g>
          ))}

          {hoverX !== null && (
            <g>
              <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={height - PAD.bottom} className="stroke-line-strong" />
              {hover?.map(({ s, p }) =>
                p ? <circle key={s.id} cx={x(p.t)} cy={y(p.v)} r={4} className={cn("fill-canvas", STROKE[s.color])} strokeWidth={2} /> : null,
              )}
            </g>
          )}
        </svg>
      )}

      {hoverX !== null && tip && hover && (
        <div
          className="pointer-events-none absolute z-10 w-64 rounded-md bg-surface-2 p-3 shadow-overlay"
          style={{ left: Math.min(Math.max(0, hoverX + 12), Math.max(0, width - 264)), top: PAD.top }}
        >
          <p className="text-label text-fg-secondary" title={formatUtc(new Date(hoverT!))}>
            {formatDateTime(new Date(hoverT!))}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {hover.map(({ s, p }) => (
              <li key={s.id} className="text-body-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-fg-secondary">
                    <span className={cn("h-1 w-3 shrink-0 rounded-pill", FILL[s.color])} aria-hidden="true" />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className="num text-data text-fg">{p ? formatValue(p.v) : "No reading"}</span>
                </span>
                {p && (p.quality !== "valid" || p.receivedAt) && (
                  <span className="mt-1 block text-label text-fg-muted">
                    {QUALITY_WORD[p.quality]}
                    {p.reason ? ` · ${p.reason}` : ""}
                    {p.eventTime && p.receivedAt ? ` · event ${formatClock(p.eventTime, undefined, true)}, received ${formatClock(p.receivedAt, undefined, true)}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

export function SeriesLegend({ series }: { series: readonly Pick<LineSeries, "id" | "label" | "color">[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-label text-fg-secondary">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <svg width="20" height="6" aria-hidden="true">
            <line x1="0" x2="20" y1="3" y2="3" strokeWidth="2" strokeDasharray={DASH[s.color]} className={STROKE[s.color]} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}
