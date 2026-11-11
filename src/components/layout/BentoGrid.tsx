import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** 12 columns at ≥1280px, 6 at ≥768px, 1 below. 16px gaps. Spans keep their ratio at 6 columns (8+4 → 4+2). */
export function BentoGrid({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12", className)} {...rest} />;
}

export type Span = 3 | 4 | 6 | 8 | 12;

// Full class names so Tailwind can see them.
const SPAN: Record<Span, string> = {
  3: "md:col-span-3 xl:col-span-3",
  4: "md:col-span-2 xl:col-span-4",
  6: "md:col-span-6 xl:col-span-6",
  8: "md:col-span-4 xl:col-span-8",
  12: "md:col-span-6 xl:col-span-12",
};

export function span(n: Span): string {
  return SPAN[n];
}
