import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leaflet-overrides.css";
import type { HeatmapSample, Site } from "@/lib/api/types";
import { cssVar } from "@/lib/hooks";
import { formatReading } from "@/lib/format";
import { heatBin, METRICS, type MetricId } from "@/lib/metrics";
import { COVERAGE_RADIUS_M, IDW_POWER } from "./IdwMiniMap";
import { useIdwGrid } from "./useIdwGrid";

export type SiteState = "normal" | "warn" | "critical" | "nodata";

interface HeatMapProps {
  metric: MetricId;
  samples: readonly HeatmapSample[];
  sites: readonly Site[];
  selectedSite?: string | null;
  onSelectSite?: (id: string) => void;
  className?: string;
  /** Pixel size of IDW cells (brief §10: about 4 px). */
  cellPx?: number;
}

// Esri Dark Gray Canvas: a label-free dark base with labels as a separate layer, so place names
// can sit above the heat surface. No API key; attribution required.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/{layer}/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION = "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community";

export function siteState(value: number | undefined, metric: MetricId): SiteState {
  if (value === undefined) return "nodata";
  const t = METRICS[metric].thresholds;
  if (!t) return "normal";
  return value > t.critical ? "critical" : value > t.warn ? "warn" : "normal";
}

const SHAPE: Record<SiteState, string> = {
  normal: '<circle cx="8" cy="8" r="5.5"/>',
  warn: '<path d="M8 1.5 14.5 13.5H1.5Z"/>',
  critical: '<path d="M5.4 1.5h5.2l3.9 3.9v5.2l-3.9 3.9H5.4l-3.9-3.9V5.4Z"/>',
  nodata: '<circle cx="8" cy="8" r="4.5"/>',
};
const SHAPE_CLASS: Record<SiteState, string> = {
  normal: "fill-state-normal stroke-sunken",
  warn: "fill-state-warn stroke-sunken",
  critical: "fill-state-critical stroke-sunken",
  nodata: "fill-none stroke-fg-muted",
};
const STATE_WORD: Record<SiteState, string> = {
  normal: "within limit",
  warn: "above warning limit",
  critical: "above critical limit",
  nodata: "no valid reading",
};

function markerIcon(state: SiteState, selected: boolean) {
  return L.divIcon({
    className: "ew-marker",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<span class="flex size-6 items-center justify-center rounded-pill ${selected ? "ring-2 ring-brand bg-sunken/60" : ""}"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" class="${SHAPE_CLASS[state]}" stroke-width="1.5">${SHAPE[state]}</svg></span>`,
  });
}

