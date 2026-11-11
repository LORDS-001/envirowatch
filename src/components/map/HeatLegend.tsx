import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { METRICS, type MetricId } from "@/lib/metrics";
import { EstimatedFlag } from "@/components/ui/QualityFlag";

const HEAT = ["bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4", "bg-heat-5", "bg-heat-6", "bg-heat-7"] as const;

/**
 * Labelled heat scale: metric, unit, bins with tick labels, and the Estimated flag. The same bins
 * colour the map, this legend and the PDF export.
 */
export function HeatLegend({ metric, className, compact = false }: { metric: MetricId; className?: string; compact?: boolean }) {
  const def = METRICS[metric];
  const edges = def.heatEdges;
  return (
    <figure className={cn("min-w-0", className)} aria-label={`${def.label} scale in ${def.unit}`}>
      <figcaption className="mb-2 flex items-center justify-between gap-2">
        <span className="text-label text-fg-secondary">
          {def.label} <span className="text-fg-muted">({def.unit})</span>
        </span>
        {!compact && <EstimatedFlag />}
      </figcaption>
      <div className="mx-3 flex h-2 overflow-hidden rounded-pill" aria-hidden="true">
        {HEAT.map((c) => (
          <span key={c} className={cn("flex-1", c)} />
        ))}
      </div>
      <div className="relative mx-3 mt-1 h-4" aria-hidden="true">
        {edges.map((e, i) => (
          <span
            key={e}
            className="num absolute text-label text-fg-muted"
            style={{ left: `${(i / (edges.length - 1)) * 100}%`, transform: "translateX(-50%)" }}
          >
            {formatNumber(e)}
            {i === edges.length - 1 ? "+" : ""}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {edges.slice(0, -1).map((lo, i) => (
          <li key={lo}>
            Band {i + 1}: {formatNumber(lo)} to {i === edges.length - 2 ? `${formatNumber(edges[i + 1]!)} and above` : formatNumber(edges[i + 1]!)} {def.unit}
          </li>
        ))}
      </ul>
    </figure>
  );
}
