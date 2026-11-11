import type { Alert } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock, formatDuration, formatNumber, formatUtc } from "@/lib/format";
import { METRICS } from "@/lib/metrics";

export interface TimelineStep {
  key: string;
  label: string;
  at: string | null;
  detail?: string;
  tone?: "critical" | "warn" | "normal" | "neutral";
}

const CHANNEL = { email: "Email", sms: "SMS", webhook: "Webhook" } as const;
const OUTCOME = { delivered: "Delivered", failed: "Failed", pending: "Waiting for delivery" } as const;

/** Lifecycle steps, in order: threshold crossed → Pending → Active → Notified → Acknowledged → Resolved. */
export function alertSteps(a: Alert): TimelineStep[] {
  const metric = a.metric ? METRICS[a.metric] : null;
  const steps: TimelineStep[] = [
    {
      key: "crossed",
      label: a.kind === "device" ? "Fault detected" : "Threshold crossed",
      at: a.opened_at,
      detail:
        a.kind === "environment" && metric && a.threshold !== null
          ? `${metric.label} above ${formatNumber(a.threshold)} ${metric.unit}${a.value !== null ? `, peak ${formatNumber(a.value, metric.decimals)} ${metric.unit}` : ""}`
          : undefined,
      tone: "warn",
    },
    { key: "pending", label: "Pending", at: a.opened_at, detail: "Waiting for consecutive readings to confirm", tone: "warn" },
    { key: "active", label: "Active", at: a.activated_at, tone: "critical" },
  ];
  for (const n of a.notifications) {
    steps.push({
      key: `n-${n.channel}-${n.attempted_at}`,
      label: `Notified by ${CHANNEL[n.channel]}`,
      at: n.attempted_at,
      detail: OUTCOME[n.outcome],
      tone: n.outcome === "failed" ? "critical" : "neutral",
    });
  }
  if (a.notifications.length === 0 && a.activated_at) {
    steps.push({ key: "notified", label: "Notified", at: null, detail: "No notification attempts recorded" });
  }
  steps.push({ key: "ack", label: "Acknowledged", at: a.acknowledged_at, tone: "neutral" });
  steps.push({
    key: "resolved",
    label: "Resolved",
    at: a.resolved_at,
    detail: resolveRule(a),
    tone: "normal",
  });
  return steps;
}

export function resolveRule(a: Alert): string {
  if (a.kind === "device") return "Resolves when the device reports normally again";
  const metric = a.metric ? METRICS[a.metric] : null;
  if (!metric || a.threshold === null) return "Resolves when the condition clears";
  const clear = a.threshold - (a.hysteresis ?? 0);
  return `Resolves when ${metric.label} stays below ${formatNumber(clear)} ${metric.unit} (${formatNumber(a.threshold)} minus ${formatNumber(a.hysteresis ?? 0)} hysteresis) for 3 consecutive readings`;
}

const DOT: Record<NonNullable<TimelineStep["tone"]>, string> = {
  critical: "bg-state-critical",
  warn: "bg-state-warn",
  normal: "bg-state-normal",
  neutral: "bg-fg-secondary",
};

/** Vertical stepper. Reached steps are filled with their time; later steps stay hollow. */
export function AlertTimeline({ alert }: { alert: Alert }) {
  const steps = alertSteps(alert);
  const since: Array<string | null> = [];
  let prev: number | null = null;
  for (const s of steps) {
    const t = s.at ? Date.parse(s.at) : null;
    since.push(t !== null && prev !== null && t > prev ? formatDuration(t - prev) : null);
    if (t !== null) prev = t;
  }
  return (
    <ol className="relative flex flex-col">
      {steps.map((s, i) => {
        const reached = s.at !== null;
        const last = i === steps.length - 1;
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span aria-hidden="true" className="absolute top-4 bottom-0 left-[7px] w-px bg-line" />}
            <span
              aria-hidden="true"
              className={cn(
                "relative mt-1 size-4 shrink-0 rounded-pill border-2",
                reached ? cn("border-transparent", DOT[s.tone ?? "neutral"]) : "border-line-strong bg-surface-1",
              )}
            />
            <div className="min-w-0">
              <p className={cn("text-body", reached ? "text-fg" : "text-fg-muted")}>
                {s.label}
                {!reached && <span className="sr-only"> (not yet)</span>}
              </p>
              {s.at && (
                <p className="text-body-sm text-fg-muted">
                  <time dateTime={s.at} title={formatUtc(s.at)}>
                    {formatClock(s.at, undefined, true)}
                  </time>
                  {since[i] ? `, ${since[i]} later` : ""}
                </p>
              )}
              {s.detail && <p className="mt-1 text-body-sm text-fg-secondary">{s.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
