import { cn } from "@/lib/cn";

export type StateShape = "circle" | "triangle" | "octagon" | "diamond";
export type DataState = "normal" | "warn" | "critical" | "suspicious";

/** The fixed state → shape mapping. Never borrowed, never colour alone (principle 3). */
export const STATE_SHAPE: Record<DataState, StateShape> = {
  normal: "circle",
  warn: "triangle",
  critical: "octagon",
  suspicious: "diamond",
};

export const STATE_TEXT_CLASS: Record<DataState, string> = {
  normal: "text-state-normal",
  warn: "text-state-warn",
  critical: "text-state-critical",
  suspicious: "text-state-suspicious",
};

const PATHS: Record<StateShape, string> = {
  circle: "M6 1.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9Z",
  triangle: "M6 1 11 10.5H1Z",
  octagon: "M4.1 1h3.8L11 4.1v3.8L7.9 11H4.1L1 7.9V4.1Z",
  diamond: "M6 .8 11.2 6 6 11.2.8 6Z",
};

interface StateIconProps {
  shape: StateShape;
  /** Hollow outline, e.g. suspicious points on a chart. */
  hollow?: boolean;
  size?: number;
  className?: string;
}

/** Decorative: always pair with a visible word. */
export function StateIcon({ shape, hollow = false, size = 12, className }: StateIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path
        d={PATHS[shape]}
        fill={hollow ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth={hollow ? 1.5 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}
