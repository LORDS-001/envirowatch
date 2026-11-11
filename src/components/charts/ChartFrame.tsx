import { useId, useState, type ReactNode } from "react";
import { Table2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader } from "@/components/ui/Card";

export interface TableColumn<Row> {
  header: string;
  /** Numbers are right-aligned in mono. */
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
}

interface ChartFrameProps<Row> {
  title: string;
  subtitle?: ReactNode;
  /** Range select or other controls. */
  actions?: ReactNode;
  /** Screen-reader summary of the chart: current value, trend, exceedances. */
  summary: string;
  rows: readonly Row[];
  columns: readonly TableColumn<Row>[];
  rowKey: (row: Row) => string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

/** Wraps every chart: title, subtitle, controls, accessible summary and a "View as table" toggle. */
export function ChartFrame<Row>({
  title,
  subtitle,
  actions,
  summary,
  rows,
  columns,
  rowKey,
  children,
  className,
  footer,
}: ChartFrameProps<Row>) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();

  return (
    <Card aria-labelledby={titleId} className={cn("flex flex-col p-6", className)}>
      <CardHeader
        id={titleId}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {actions}
            <button
              type="button"
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-pill border px-3 text-label transition-colors duration-tick ease-standard",
                asTable
                  ? "border-transparent bg-surface-3 text-fg"
                  : "border-line bg-surface-1 text-fg-secondary hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Table2 size={14} strokeWidth={1.5} aria-hidden="true" />
              {asTable ? "View as chart" : "View as table"}
            </button>
          </>
        }
      />
      <p className="sr-only">{summary}</p>
      <div className="mt-4 min-h-0 flex-1">
        {asTable ? <DataTableSimple rows={rows} columns={columns} rowKey={rowKey} caption={title} /> : children}
      </div>
      {footer}
    </Card>
  );
}

/** Plain semantic table for chart data. The virtualised DataTable (phase 3) replaces it for long histories. */
export function DataTableSimple<Row>({
  rows,
  columns,
  rowKey,
  caption,
}: {
  rows: readonly Row[];
  columns: readonly TableColumn<Row>[];
  rowKey: (row: Row) => string;
  caption: string;
}) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-line">
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                className={cn("h-10 px-3 text-eyebrow text-fg-muted", c.numeric ? "text-right" : "text-left")}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-t border-line hover:bg-surface-2">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={cn("h-10 px-3 text-body", c.numeric ? "num text-right text-data" : "text-fg-secondary")}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
