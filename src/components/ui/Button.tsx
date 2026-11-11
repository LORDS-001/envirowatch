import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-press",
  secondary: "border border-line bg-surface-2 text-fg hover:bg-surface-3 active:bg-surface-3",
  ghost: "text-fg-secondary hover:bg-surface-2 hover:text-fg active:bg-surface-3",
  destructive: "bg-state-critical-subtle text-state-critical hover:bg-state-critical hover:text-on-brand",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-label gap-1",
  md: "h-9 px-4 text-body gap-2",
  lg: "h-11 px-6 text-body-lg gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-pill font-medium whitespace-nowrap",
        "transition-colors duration-tick ease-standard",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});
