import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  icon: ReactNode;
  /** A small dot on the icon, e.g. unacknowledged alerts. Describe it in `label`. */
  dot?: boolean;
}

/** 40px circle. Icon-only buttons always carry a label and a tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, dot = false, className, type = "button", ...rest },
  ref,
) {
  return (
    <Tooltip content={label} side="bottom">
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          "relative inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-line bg-surface-1 text-fg-secondary",
          "transition-colors duration-tick ease-standard hover:bg-surface-2 hover:text-fg active:bg-surface-3",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...rest}
      >
        {icon}
        {dot && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2 rounded-pill bg-state-critical ring-2 ring-surface-1"
          />
        )}
      </button>
    </Tooltip>
  );
});
