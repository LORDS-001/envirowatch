import { useId, type InputHTMLAttributes } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export function SearchField({ label, className, ...rest }: SearchFieldProps) {
  const id = useId();
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        size={16}
        strokeWidth={1.5}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-muted"
      />
      <input
        id={id}
        type="search"
        className="h-9 w-full rounded-pill border border-line bg-surface-1 pr-4 pl-10 text-body text-fg placeholder:text-fg-muted hover:bg-surface-2 focus:bg-surface-2"
        {...rest}
      />
    </div>
  );
}
