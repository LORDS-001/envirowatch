import { Fragment, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { NARROW_QUERY, useMediaQuery } from "@/lib/hooks";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/Feedback";
import { InlineSelect } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";

export type { ColumnDef };

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    numeric?: boolean;
    width?: string;
    /** On phones, this column heads each card. Defaults to the first column. */
    cardTitle?: boolean;
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
 * Below 640 px the same rows render as cards, one labelled field per column.
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
  const narrow = useMediaQuery(NARROW_QUERY);
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

  if (error) return <ErrorState title={error.title} detail={error.detail} onRetry={error.onRetry} />;

  const body = loading ? (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  ) : table.getRowModel().rows.length === 0 ? (
    <EmptyState title={empty?.title ?? "Nothing to show"} description={empty?.description} action={empty?.action} />
  ) : null;

  return narrow ? (
    <DataCards table={table} caption={caption} height={height} body={body} />
  ) : (
    <DataGrid table={table} caption={caption} height={height} compact={compact} body={body} onRowOpen={onRowOpen} />
  );
}

interface ViewProps<T> {
  table: Table<T>;
  caption: string;
  height: number;
  /** Loading or empty state, shown in place of rows. */
  body: ReactNode;
}

function DataGrid<T>({ table, caption, height, compact, body, onRowOpen }: ViewProps<T> & { compact: boolean; onRowOpen?: (row: T) => void }) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = compact ? 32 : 40;
  const rows = table.getRowModel().rows;
  const selectable = table.options.enableRowSelection === true;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  // The grid is one tab stop. Row checkboxes (Space) and row links (Enter) are reached through
  // its keys, so they leave the tab order; other controls in cells stay reachable.
  useLayoutEffect(() => {
    const selector = [selectable && "[role=gridcell] input[type=checkbox]", onRowOpen && "[role=gridcell] a[href]"].filter(Boolean).join(",");
    if (selector) scrollRef.current?.querySelectorAll<HTMLElement>(selector).forEach((el) => (el.tabIndex = -1));
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
    } else if (e.key === " " && selectable && rows[active]) {
      e.preventDefault();
      rows[active].toggleSelected();
    }
  };

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
        style={{ height: body ? undefined : Math.min(height, (rows.length + 1) * rowHeight + 2) }}
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

        {body ?? (
          <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index]!;
              const isActive = vi.index === active;
              return (
                <div
                  role="row"
                  id={`row-${row.id}`}
                  aria-rowindex={vi.index + 2}
                  aria-selected={selectable ? row.getIsSelected() : undefined}
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

const headerText = (header: unknown, fallback: string) => (typeof header === "string" ? header : fallback);

/**
 * Phones: one card per row, the title column on top and every other column as a labelled field.
 * Column headers aren't visible, so sorting moves to a select above the list.
 */
function DataCards<T>({ table, caption, height, body }: ViewProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const selectable = table.options.enableRowSelection === true;
  const columns = table.getVisibleLeafColumns().filter((c) => c.id !== "_select");
  const titleColumn = columns.find((c) => c.columnDef.meta?.cardTitle) ?? columns[0];
  const fieldColumns = columns.filter((c) => c !== titleColumn);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Title line plus one 24 px line per field; real heights are measured once drawn.
    estimateSize: () => 56 + fieldColumns.length * 24,
    gap: 8,
    overscan: 4,
  });

  const sortable = columns.filter((c) => c.getCanSort());
  const sort = table.getState().sorting[0];

  return (
    <div className="flex flex-col gap-3">
      {(sortable.length > 0 || selectable) && (
        <div className="flex flex-wrap items-center gap-2">
          {sortable.length > 0 && (
            <>
              <InlineSelect
                label={`Sort ${caption.toLowerCase()}`}
                value={sort?.id ?? ""}
                onChange={(e) => table.setSorting(e.target.value ? [{ id: e.target.value, desc: sort?.desc ?? false }] : [])}
                options={[
                  { value: "", label: "Default order" },
                  ...sortable.map((c) => ({ value: c.id, label: `Sort by ${headerText(c.columnDef.header, c.id)}` })),
                ]}
                className="min-w-0 flex-1"
              />
              {sort && (
                <IconButton
                  label={sort.desc ? "Sorted high to low. Sort low to high" : "Sorted low to high. Sort high to low"}
                  icon={sort.desc ? <ArrowDown size={16} aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
                  onClick={() => table.setSorting([{ id: sort.id, desc: !sort.desc }])}
                />
              )}
            </>
          )}
          {selectable && (
            <label className="flex h-10 items-center gap-2 px-2 text-body text-fg-secondary">
              <input
                type="checkbox"
                checked={table.getIsAllRowsSelected()}
                ref={(el) => {
                  if (el) el.indeterminate = table.getIsSomeRowsSelected();
                }}
                onChange={table.getToggleAllRowsSelectedHandler()}
                className="size-4 accent-brand"
              />
              Select all
            </label>
          )}
        </div>
      )}

      {body ? (
        <div className="rounded-md border border-line">{body}</div>
      ) : (
        // Focusable so the list scrolls from the keyboard; links and checkboxes inside are tab stops.
        <div
          ref={scrollRef}
          role="region"
          aria-label={caption}
          tabIndex={0}
          className="overflow-auto rounded-md"
          style={{ maxHeight: `min(${height}px, 70dvh)` }}
        >
          <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index]!;
              const title = titleColumn && row.getAllCells().find((c) => c.column.id === titleColumn.id);
              return (
                <li
                  key={row.id}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  aria-setsize={rows.length}
                  aria-posinset={vi.index + 1}
                  className={cn(
                    "absolute inset-x-0 top-0 rounded-md border border-line p-3",
                    row.getIsSelected() ? "bg-surface-3" : "bg-surface-1",
                  )}
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <div className="flex min-h-6 items-center gap-3">
                    {selectable && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.id}`}
                        checked={row.getIsSelected()}
                        onChange={row.getToggleSelectedHandler()}
                        className="size-4 shrink-0 accent-brand"
                      />
                    )}
                    {title && (
                      <span className={cn("min-w-0 truncate text-body-lg text-fg", titleColumn.columnDef.meta?.numeric && "num")}>
                        {flexRender(title.column.columnDef.cell, title.getContext())}
                      </span>
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
                    {row
                      .getVisibleCells()
                      .filter((cell) => fieldColumns.includes(cell.column))
                      .map((cell) => (
                        <Fragment key={cell.id}>
                          <dt className="flex min-h-6 items-center text-body-sm text-fg-muted">
                            {headerText(cell.column.columnDef.header, cell.column.id)}
                          </dt>
                          <dd
                            className={cn(
                              "flex min-h-6 min-w-0 items-center text-body text-fg-secondary",
                              cell.column.columnDef.meta?.numeric && "num text-data text-fg",
                            )}
                          >
                            <span className="min-w-0 truncate">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                          </dd>
                        </Fragment>
                      ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
