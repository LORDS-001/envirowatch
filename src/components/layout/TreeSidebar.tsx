import { useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
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

const ORG = "org";
const ROW = "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-body";
// The ring sits on the row, not the treeitem, which also wraps its children.
const RING = "outline-focus-ring outline-offset-2";

/**
 * Organization → Site → Device, with hairline connectors. Selecting a site filters the table.
 * An ARIA tree: one tab stop; ↑ ↓ move, → expands or enters, ← collapses or goes up,
 * Home/End jump, Enter or Space selects a site or opens a device.
 */
export function TreeSidebar({ organization, sites, selectedSite, onSelectSite, className }: TreeSidebarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string>(selectedSite ?? ORG);
  const treeRef = useRef<HTMLUListElement>(null);
  const navigate = useNavigate();
  const total = sites.reduce((n, s) => n + s.devices.length, 0);
  // If the focused item disappears (a collapsed device, a filtered site), the org keeps the tab stop.
  const tabKey = focusKey === ORG || sites.some((s) => s.id === focusKey || (open === s.id && s.devices.some((d) => `d:${d.id}` === focusKey))) ? focusKey : ORG;

  const focusItem = (key: string) => {
    setFocusKey(key);
    // Wait for an expand to render its children before focusing one.
    requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus());
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>("[role=treeitem]");
    if (!item || !treeRef.current) return;
    e.stopPropagation();
    const key = item.dataset.key!;
    const items = [...treeRef.current.querySelectorAll<HTMLElement>("[role=treeitem]")].map((el) => el.dataset.key!);
    const i = items.indexOf(key);
    const site = sites.find((s) => s.id === key);
    const parentSite = key.startsWith("d:") ? sites.find((s) => s.devices.some((d) => `d:${d.id}` === key)) : undefined;
    const go = (k: string | undefined) => {
      e.preventDefault();
      if (k) focusItem(k);
    };

    switch (e.key) {
      case "ArrowDown":
        return go(items[i + 1]);
      case "ArrowUp":
        return go(items[i - 1]);
      case "Home":
        return go(items[0]);
      case "End":
        return go(items[items.length - 1]);
      case "ArrowRight":
        if (key === ORG) return go(sites[0]?.id);
        if (site && open !== site.id) {
          e.preventDefault();
          return setOpen(site.id);
        }
        if (site) return go(site.devices[0] && `d:${site.devices[0].id}`);
        return;
      case "ArrowLeft":
        if (parentSite) return go(parentSite.id);
        if (site && open === site.id) {
          e.preventDefault();
          return setOpen(null);
        }
        if (site) return go(ORG);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (key === ORG) return onSelectSite(null);
        if (site) return onSelectSite(selectedSite === site.id ? null : site.id);
        return navigate(`/devices/${key.slice(2)}`);
    }
  };

  return (
    <nav aria-label="Sites" className={cn("rounded-lg border border-line bg-surface-1 p-3", className)}>
      <ul ref={treeRef} role="tree" aria-label={`${organization}: sites and devices`} onFocus={(e) => {
        const key = (e.target as HTMLElement).dataset.key;
        if (key) setFocusKey(key);
      }}>
        <li
          role="treeitem"
          data-key={ORG}
          aria-level={1}
          aria-expanded
          aria-selected={selectedSite === null}
          tabIndex={tabKey === ORG ? 0 : -1}
          onKeyDown={onKey}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[role=treeitem]")?.getAttribute("data-key") === ORG) onSelectSite(null);
          }}
          className="group/org cursor-pointer outline-none"
        >
          <div className={cn(ROW, RING, "group-focus-visible/org:outline-2", selectedSite === null ? "bg-brand-subtle text-brand" : "text-fg hover:bg-surface-2")}>
            <Building2 size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{organization}</span>
            <span className="num text-data text-fg-muted">{total}</span>
          </div>
          <ul role="group" className="relative mt-1 ml-4 border-l border-line">
            {sites.map((s) => {
              const expanded = open === s.id;
              const selected = selectedSite === s.id;
              return (
                <li
                  key={s.id}
                  role="treeitem"
                  data-key={s.id}
                  aria-level={2}
                  aria-expanded={expanded}
                  aria-selected={selected}
                  aria-label={`${s.name}, ${s.devices.length} devices`}
                  tabIndex={tabKey === s.id ? 0 : -1}
                  onKeyDown={onKey}
                  onClick={(e) => {
                    e.stopPropagation();
                    if ((e.target as HTMLElement).closest("[role=treeitem]") === e.currentTarget) onSelectSite(selected ? null : s.id);
                  }}
                  className="group/site relative cursor-pointer outline-none"
                >
                  <span aria-hidden="true" className="absolute top-5 left-0 h-px w-3 bg-line" />
                  <div className="ml-3 flex items-center">
                    {/* Mouse affordance; the keyboard uses → and ←. */}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(expanded ? null : s.id);
                      }}
                      className="flex size-7 shrink-0 items-center justify-center rounded-sm text-fg-muted hover:text-fg"
                    >
                      <ChevronRight size={14} strokeWidth={1.5} className={cn("transition-transform duration-tick", expanded && "rotate-90")} />
                    </button>
                    <div
                      className={cn(
                        ROW,
                        RING,
                        "min-w-0 flex-1 justify-between group-focus-visible/site:outline-2",
                        selected ? "bg-brand-subtle text-brand" : "text-fg-secondary hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="num text-data text-fg-muted">{s.devices.length}</span>
                    </div>
                  </div>
                  {expanded && (
                    <ul role="group" className="relative mb-1 ml-9 border-l border-line">
                      {s.devices.map((d) => (
                        <li
                          key={d.id}
                          role="treeitem"
                          data-key={`d:${d.id}`}
                          aria-level={3}
                          aria-selected={false}
                          aria-label={d.flagged ? `${d.id}, has a fault` : d.id}
                          tabIndex={tabKey === `d:${d.id}` ? 0 : -1}
                          onKeyDown={onKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/devices/${d.id}`);
                          }}
                          className="group/device relative cursor-pointer outline-none"
                        >
                          <span aria-hidden="true" className="absolute top-1/2 left-0 h-px w-3 bg-line" />
                          <span
                            className={cn(
                              RING,
                              "num ml-4 flex items-center justify-between rounded-sm px-2 py-1 text-data text-fg-secondary group-focus-visible/device:outline-2 hover:bg-surface-2 hover:text-fg",
                            )}
                          >
                            {d.id}
                            {d.flagged && <span className="size-2 rounded-pill bg-state-critical" aria-hidden="true" />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
    </nav>
  );
}
