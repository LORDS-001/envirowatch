import { formatAge, formatClock, formatUtc } from "@/lib/format";
import { useNow } from "@/lib/hooks";

/**
 * "10 s ago", ticking on the shared clock. Isolated so the age can update every second without
 * re-rendering its parent. Absolute local time and UTC are on hover.
 */
export function Age({ at, prefix = "", suffix = "" }: { at: number | string; prefix?: string; suffix?: string }) {
  const now = useNow();
  const ms = typeof at === "string" ? Date.parse(at) : at;
  const iso = new Date(ms).toISOString();
  return (
    <time dateTime={iso} title={`${formatClock(iso, undefined, true)} (${formatUtc(iso)})`}>
      {prefix}
      {formatAge(Math.max(0, now - ms))}
      {suffix}
    </time>
  );
}
