import { memo, useEffect, useMemo, useRef } from "react";
import type { HeatmapSample, Site } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { cssVar, useSize } from "@/lib/hooks";
import { METRICS, heatBin, type MetricId } from "@/lib/metrics";
import { EstimatedFlag } from "@/components/ui/QualityFlag";
import { useIdwGrid } from "./useIdwGrid";

let heatCache: string[] | null = null;
/** Heat colours resolved once from the tokens (reading computed style forces a style recalc). */
function heatColours(): string[] {
  return (heatCache ??= Array.from({ length: 7 }, (_, i) => cssVar(`--heat-${i + 1}`)));
}

/** Coverage radius around each sensor site; the surface fades out between 55 % and 100 %. */
export const COVERAGE_RADIUS_M = 3200;
export const IDW_POWER = 2;
/** Grid cell size in CSS pixels (brief §10: about 4 px). */
const CELL_PX = 4;

/** Area names drawn on top, so the surface has places, not just colour. */
const LABELLED = new Set(["Ikeja", "Yaba", "Apapa Port", "Lekki Phase 1", "Ikorodu", "Festac", "Victoria Island", "Oshodi", "Ajah"]);

interface IdwMiniMapProps {
  metric: MetricId;
  samples: readonly HeatmapSample[];
  sites: readonly Site[];
  /** Sites to emphasise (e.g. over threshold), drawn with a warn ring. */
  flagged?: ReadonlySet<string>;
  className?: string;
}

interface Projection {
  bounds: [number, number, number, number];
  toXY: (lat: number, lng: number) => [number, number];
}

/** Equirectangular fit of the site extent into the box, preserving aspect at this latitude. */
function project(sites: readonly Site[], width: number, height: number, pad = 28): Projection | null {
  if (!sites.length || width <= 0 || height <= 0) return null;
  const lats = sites.map((s) => s.latitude);
  const lngs = sites.map((s) => s.longitude);
  let south = Math.min(...lats);
  let north = Math.max(...lats);
  let west = Math.min(...lngs);
  let east = Math.max(...lngs);
  const k = Math.cos(((south + north) / 2) * (Math.PI / 180));
  // Grow the shorter side so a degree of longitude and latitude cover the same distance on screen.
  const w = width - 2 * pad;
  const h = height - 2 * pad;
  const spanX = (east - west) * k;
  const spanY = north - south;
  if (spanX / spanY > w / h) {
    const need = (spanX * h) / w - spanY;
    south -= need / 2;
    north += need / 2;
  } else {
    const need = ((spanY * w) / h - spanX) / k;
    west -= need / 2;
    east += need / 2;
  }
  const padLat = ((north - south) * pad) / h;
  const padLng = ((east - west) * pad) / w;
  south -= padLat;
  north += padLat;
  west -= padLng;
  east += padLng;
  return {
    bounds: [south, west, north, east],
    toXY: (lat, lng) => [((lng - west) / (east - west)) * width, ((north - lat) / (north - south)) * height],
  };
}

/**
 * Live IDW surface on canvas with site markers and area labels. Never extrapolates past
 * coverage, always carries the Estimated flag and the method caption.
 */
export const IdwMiniMap = memo(function IdwMiniMap({ metric, samples, sites, flagged, className }: IdwMiniMapProps) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const proj = useMemo(() => project(sites, width, height), [sites, width, height]);

  const request = useMemo(() => {
    if (!proj || !samples.length) return null;
    return {
      bounds: proj.bounds,
      cols: Math.max(1, Math.round(width / CELL_PX)),
      rows: Math.max(1, Math.round(height / CELL_PX)),
      samples: samples.map((s) => ({ lat: s.latitude, lng: s.longitude, value: s.value })),
      power: IDW_POWER,
      radiusM: COVERAGE_RADIUS_M,
    };
  }, [proj, samples, width, height]);

  const grid = useIdwGrid(request);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const colours = heatColours();
    // Paint one pixel per cell, then scale up with smoothing for a soft but faithful surface.
    const off = document.createElement("canvas");
    off.width = grid.cols;
    off.height = grid.rows;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(grid.cols, grid.rows);
    const rgb = colours.map((c) => {
      const n = parseInt(c.replace("#", ""), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
    });
    const edges = METRICS[metric].heatEdges;
    for (let i = 0; i < grid.values.length; i++) {
      const v = grid.values[i]!;
      const a = grid.alpha[i]!;
      if (!(a > 0) || Number.isNaN(v)) continue;
      const [r, g, b] = rgb[heatBin(v, edges)]!;
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(a * 0.82 * 255);
    }
    octx.putImageData(img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(off, 0, 0, width, height);
  }, [grid, width, height, metric]);

  const live = new Set(samples.map((s) => s.site_id));

  return (
    <div ref={ref} className={cn("relative overflow-hidden rounded-lg bg-sunken", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
      {proj && (
        <svg className="absolute inset-0 size-full" aria-hidden="true">
          {sites.map((s) => {
            const [x, y] = proj.toXY(s.latitude, s.longitude);
            const reporting = live.has(s.id);
            const warn = flagged?.has(s.id);
            return (
              <g key={s.id}>
                {warn && (
                  <path
                    d={`M${x} ${y - 9} L${x + 8} ${y + 5} L${x - 8} ${y + 5} Z`}
                    className="fill-none stroke-state-warn"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={reporting ? 2.5 : 2}
                  className={reporting ? "fill-fg stroke-sunken" : "fill-none stroke-fg-muted"}
                  strokeWidth={reporting ? 1 : 1}
                />
                {LABELLED.has(s.name) && (
                  <text x={x + 6} y={y - 6} className="fill-fg-secondary text-label" style={{ paintOrder: "stroke" }} stroke="var(--bg-sunken)" strokeWidth={3}>
                    {s.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <EstimatedFlag className="absolute top-3 left-3">Estimated (IDW)</EstimatedFlag>
    </div>
  );
});

export function idwCaption(n: number): string {
  return `Estimated by distance weighting (IDW, p = ${IDW_POWER}) from ${n} sensor sites. Doesn’t model wind or terrain.`;
}
