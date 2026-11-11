import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `hero` uses the larger 24px radius. */
  size?: "default" | "hero";
  as?: "section" | "div" | "article";
}

/** Surface-1 card with a 1px hairline and no shadow: depth is a step in surface. */
export function Card({ size = "default", as: Tag = "section", className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        "border border-line bg-surface-1",
        size === "hero" ? "rounded-xl" : "rounded-lg",
        className,
      )}
      {...rest}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
}

export function CardHeader({ title, subtitle, actions, id, className }: CardHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-h2 text-fg">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-body-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
