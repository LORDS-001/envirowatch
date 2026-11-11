import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/Feedback";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  /** Short context pill, e.g. "13 not reporting". */
  context?: ReactNode;
  /** The one Lichen-filled card per strip. */
  highlight?: boolean;
  loading?: boolean;
  className?: string;
}

/** Icon circle, context pill, mono value + unit, label. */
export function StatCard({ icon, label, value, unit, context, highlight = false, loading = false, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex min-h-36 flex-col justify-between gap-4 rounded-lg border p-4",
        highlight ? "border-transparent bg-brand text-on-brand" : "border-line bg-surface-1",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 items-center justify-center rounded-pill",
            highlight ? "bg-on-brand text-brand" : "bg-surface-2 text-fg-secondary",
          )}
        >
          {icon}
        </span>
        {context && (
          <span
            className={cn(
              "inline-flex h-[22px] items-center gap-1 rounded-pill px-2 text-label whitespace-nowrap",
              highlight ? "bg-on-brand/10 text-on-brand" : "bg-surface-2 text-fg-secondary",
            )}
          >
            {context}
          </span>
        )}
      </div>
      <div>
        {loading ? (
          <Skeleton className={cn("h-10 w-28", highlight && "bg-on-brand/10")} />
        ) : (
          <p className="flex items-baseline gap-1">
            <span className={cn("num text-reading-xl", highlight ? "text-on-brand" : "text-fg")}>{value}</span>
            {unit && <span className={cn("text-body-sm", highlight ? "text-on-brand/70" : "text-fg-muted")}>{unit}</span>}
          </p>
        )}
        <p className={cn("mt-1 text-body", highlight ? "text-on-brand/80" : "text-fg-secondary")}>{label}</p>
      </div>
    </div>
  );
}
