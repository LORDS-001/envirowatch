import type { ReactNode } from "react";
import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, type ButtonVariant } from "./Button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Blocks closing by Esc or scrim, e.g. while showing a key that must be copied. */
  dismissable?: boolean;
  className?: string;
}

/** Centred modal: focus trap, Esc to close, focus returns to the trigger (Radix). */
export function Dialog({ open, onOpenChange, title, description, children, footer, dismissable = true, className }: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-sunken/60" />
        <RD.Content
          onEscapeKeyDown={(e) => !dismissable && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissable && e.preventDefault()}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-surface-1 shadow-modal",
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 p-6 pb-0">
            <div>
              <RD.Title className="text-h2 text-fg">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-1 text-body text-fg-secondary">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            {dismissable && (
              <RD.Close
                aria-label="Close"
                className="flex size-8 shrink-0 items-center justify-center rounded-pill text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <X size={16} strokeWidth={1.5} aria-hidden="true" />
              </RD.Close>
            )}
          </header>
          {children && <div className="min-h-0 overflow-y-auto p-6">{children}</div>}
          {footer && <footer className="flex justify-end gap-2 border-t border-line p-4">{footer}</footer>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Names the action: "Deactivate device", not "OK". */
  confirmLabel: string;
  variant?: ButtonVariant;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = "primary",
  busy = false,
  error,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-body-sm text-state-critical">
          {error}
        </p>
      )}
    </Dialog>
  );
}
