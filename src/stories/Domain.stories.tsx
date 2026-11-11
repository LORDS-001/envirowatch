import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { Activity, Cpu, ShieldCheck } from "lucide-react";
import { AlertRow } from "@/components/domain/AlertRow";
import { AlertTimeline } from "@/components/domain/AlertTimeline";
import { StatCard } from "@/components/domain/StatCard";
import { TreeSidebar } from "@/components/layout/TreeSidebar";
import { HeatLegend } from "@/components/map/HeatLegend";
import { HeatMap } from "@/components/map/HeatMap";
import { IdwMiniMap } from "@/components/map/IdwMiniMap";
import { Segmented } from "@/components/ui/Field";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { useConnection, type ConnectionStatus } from "@/lib/realtime/connection";
import { ALERTS, PM_SAMPLES, SITES } from "./fixtures";

const meta: Meta = {
  title: "Domain and maps",
  // AlertRow and TreeSidebar link into the app.
  decorators: [(Story) => <MemoryRouter>{Story()}</MemoryRouter>],
};
export default meta;
type Story = StoryObj;

export const StatCards: Story = {
  name: "StatCard",
  render: () => (
    <div className="grid max-w-4xl gap-4 md:grid-cols-3">
      <StatCard highlight icon={<Cpu size={20} strokeWidth={1.5} />} label="Devices online" value="996" unit="of 1,000" context="4 not reporting" />
      <StatCard icon={<Activity size={20} strokeWidth={1.5} />} label="Readings per second" value="100.0" unit="/s" context="12 duplicates dropped" />
      <StatCard icon={<ShieldCheck size={20} strokeWidth={1.5} />} label="Valid readings" value="–" loading />
    </div>
  ),
};

export const Alerts: Story = {
  name: "AlertRow",
  render: () => (
    <ul className="flex max-w-xl flex-col gap-1">
      {ALERTS.map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}
    </ul>
  ),
};

export const Timeline: Story = {
  name: "AlertTimeline",
  render: () => (
    <div className="grid max-w-4xl gap-8 md:grid-cols-2">
      <AlertTimeline alert={ALERTS[0]!} />
      <AlertTimeline alert={ALERTS[3]!} />
    </div>
  ),
};

function LiveDemo() {
  const [status, setStatus] = useState<ConnectionStatus>("connected");
  useEffect(() => useConnection.getState().set({ status, lagMs: status === "connected" ? 1_200 : null }), [status]);
  return (
    <div className="flex flex-col items-start gap-4">
      <Segmented
        label="Connection"
        value={status}
        onChange={setStatus}
        options={[
          { value: "connecting", label: "Connecting" },
          { value: "connected", label: "Connected" },
          { value: "reconnecting", label: "Reconnecting" },
          { value: "offline", label: "Offline" },
        ]}
      />
      <LiveIndicator />
    </div>
  );
}

export const Live: Story = { name: "LiveIndicator", render: () => <LiveDemo /> };

function TreeDemo() {
  const [site, setSite] = useState<string | null>(null);
  const sites = SITES.slice(0, 8).map((s, i) => ({
    id: s.id,
    name: s.name,
    devices: Array.from({ length: 4 }, (_, d) => ({ id: `sensor-${String(i * 4 + d + 1).padStart(3, "0")}`, flagged: (i + d) % 9 === 0 })),
  }));
  return <TreeSidebar organization="Lagos Community Sensor Network" sites={sites} selectedSite={site} onSelectSite={setSite} className="max-w-xs" />;
}

export const Tree: Story = { name: "TreeSidebar", render: () => <TreeDemo /> };

export const Legend: Story = {
  name: "HeatLegend",
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      <HeatLegend metric="pm25" />
      <HeatLegend metric="temperature_c" compact />
    </div>
  ),
};

export const MiniMap: Story = {
  name: "IdwMiniMap",
  render: () => (
    <div className="max-w-2xl">
      <IdwMiniMap metric="pm25" samples={PM_SAMPLES} sites={SITES} flagged={new Set([SITES[5]!.id])} className="h-80" />
    </div>
  ),
};

function MapDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="relative h-[480px] max-w-4xl overflow-hidden rounded-xl border border-line">
      <HeatMap metric="pm25" samples={PM_SAMPLES} sites={SITES} selectedSite={selected} onSelectSite={setSelected} className="absolute inset-0" />
    </div>
  );
}

export const FullMap: Story = { name: "HeatMap (needs network for tiles)", render: () => <MapDemo /> };
