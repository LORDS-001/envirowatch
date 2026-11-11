import { config } from "@/lib/config";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { useConnection } from "@/lib/realtime/connection";
import { StateIcon } from "./StateIcon";

/**
 * Live connection state. "Live" when connected and fresh; "Delayed" when the newest reading is
 * older than the NFR-004 budget (5 s); "Reconnecting…" / "Offline" while the socket is down.
 */
export function LiveIndicator({ className }: { className?: string }) {
  const status = useConnection((s) => s.status);
  const lagMs = useConnection((s) => s.lagMs);
  const delayed = status === "connected" && lagMs !== null && lagMs > config.freshnessBudgetMs;

  let content;
  if (status === "connected" && !delayed) {
    content = (
      <>
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-pill bg-brand opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2 rounded-pill bg-brand" />
        </span>
        <span className="text-eyebrow text-fg">Live</span>
      </>
    );
  } else if (delayed) {
    content = (
      <>
        <StateIcon shape="triangle" size={10} className="text-state-warn" />
        <span className="text-label text-state-warn">Delayed · {formatDuration(lagMs ?? 0)}</span>
      </>
    );
  } else if (status === "reconnecting") {
    content = (
      <>
        <StateIcon shape="triangle" size={10} className="text-state-warn" />
        <span className="text-label text-state-warn">Reconnecting…</span>
      </>
    );
  } else if (status === "offline") {
    content = (
      <>
        <StateIcon shape="octagon" size={10} className="text-state-critical" />
        <span className="text-label text-state-critical">Offline</span>
      </>
    );
  } else {
    content = <span className="text-label text-fg-muted">Connecting…</span>;
  }

  return (
    <div
      role="status"
      className={cn("inline-flex h-9 items-center gap-2 rounded-pill border border-line bg-surface-1 px-3", className)}
    >
      {content}
    </div>
  );
}
