import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";

export type { ColumnDef };

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    numeric?: boolean;
    width?: string;
  }
}

interface DataTableProps<T> {
  data: readonly T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  caption: string;
  /** Visible height of the scroll area. */
  height?: number;
  compact?: boolean;
  loading?: boolean;
  error?: { title: string; detail?: string; onRetry?: () => void } | null;
  empty?: { title: string; description?: string; action?: ReactNode };
  selection?: { value: RowSelectionState; onChange: (v: RowSelectionState) => void };
  onRowOpen?: (row: T) => void;
  initialSorting?: SortingState;
}

/**
 * TanStack Table + Virtual. Only visible rows are in the DOM, so 100,000 rows scroll smoothly.
 * Keyboard: focus the table, ↑ ↓ move between rows, Home/End jump, Enter opens.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  caption,
  height = 480,
  compact = false,
  loading,
  error,
  empty,
  selection,
  onRowOpen,
  initialSorting = [],
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = compact ? 32 : 40;
  const selectable = !!selection;

  // Selection is a real checkbox column so mouse and screen-reader users can select too.
  const allColumns = useMemo<ColumnDef<T, unknown>[]>(
    () =>
      selectable
        ? [
            {
              id: "_select",
              header: ({ table }) => (
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={table.getIsAllRowsSelected()}
                  ref={(el) => {
                    if (el) el.indeterminate = table.getIsSomeRowsSelected();
                  }}
                  onChange={table.getToggleAllRowsSelectedHandler()}
                  className="size-4 accent-brand"
                />
              ),
              cell: ({ row }) => (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.id}`}
                  checked={row.getIsSelected()}
                  onChange={row.getToggleSelectedHandler()}
                  className="size-4 accent-brand"
                />
              ),
              enableSorting: false,
              meta: { width: "44px" },
            },
            ...columns,
          ]
        : columns,
    [columns, selectable],
  );

  const table = useReactTable({
    data: data as T[],
    columns: allColumns,
    getRowId,
    state: { sorting, rowSelection: selection?.value ?? {} },
    onSortingChange: setSorting,
    enableRowSelection: !!selection,
    onRowSelectionChange: (updater) => {
      if (!selection) return;
      selection.onChange(typeof updater === "function" ? updater(selection.value) : updater);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const onKey = (e: KeyboardEvent) => {
    if (!rows.length) return;
    const last = rows.length - 1;
    const page = Math.max(1, Math.floor(height / rowHeight) - 1);
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      PageDown: Math.min(last, active + page),
      PageUp: Math.max(0, active - page),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      const next = moves[e.key]!;
      setActive(next);
      virtualizer.scrollToIndex(next, { align: "auto" });
    } else if (e.key === "Enter" && onRowOpen && rows[active]) {
      onRowOpen(rows[active].original);
    } else if (e.key === " " && selection && rows[active]) {
      e.preventDefault();
      rows[active].toggleSelected();
    }
  };

  if (error) return <ErrorState title={error.title} detail={error.detail} onRetry={error.onRetry} />;

  const template = table
    .getVisibleLeafColumns()
    .map((c) => c.columnDef.meta?.width ?? "minmax(0,1fr)")
    .join(" ");
  const activeRow = rows[active];

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div
        ref={scrollRef}
        role="grid"
        aria-label={caption}
        aria-rowcount={rows.length + 1}
        aria-activedescendant={activeRow ? `row-${activeRow.id}` : undefined}
        tabIndex={0}
        onKeyDown={onKey}
        className="overflow-auto"
        style={{ height: loading || rows.length === 0 ? undefined : Math.min(height, (rows.length + 1) * rowHeight + 2) }}
      >
        <div role="rowgroup" className="sticky top-0 z-10 bg-surface-2">
          {table.getHeaderGroups().map((hg) => (
            <div role="row" aria-rowindex={1} key={hg.id} className="grid" style={{ gridTemplateColumns: template }}>
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                const canSort = h.column.getCanSort();
                const numeric = h.column.columnDef.meta?.numeric;
                return (
                  <div
                    role="columnheader"
                    key={h.id}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={cn("flex h-10 items-center px-3", numeric && "justify-end")}
                  >
                    {h.column.id === "_select" ? (
                      flexRender(h.column.columnDef.header, h.getContext())
                    ) : canSort ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 rounded-sm text-eyebrow text-fg-muted hover:text-fg"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" && <ArrowUp size={12} aria-hidden="true" />}
                        {sorted === "desc" && <ArrowDown size={12} aria-hidden="true" />}
                      </button>
                    ) : (
                      <span className="text-eyebrow text-fg-muted">{flexRender(h.column.columnDef.header, h.getContext())}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={empty?.title ?? "Nothing to show"} description={empty?.description} action={empty?.action} />
        ) : (
          <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index]!;
              const isActive = vi.index === active;
              return (
                <div
                  role="row"
                  id={`row-${row.id}`}
                  aria-rowindex={vi.index + 2}
                  aria-selected={selection ? row.getIsSelected() : undefined}
                  key={row.id}
                  className={cn(
                    "absolute inset-x-0 grid border-t border-line",
                    row.getIsSelected() ? "bg-surface-3" : "hover:bg-surface-2",
                    isActive && "-outline-offset-2 in-focus-visible:outline-2 in-focus-visible:outline-focus-ring",
                  )}
                  style={{ height: rowHeight, transform: `translateY(${vi.start}px)`, gridTemplateColumns: template }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      role="gridcell"
                      key={cell.id}
                      className={cn(
                        "flex min-w-0 items-center px-3 text-body text-fg-secondary",
                        cell.column.columnDef.meta?.numeric && "num justify-end text-data text-fg",
                      )}
                    >
                      <span className="min-w-0 truncate">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
