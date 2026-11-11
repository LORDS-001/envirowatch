import { arc } from "d3-shape";
import { formatNumber } from "@/lib/format";
import { useAnimatedNumber } from "@/lib/hooks";

/** Percentages only (valid-reading rate, uptime, delivery success). Sweeps on change. */
export function HalfDonut({ value, label, size = 200 }: { value: number | null; label: string; size?: number }) {
  const shown = useAnimatedNumber(value ?? 0, 300);
  const r = size / 2;
  const gen = arc().innerRadius(r - 18).outerRadius(r).cornerRadius(4);
  const start = -Math.PI / 2;
  const track = gen({ startAngle: start, endAngle: Math.PI / 2, innerRadius: r - 18, outerRadius: r }) ?? "";
  const fill = gen({ startAngle: start, endAngle: start + Math.PI * Math.max(0, Math.min(1, shown)), innerRadius: r - 18, outerRadius: r }) ?? "";
  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${value === null ? "no data" : `${formatNumber(value * 100, 1)} %`}`}>
      <svg width={size} height={r + 4} viewBox={`${-r} ${-r} ${size} ${r + 4}`} aria-hidden="true">
        <path d={track} className="fill-surface-3" />
        <path d={fill} className="fill-fg-secondary" />
      </svg>
      <figcaption className="-mt-12 flex flex-col items-center">
        <span className="flex items-baseline gap-1">
          <span className="num text-reading-xl text-fg">{value === null ? "–" : formatNumber(value * 100, 1)}</span>
          <span className="text-body-sm text-fg-muted">%</span>
        </span>
        <span className="text-body-sm text-fg-secondary">{label}</span>
      </figcaption>
    </figure>
  );
}
