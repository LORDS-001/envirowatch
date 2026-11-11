import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BarChart, type Bar } from "@/components/charts/BarChart";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { DataTable, type ColumnDef } from "@/components/charts/DataTable";
import { HalfDonut } from "@/components/charts/HalfDonut";
import { LineChart, SeriesLegend, type LineSeries } from "@/components/charts/LineChart";
import { QualityBlocks, qualityShare } from "@/components/charts/QualityBlocks";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatReading } from "@/lib/format";
import { METRICS } from "@/lib/metrics";
import { NOW, QUALITY_DAYS, pmSeries } from "./fixtures";

const meta: Meta = { title: "Charts" };
export default meta;
type Story = StoryObj;

const pm = (v: number) => formatReading(v, "pm25");

const HOURS: Bar[] = Array.from({ length: 24 }, (_, h) => {
  const value = Math.round((22 + 10 * Math.sin((h - 6) / 3.8) + (h === 8 || h === 18 ? 14 : 0)) * 10) / 10;
  return { key: String(h), label: String(h).padStart(2, "0"), value, description: `${String(h).padStart(2, "0")}:00 WAT, mean ${pm(value)} µg/m³` };
});

export const Bars: Story = {
  name: "BarChart in ChartFrame",
  render: () => (
    <ChartFrame
      title="PM2.5 by hour"
      subtitle="Mean of valid readings, µg/m³, today"
      summary="PM2.5 peaked at 18:00 at 36.0 µg/m³, above the 35 µg/m³ limit once."
      rows={HOURS}
      columns={[
        { header: "Hour", cell: (b) => `${b.label}:00` },
        { header: "Mean", numeric: true, cell: (b) => pm(b.value) },
      ]}
      rowKey={(b) => b.key}
      className="max-w-3xl"
    >
      <BarChart bars={HOURS} defaultIndex={14} threshold={{ value: 35, label: "35 µg/m³ limit", critical: 55 }} formatValue={pm} ariaLabel="PM2.5 by hour" />
    </ChartFrame>
  ),
};

const SERIES: LineSeries[] = [
  { id: "a", label: "Apapa Port", color: "series-1", points: pmSeries(48) },
  { id: "b", label: "Yaba", color: "series-2", points: pmSeries(24, 1.4) },
];

export const Lines: Story = {
  name: "LineChart: gaps and suspicious points",
  render: () => (
    <div className="max-w-3xl rounded-lg border border-line bg-surface-1 p-6">
      <LineChart
        series={SERIES}
        gapMs={30_000}
        formatValue={pm}
        threshold={{ value: 35, label: "35 µg/m³ limit" }}
        marker={{ t: NOW - 30 * 60_000, label: "Alert opened" }}
        ariaLabel="PM2.5 at two sites, last 2 hours"
      />
      <SeriesLegend series={SERIES} />
      <p className="mt-2 max-w-[60ch] text-body-sm text-fg-muted">
        The six-minute outage breaks both lines; spikes are hollow diamonds kept out of the line.
      </p>
    </div>
  ),
};

export const Gauges: Story = {
  name: "RadialGauge and HalfDonut",
  render: () => (
    <div className="flex flex-wrap items-end gap-8">
      {[18.2, 47.5].map((v) => (
        <RadialGauge key={v} value={v} min={METRICS.pm25.gaugeRange[0]} max={METRICS.pm25.gaugeRange[1]} heatEdges={METRICS.pm25.heatEdges}>
          <span className="num text-reading-xl text-fg">{pm(v)}</span>
          <span className="text-body-sm text-fg-muted">µg/m³</span>
        </RadialGauge>
      ))}
      <RadialGauge value={null} min={0} max={125} heatEdges={METRICS.pm25.heatEdges} muted>
        <span className="num text-reading-xl text-fg-muted">–</span>
        <span className="text-body-sm text-fg-muted">No valid reading</span>
      </RadialGauge>
      <HalfDonut value={0.975} label="valid, last 24 h" />
    </div>
  ),
};

export const Quality: Story = {
  name: "QualityBlocks",
  render: () => (
    <ChartFrame
      title="Reading quality"
      subtitle="Readings that weren’t valid, share per day, last 7 days"
      summary="Valid readings ranged from 96.6 % to 98.3 % over the last 7 days."
      rows={QUALITY_DAYS}
      columns={[
        { header: "Day", cell: (d) => d.date.slice(0, 10) },
        { header: "Valid", numeric: true, cell: (d) => qualityShare(d, "valid") },
        { header: "Estimated", numeric: true, cell: (d) => qualityShare(d, "estimated") },
        { header: "Suspicious", numeric: true, cell: (d) => qualityShare(d, "suspicious") },
        { header: "Missing", numeric: true, cell: (d) => qualityShare(d, "missing") },
      ]}
      rowKey={(d) => d.date}
      className="max-w-xl"
    >
      <QualityBlocks days={QUALITY_DAYS} />
    </ChartFrame>
  ),
};

interface Row {
  id: string;
  site: string;
  health: "online" | "silent" | "drifting" | "suspicious";
  pm: number;
}
const HEALTH = ["online", "online", "online", "silent", "drifting", "online", "suspicious"] as const;
const ROWS: Row[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `sensor-${String(i + 1).padStart(3, "0")}`,
  site: ["Yaba", "Apapa Port", "Oshodi", "Ikotun", "Ijora"][i % 5]!,
  health: HEALTH[i % HEALTH.length]!,
  pm: Math.round((20 + ((i * 37) % 40)) * 10) / 10,
}));

function TableDemo({ loading, empty }: { loading?: boolean; empty?: boolean }) {
  const [selection, setSelection] = useState({});
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: "id", header: "Device", accessorFn: (r) => r.id, cell: ({ getValue }) => <span className="num text-data text-fg">{getValue() as string}</span>, meta: { width: "130px" } },
      { id: "site", header: "Site", accessorFn: (r) => r.site },
      { id: "health", header: "Status", accessorFn: (r) => r.health, cell: ({ row }) => <StatusBadge status={row.original.health} />, meta: { width: "140px" } },
      { id: "pm", header: "PM2.5 (µg/m³)", accessorFn: (r) => r.pm, cell: ({ row }) => pm(row.original.pm), meta: { numeric: true, width: "140px" } },
    ],
    [],
  );
  return (
    <div className="max-w-3xl">
      <DataTable
        data={empty ? [] : ROWS}
        columns={columns}
        getRowId={(r) => r.id}
        caption="Devices"
        height={420}
        loading={loading}
        empty={{ title: "No devices match", description: "Clear the filter or pick another site." }}
        selection={{ value: selection, onChange: setSelection }}
      />
    </div>
  );
}

export const Table: Story = {
  name: "DataTable: 1,000 rows",
  render: () => <TableDemo />,
};

export const TablePhone: Story = {
  name: "DataTable as cards (phone)",
  render: () => <TableDemo />,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: { docs: { description: { story: "Below 640 px every row becomes a card; sorting moves to a select." } } },
};

export const TableLoading: Story = { name: "DataTable loading", render: () => <TableDemo loading /> };
export const TableEmpty: Story = { name: "DataTable empty", render: () => <TableDemo empty /> };
