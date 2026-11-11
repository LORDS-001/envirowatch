import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import * as RC from "@radix-ui/react-checkbox";
import * as RS from "@radix-ui/react-switch";
import * as TG from "@radix-ui/react-toggle-group";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "h-9 w-full rounded-pill border border-line bg-surface-2 px-4 text-body text-fg placeholder:text-fg-muted hover:border-line-strong aria-[invalid=true]:border-state-critical disabled:opacity-50";

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}

/** Visible label, hint and error next to the field (never placeholder-only labels). */
function FieldShell({ id, label, hint, error, children, className }: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-label text-fg-secondary">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="text-body-sm text-state-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-body-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Mono for IDs, coordinates and numbers. */
  mono?: boolean;
}

export function TextField({ label, hint, error, mono, className, ...rest }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className={cn(control, mono && "num")}
        {...rest}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** Native select (best keyboard and screen-reader support), styled as a pill. */
export function SelectField({ label, hint, error, options, className, ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={cn(control, "appearance-none pr-10")}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-fg-muted"
        />
      </div>
    </FieldShell>
  );
}

/** Compact select without a visible label (label still announced). For filter bars. */
export function InlineSelect({
  label,
  options,
  className,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "aria-label"> & { label: string; options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <div className={cn("relative", className)}>
      <select
        aria-label={label}
        className="h-9 w-full appearance-none rounded-pill border border-line bg-surface-1 pr-10 pl-4 text-body text-fg hover:bg-surface-2"
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onCheckedChange,
  disabled,
  description,
}: {
  label: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  description?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <RC.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0 flex size-5 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface-2 data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-50"
      >
        <RC.Indicator>
          <Check size={14} strokeWidth={2.5} className="text-on-brand" aria-hidden="true" />
        </RC.Indicator>
      </RC.Root>
      <label htmlFor={id} className="text-body text-fg">
        {label}
        {description && <span className="block text-body-sm text-fg-muted">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <RS.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-6 w-10 shrink-0 rounded-pill border border-line-strong bg-surface-3 transition-colors duration-tick ease-standard data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:opacity-50"
      >
        <RS.Thumb className="block size-4 translate-x-1 rounded-pill bg-fg transition-transform duration-tick ease-standard data-[state=checked]:translate-x-5 data-[state=checked]:bg-on-brand" />
      </RS.Root>
      <label htmlFor={id} className="text-body text-fg">
        {label}
      </label>
    </div>
  );
}

/** Pill segmented control (metric, range, state filters). Single selection, arrow-key navigable. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <TG.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("inline-flex flex-wrap items-center gap-1 rounded-pill border border-line bg-surface-1 p-1", className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          className="inline-flex h-7 items-center gap-1 rounded-pill px-3 text-label text-fg-secondary transition-colors duration-tick ease-standard hover:text-fg data-[state=on]:bg-surface-3 data-[state=on]:text-fg"
        >
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  );
}
