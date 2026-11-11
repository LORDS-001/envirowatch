import { useMemo } from "react";
import { arc } from "d3-shape";
import { useAnimatedNumber } from "@/lib/hooks";
import { heatBin } from "@/lib/metrics";

interface RadialGaugeProps {
  value: number | null;
  min: number;
  max: number;
  /** Heat edges for colouring lit segments by their position. */
  heatEdges: readonly number[];
  /** Muted (stale or no data): segments unlit, value dimmed. */
  muted?: boolean;
  size?: number;
  children?: React.ReactNode;
}

const SEGMENTS = 36;
const SWEEP = (270 * Math.PI) / 180;
const START = -SWEEP / 2;
const GAP = 0.022; // radians between segments

/**
 * Segmented 270° ring for a live reading. Lit segments take the heat colour of their position,
 * so the ring reads like the map legend. Sweeps over --duration-sweep; instant with reduced motion.
 */
export function RadialGauge({ value, min, max, heatEdges, muted = false, size = 220, children }: RadialGaugeProps) {
  const target = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min))) * SEGMENTS;
  const lit = useAnimatedNumber(muted ? 0 : target, 300);

  const segments = useMemo(() => {
    const outer = size / 2;
    const inner = outer - Math.max(14, size * 0.085);
    const step = SWEEP / SEGMENTS;
    const gen = arc<number>()
      .innerRadius(inner)
      .outerRadius(outer)
      .cornerRadius(2)
      .startAngle((i) => START + i * step + GAP / 2)
      .endAngle((i) => START + (i + 1) * step - GAP / 2);
    return Array.from({ length: SEGMENTS }, (_, i) => {
      const posValue = min + ((i + 0.5) / SEGMENTS) * (max - min);
      return { d: gen(i) ?? "", heat: heatBin(posValue, heatEdges) + 1 };
    });
  }, [size, min, max, heatEdges]);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
        {segments.map((s, i) => (
          <path
            key={i}
            d={s.d}
            style={{ fill: i < Math.round(lit) ? `var(--heat-${s.heat})` : "var(--surface-3)" }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
