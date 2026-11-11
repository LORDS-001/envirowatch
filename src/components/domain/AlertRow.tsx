import { memo } from "react";
import { Link } from "react-router";
import type { Alert } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock, formatUtc } from "@/lib/format";
import { Age } from "@/components/ui/Age";
import { StatusBadge } from "@/components/ui/StatusBadge";

const KIND_LABEL = { environment: "Environment", device: "Device" } as const;

/**
 * StatusBadge, kind, title, meta (time, corroboration, notification outcome). Device-health rows
 * carry a left rule so they never read like hazards; unacknowledged Active rows are tinted.
 */
export const AlertRow = memo(function AlertRow({ alert, compact = false }: { alert: Alert; compact?: boolean }) {
  const unacked = alert.status === "active";
  const failed = alert.notifications.filter((n) => n.outcome === "failed").map((n) => n.channel);
  const delivered = alert.notifications.filter((n) => n.outcome === "delivered").length;
  const opened = alert.activated_at ?? alert.opened_at;

  return (
    <li>
      <Link
        to={`/alerts/${alert.id}`}
        className={cn(
          "group flex items-start gap-3 rounded-md px-3 py-3 transition-colors duration-tick ease-standard",
          unacked ? "bg-state-critical-subtle hover:bg-surface-3" : "hover:bg-surface-2",
          alert.kind === "device" && "border-l-2 border-line-strong",
        )}
      >
        <StatusBadge status={alert.status} />
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow text-fg-muted">{KIND_LABEL[alert.kind]}</p>
          <p className={cn("text-body text-fg", compact && "truncate")}>{alert.title}</p>
          <p className="mt-1 text-body-sm text-fg-muted">
            <time dateTime={opened} title={formatUtc(opened)}>
              {formatClock(opened)}
            </time>{" "}
            (<Age at={opened} />)
            {alert.corroborating_devices ? `, ${alert.corroborating_devices} sensors agree` : ""}
            {failed.length > 0
              ? `, ${failed.join(" and ")} notification failed`
              : delivered > 0
                ? `, ${delivered} notification${delivered === 1 ? "" : "s"} sent`
                : ""}
          </p>
        </div>
      </Link>
    </li>
  );
});
