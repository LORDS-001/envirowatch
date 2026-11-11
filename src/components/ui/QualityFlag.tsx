import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { latenessLabel, qualityLabel, type QualityAssessment } from "@/lib/quality";
import { StateIcon } from "./StateIcon";

interface QualityFlagProps {
  quality: Pick<QualityAssessment, "status" | "reason" | "ageMs"> & { lateByMs?: number | null };
  /** Valid readings are silent by default; detail views show them explicitly. */
  showValid?: boolean;
  className?: string;
}

/** How far a reading can be trusted, in shape and words (FR-018). */
export function QualityFlag({ quality, showValid = false, className }: QualityFlagProps) {
  const label = qualityLabel(quality);
  const late = quality.lateByMs ? latenessLabel(quality.lateByMs) : null;
  const base = "inline-flex items-center gap-1 text-label whitespace-nowrap";

  switch (quality.status) {
    case "valid":
      if (!showValid && !late) return null;
      return (
        <span className={cn(base, "text-fg-secondary", className)}>
          <StateIcon shape="circle" size={10} className="text-state-normal" />
          {late ?? label}
        </span>
      );
    case "stale":
      return (
        <span className={cn(base, "text-fg-muted", className)}>
          <Clock size={12} strokeWidth={1.5} aria-hidden="true" />
          {label}
        </span>
      );
    case "suspicious":
      return (
        <span className={cn(base, "text-state-suspicious", className)}>
          <StateIcon shape="diamond" hollow size={11} />
          {label}
        </span>
      );
    case "quarantined":
      return (
        <span className={cn(base, "text-state-suspicious", className)}>
          <StateIcon shape="diamond" size={11} />
          {label}
        </span>
      );
    case "estimated":
      return (
        <span
          className={cn(
            base,
            "h-[22px] rounded-pill border border-dashed border-fg-secondary px-3 text-fg-secondary",
            className,
          )}
        >
          {label}
        </span>
      );
  }
}

/** The "Estimated" flag on its own, for IDW surfaces. */
export function EstimatedFlag({ children = "Estimated", className }: { children?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center rounded-pill border border-dashed border-fg-secondary bg-sunken/60 px-3 text-label text-fg-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}
