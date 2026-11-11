import { useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Building2 } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TreeSite {
  id: string;
  name: string;
  devices: Array<{ id: string; flagged?: boolean }>;
}

interface TreeSidebarProps {
  organization: string;
  sites: readonly TreeSite[];
  selectedSite: string | null;
  onSelectSite: (id: string | null) => void;
  className?: string;
}

/** Organization → Site → Device, with hairline connectors. Selecting a site filters the table. */
export function TreeSidebar({ organization, sites, selectedSite, onSelectSite, className }: TreeSidebarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const total = sites.reduce((n, s) => n + s.devices.length, 0);
  return (
    <nav aria-label="Sites" className={cn("rounded-lg border border-line bg-surface-1 p-3", className)}>
      <button
        type="button"
        onClick={() => onSelectSite(null)}
        aria-current={selectedSite === null ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-body",
          selectedSite === null ? "bg-brand-subtle text-brand" : "text-fg hover:bg-surface-2",
        )}
      >
        <Building2 size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{organization}</span>
        <span className="num text-data text-fg-muted">{total}</span>
      </button>
      <ul className="relative mt-1 ml-4 border-l border-line">
        {sites.map((s) => {
          const expanded = open === s.id;
          const selected = selectedSite === s.id;
          return (
            <li key={s.id} className="relative">
              <span aria-hidden="true" className="absolute top-5 left-0 h-px w-3 bg-line" />
              <div className="ml-3 flex items-center">
                <button
                  type="button"
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${s.name}`}
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : s.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:text-fg"
                >
                  <ChevronRight size={14} strokeWidth={1.5} className={cn("transition-transform duration-tick", expanded && "rotate-90")} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onSelectSite(selected ? null : s.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-body",
                    selected ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="num text-data text-fg-muted">{s.devices.length}</span>
                </button>
              </div>
              {expanded && (
                <ul className="relative mb-1 ml-9 border-l border-line">
                  {s.devices.map((d) => (
                    <li key={d.id} className="relative">
                      <span aria-hidden="true" className="absolute top-1/2 left-0 h-px w-3 bg-line" />
                      <Link
                        to={`/devices/${d.id}`}
                        className="num ml-4 flex items-center justify-between rounded-sm px-2 py-1 text-data text-fg-secondary hover:bg-surface-2 hover:text-fg"
                      >
                        {d.id}
                        {d.flagged && <span className="size-2 rounded-pill bg-state-critical" aria-label="has a fault" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
