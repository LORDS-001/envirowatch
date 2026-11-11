import { formatInTimeZone } from "date-fns-tz";
import { config } from "@/lib/config";
import { METRICS, type MetricId } from "@/lib/metrics";

const MINUS = "−";
const EN_DASH = "–";

const numberFormatters = new Map<number, Intl.NumberFormat>();
function nf(decimals: number): Intl.NumberFormat {
  let f = numberFormatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormatters.set(decimals, f);
  }
  return f;
}

/** Thousands separators, fixed precision and a true minus sign. */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return EN_DASH;
  // Avoid "−0.0" for tiny negatives that round to zero.
  const rounded = Number(value.toFixed(decimals));
  const text = nf(decimals).format(Object.is(rounded, -0) ? 0 : rounded);
  return text.replace("-", MINUS);
}

export function formatMetricValue(value: number, metric: MetricId): string {
  return formatNumber(value, METRICS[metric].decimals);
}

/** "31.4 °C", "68 %", "35.0 µg/m³": always the unit, separated by a normal space. */
export function formatReading(value: number, metric: MetricId): string {
  return `${formatMetricValue(value, metric)} ${METRICS[metric].unit}`;
}

/** "10–20 °C" with an en dash. */
export function formatRange(lo: number, hi: number, metric: MetricId): string {
  return `${formatMetricValue(lo, metric)}${EN_DASH}${formatMetricValue(hi, metric)} ${METRICS[metric].unit}`;
}

export function formatPercent(fraction: number, decimals = 1): string {
  return `${formatNumber(fraction * 100, decimals)} %`;
}

/** Compact duration: "8 s", "12 min", "3 h", "2 d". */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

/** Relative age for tiles: "10 s ago". */
export function formatAge(ms: number): string {
  if (ms < 1500) return "just now";
  return `${formatDuration(ms)} ago`;
}

const ZONE_ABBR: Record<string, string> = { "Africa/Lagos": "WAT", UTC: "UTC" };

function zoneAbbr(tz: string, date: Date): string {
  const known = ZONE_ABBR[tz];
  if (known) return known;
  const part = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

/** Local clock time for details: "14:02 WAT". */
export function formatClock(iso: string | Date, tz: string = config.displayTz, withSeconds = false): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${formatInTimeZone(d, tz, withSeconds ? "HH:mm:ss" : "HH:mm")} ${zoneAbbr(tz, d)}`;
}

/** Local date and time: "5 Nov 2026, 14:02 WAT". */
export function formatDateTime(iso: string | Date, tz: string = config.displayTz): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${formatInTimeZone(d, tz, "d MMM yyyy, HH:mm")} ${zoneAbbr(tz, d)}`;
}

/** UTC, for hover titles: "2026-11-05 10:00:00 UTC". */
export function formatUtc(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${formatInTimeZone(d, "UTC", "yyyy-MM-dd HH:mm:ss")} UTC`;
}

/** Short weekday for chart axes: "Mo", "Tu". */
export function formatWeekdayShort(iso: string | Date, tz: string = config.displayTz): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(d, tz, "EEEEEE");
}

export function formatHour(iso: string | Date, tz: string = config.displayTz): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(d, tz, "HH");
}

export function formatInteger(value: number): string {
  return formatNumber(value, 0);
}

export const typography = { MINUS, EN_DASH } as const;
