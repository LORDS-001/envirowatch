import * as DM from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface RangeOption<T extends string> {
  value: T;
  label: string;
}

interface RangeSelectProps<T extends string> {
  /** Accessible name, e.g. "Time range". */
  label: string;
  value: T;
  options: readonly RangeOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/** Pill with a chevron ("Today ›") that opens a short menu. */
export function RangeSelect<T extends string>({ label, value, options, onChange, className }: RangeSelectProps<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <DM.Root>
      <DM.Trigger
        aria-label={`${label}: ${current?.label ?? value}`}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-pill border border-line bg-surface-1 pr-2 pl-3 text-label text-fg-secondary",
          "transition-colors duration-tick ease-standard hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg",
          className,
        )}
      >
        {current?.label ?? value}
        <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-md bg-surface-2 p-1 shadow-overlay"
        >
          <DM.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {options.map((o) => (
              <DM.RadioItem
                key={o.value}
                value={o.value}
                className="flex h-8 cursor-default items-center justify-between gap-4 rounded-sm px-2 text-body text-fg-secondary outline-none select-none data-[highlighted]:bg-surface-3 data-[highlighted]:text-fg data-[state=checked]:text-fg"
              >
                {o.label}
                <DM.ItemIndicator>
                  <Check size={14} strokeWidth={1.5} className="text-brand" aria-hidden="true" />
                </DM.ItemIndicator>
              </DM.RadioItem>
            ))}
          </DM.RadioGroup>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
