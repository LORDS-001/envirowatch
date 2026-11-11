import type { ReactNode } from "react";
import { Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { StateIcon } from "./StateIcon";
import { Button } from "./Button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** An empty screen is an invitation to act. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-8 text-center", className)}>
      <Inbox size={20} strokeWidth={1.5} className="text-fg-muted" aria-hidden="true" />
      <p className="text-h3 text-fg">{title}</p>
      {description && <p className="max-w-[48ch] text-body-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  /** What happened, e.g. "Couldn't load readings". */
  title: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}

/** Says what went wrong and what to do. Never apologises, never vague. */
export function ErrorState({ title, detail, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-2 px-6 py-8 text-center", className)}
    >
      <span className="inline-flex items-center gap-1 text-h3 text-fg">
        <StateIcon shape="octagon" size={12} className="text-state-critical" />
        {title}
      </span>
      {detail && <p className="max-w-[52ch] text-body-sm text-fg-muted">{detail}</p>}
      {onRetry && (
        <Button
          size="sm"
          className="mt-2"
          onClick={onRetry}
          icon={<RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" />}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
