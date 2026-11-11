import { Check, CircleDashed } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AlertStatus } from "@/lib/api/types";
import { STATE_SHAPE, StateIcon, type DataState } from "./StateIcon";

export type DeviceHealth = "online" | "silent" | "drifting" | "suspicious" | "deactivated";
export type BadgeStatus = AlertStatus | DeviceHealth;

interface Spec {
  word: string;
  state: DataState | null;
}

const SPECS: Record<BadgeStatus, Spec> = {
  pending: { word: "Pending", state: "warn" },
  active: { word: "Active", state: "critical" },
  acknowledged: { word: "Acknowledged", state: null },
  resolved: { word: "Resolved", state: "normal" },
  online: { word: "Online", state: "normal" },
  silent: { word: "Silent", state: "critical" },
  drifting: { word: "Drifting", state: "warn" },
  suspicious: { word: "Suspicious", state: "suspicious" },
  deactivated: { word: "Deactivated", state: null },
};

const TONE: Record<DataState, string> = {
  normal: "bg-state-normal-subtle text-state-normal",
  warn: "bg-state-warn-subtle text-state-warn",
  critical: "bg-state-critical-subtle text-state-critical",
  suspicious: "bg-state-suspicious-subtle text-state-suspicious",
};

/**
 * Alert lifecycle and device health. Always icon + word (principle 3).
 * Acknowledged and Deactivated are handling states, not data states, so they stay neutral.
 */
export function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  const spec = SPECS[status];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-pill px-3 text-label whitespace-nowrap",
        spec.state ? TONE[spec.state] : "bg-surface-3 text-fg-secondary",
        className,
      )}
    >
      {spec.state ? (
        <StateIcon shape={STATE_SHAPE[spec.state]} size={10} />
      ) : status === "acknowledged" ? (
        <Check size={12} strokeWidth={2} aria-hidden="true" />
      ) : (
        <CircleDashed size={12} strokeWidth={1.5} aria-hidden="true" />
      )}
      {spec.word}
    </span>
  );
}
