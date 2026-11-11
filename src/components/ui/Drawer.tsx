import type { ReactNode } from "react";
import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useReturnFocus } from "./returnFocus";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Plain-text name for screen readers when `title` is rich. */
  label: string;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Right-side panel over a 60 % sunken scrim. Focus trap, Esc, focus return (to main if the opener is gone). */
export function Drawer({ open, onOpenChange, title, label, header, children, footer }: DrawerProps) {
  const returnFocus = useReturnFocus();
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-40 bg-sunken/60" />
        <RD.Content
          {...returnFocus}
          aria-label={label}
          className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(560px,100vw)] flex-col border-l border-line bg-surface-1 shadow-modal"
        >
          <header className="flex items-start justify-between gap-4 border-b border-line p-6">
            <div className="min-w-0">
              {header}
              <RD.Title className="mt-2 text-h2 text-fg">{title}</RD.Title>
              <RD.Description className="sr-only">{label}</RD.Description>
            </div>
            <RD.Close
              aria-label="Close"
              className="flex size-10 shrink-0 items-center justify-center rounded-pill border border-line text-fg-secondary hover:bg-surface-2 hover:text-fg"
            >
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </RD.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line p-4">{footer}</footer>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
