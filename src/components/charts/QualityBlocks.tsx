import { memo } from "react";
import { cn } from "@/lib/cn";
import { NARROW_QUERY, useMediaQuery } from "@/lib/hooks";
import type { QualityDay } from "@/lib/api/types";
import { formatNumber, formatPercent, formatWeekdayShort } from "@/lib/format";
import { StateIcon } from "@/components/ui/StateIcon";

type Category = "valid" | "estimated" | "suspicious" | "missing";
type Exception = Exclude<Category, "valid">;

/** Top → bottom inside each column. */
const STACK: Exception[] = ["missing", "suspicious", "estimated"];

const BLOCK: Record<Exception, string> = {
  estimated: "hatch-estimated border border-dashed border-fg-secondary",
  suspicious: "bg-state-suspicious-subtle border border-state-suspicious",
  missing: "border border-dashed border-line-strong",
};

const total = (d: QualityDay) => d.valid + d.estimated + d.suspicious + d.missing;

export function qualityShare(d: QualityDay, c: Category): string {
  const t = total(d);
  return t ? formatPercent(d[c] / t, c === "valid" ? 1 : 2) : "–";
}

/** Round a share up to a tidy axis maximum: 1 %, 2 %, 4 %, 5 %, 10 %… */
function niceMax(share: number): number {
  const steps = [0.01, 0.02, 0.04, 0.05, 0.1, 0.2, 0.5, 1];
  return steps.find((s) => s >= share) ?? 1;
}

/**
 * Valid readings run near 97 % every day, so stacking them hides the comparison that matters.
 * Each column stacks only the readings that weren't valid, on their own labelled scale, and states
 * the valid share as a number above the column. Exact figures are in the table view.
 */
export const QualityBlocks = memo(function QualityBlocks({ days, height = 152 }: { days: readonly QualityDay[]; height?: number }) {
  const today = days.length - 1;
  // Seven one-decimal numbers don't fit side by side on a phone; whole percentages do.
  const decimals = useMediaQuery(NARROW_QUERY) ? 0 : 1;
  const max = niceMax(Math.max(0.001, ...days.map((d) => (d.estimated + d.suspicious + d.missing) / (total(d) || 1))));
  const ticks = [0, max / 2, max];

  return (
    <div>
      <div className="flex gap-3">
        {/* Axis */}
        <div className="relative w-8 shrink-0" style={{ height, marginTop: 28 }} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="num absolute right-0 translate-y-1/2 text-label text-fg-muted"
              style={{ bottom: (t / max) * height }}
            >
              {formatNumber(t * 100, max < 0.02 ? 1 : 0)} %
            </span>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 gap-1 sm:gap-2" aria-hidden="true">
          {days.map((d, i) => {
            const t = total(d) || 1;
            return (
              <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center">
                <span className={cn("num h-7 text-data", i === today ? "text-fg" : "text-fg-secondary")}>
                  {formatNumber((d.valid / t) * 100, decimals)}
                </span>
                <div className="relative flex w-full flex-col justify-end gap-1" style={{ height }}>
                  <div className="absolute inset-x-0 bottom-0 border-t border-line" />
                  {STACK.map((c) => {
                    const h = (d[c] / t / max) * height;
                    return h > 0 ? (
                      <div key={c} className={cn("w-full rounded-sm", BLOCK[c])} style={{ height: Math.max(2, h - 2) }} />
                    ) : null;
                  })}
                </div>
                <span
                  className={cn(
                    "mt-2 rounded-pill px-2 text-label leading-5",
                    i === today ? "bg-brand font-medium text-on-brand" : "text-fg-muted",
                  )}
                >
                  {formatWeekdayShort(d.date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-label text-fg-secondary">
        <li>Number above each day: valid share, %</li>
        <li className="flex items-center gap-2">
          <span className="hatch-estimated size-3 rounded-xs border border-dashed border-fg-secondary" aria-hidden="true" />
          Estimated
        </li>
        <li className="flex items-center gap-2">
          <StateIcon shape="diamond" size={11} className="text-state-suspicious" /> Suspicious
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-xs border border-dashed border-line-strong" aria-hidden="true" /> Missing
        </li>
      </ul>
    </div>
  );
});