let heatRgb: Array<readonly [number, number, number]> | null = null;
function heatColours() {
  return (heatRgb ??= Array.from({ length: 7 }, (_, i) => {
    const n = parseInt(cssVar(`--heat-${i + 1}`).replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  }));
}

interface ViewState {
  bounds: [number, number, number, number];
  width: number;
  height: number;
  /** Bumped on every move, so the canvas repositions even if bounds repeat. */
  rev: number;
}

/**
 * Full Leaflet map with the IDW surface on its own canvas pane, recomputed in a worker on pan,
 * zoom, metric or data change. Never extrapolates beyond coverage. Markers are keyboard-focusable
 * (Tab, then Enter) and carry state as shape and text, not colour alone.
 */
export function HeatMap({ metric, samples, sites, selectedSite, onSelectSite, className, cellPx = 4 }: HeatMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectSite);
  const [view, setView] = useState<ViewState | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelectSite;
  }, [onSelectSite]);

  // Create the map once.
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, { zoomControl: true, attributionControl: true, keyboard: true, minZoom: 9, maxZoom: 15 });
    map.setView([6.52, 3.4], 11);
    L.tileLayer(ESRI, { layer: "World_Dark_Gray_Base", attribution: ATTRIBUTION, maxZoom: 16 } as L.TileLayerOptions).addTo(map);

    const idwPane = map.createPane("idw");
    idwPane.style.zIndex = "350";
    idwPane.style.pointerEvents = "none";
    const canvas = L.DomUtil.create("canvas", "", idwPane) as HTMLCanvasElement;
    canvas.setAttribute("aria-hidden", "true");
    canvasRef.current = canvas;

    const labelPane = map.createPane("labels");
    labelPane.style.zIndex = "450";
    labelPane.style.pointerEvents = "none";
    L.tileLayer(ESRI, { layer: "World_Dark_Gray_Reference", pane: "labels", maxZoom: 16 } as L.TileLayerOptions).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);

    let rev = 0;
    const update = () => {
      const b = map.getBounds();
      const size = map.getSize();
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      setView({ bounds: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], width: size.x, height: size.y, rev: ++rev });
    };
    map.on("moveend zoomend resize", update);
    map.on("zoomstart", () => (canvas.style.opacity = "0"));
    mapRef.current = map;
    update();

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fit to the sites once they load.
  const fitted = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitted.current || sites.length === 0) return;
    map.fitBounds(L.latLngBounds(sites.map((s) => [s.latitude, s.longitude] as [number, number])), { padding: [32, 32] });
    fitted.current = true;
  }, [sites]);

  const request = useMemo(() => {
    if (!view || samples.length === 0) return null;
    return {
      bounds: view.bounds,
      cols: Math.max(1, Math.round(view.width / cellPx)),
      rows: Math.max(1, Math.round(view.height / cellPx)),
      samples: samples.map((s) => ({ lat: s.latitude, lng: s.longitude, value: s.value })),
      power: IDW_POWER,
      radiusM: COVERAGE_RADIUS_M,
    };
  }, [view, samples, cellPx]);
  const grid = useIdwGrid(request);

  // Paint the surface.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !grid || !view) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = view.width * dpr;
    canvas.height = view.height * dpr;
    canvas.style.width = `${view.width}px`;
    canvas.style.height = `${view.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const off = document.createElement("canvas");
    off.width = grid.cols;
    off.height = grid.rows;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(grid.cols, grid.rows);
    const rgb = heatColours();
    const edges = METRICS[metric].heatEdges;
    for (let i = 0; i < grid.values.length; i++) {
      const v = grid.values[i]!;
      const a = grid.alpha[i]!;
      if (!(a > 0) || Number.isNaN(v)) continue;
      const [r, g, b] = rgb[heatBin(v, edges)]!;
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(a * 0.72 * 255);
    }
    octx.putImageData(img, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, view.width, view.height);
    canvas.style.opacity = "1";
  }, [grid, view, metric]);

  // Markers.
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();
    const bySite = new Map(samples.map((s) => [s.site_id, s]));
    for (const site of sites) {
      const sample = bySite.get(site.id);
      const state = siteState(sample?.value, metric);
      const text = sample
        ? `${site.name}: ${formatReading(sample.value, metric)}, ${STATE_WORD[state]}`
        : `${site.name}: ${STATE_WORD.nodata}`;
      L.marker([site.latitude, site.longitude], {
        icon: markerIcon(state, site.id === selectedSite),
        keyboard: true,
        title: text,
        alt: text,
        riseOnHover: true,
        zIndexOffset: site.id === selectedSite ? 1000 : state === "critical" ? 500 : state === "warn" ? 250 : 0,
      })
        .on("click", () => onSelectRef.current?.(site.id))
        .addTo(group);
    }
  }, [samples, sites, metric, selectedSite]);

  // Bring the selected site into view.
  useEffect(() => {
    const map = mapRef.current;
    const site = sites.find((s) => s.id === selectedSite);
    if (!map || !site) return;
    if (!map.getBounds().pad(-0.15).contains([site.latitude, site.longitude])) {
      map.panTo([site.latitude, site.longitude]);
    }
  }, [selectedSite, sites]);

  return <div ref={el} className={className} role="region" aria-label={`${METRICS[metric].label} map. Use arrow keys to pan, plus and minus to zoom, Tab to reach site markers.`} />;
}
