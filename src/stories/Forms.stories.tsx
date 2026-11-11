import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox, InlineSelect, Segmented, SelectField, Switch, TextField } from "@/components/ui/Field";
import { RangeSelect } from "@/components/ui/RangeSelect";
import { SearchField } from "@/components/ui/SearchField";

const meta: Meta = { title: "Forms" };
export default meta;
type Story = StoryObj;

const SITES = [
  { value: "yaba", label: "Yaba" },
  { value: "apapa", label: "Apapa Port" },
  { value: "oshodi", label: "Oshodi" },
];

export const Fields: Story = {
  name: "TextField and SelectField",
  render: () => (
    <div className="grid max-w-md gap-6">
      <TextField label="Device ID" mono defaultValue="sensor-1001" hint="Lowercase, as printed on the sensor." />
      <TextField label="Email" type="email" defaultValue="ops@" error="Enter an email like name@example.org" />
      <TextField label="Threshold (µg/m³)" mono inputMode="decimal" defaultValue="35" disabled />
      <SelectField label="Site" options={SITES} defaultValue="apapa" />
      <SelectField label="Site" options={SITES} defaultValue="" error="Pick the site this device is installed at" />
    </div>
  ),
};

function Choices() {
  const [notify, setNotify] = useState(true);
  const [suspicious, setSuspicious] = useState(false);
  const [metric, setMetric] = useState<"pm25" | "temperature_c" | "humidity_percent">("pm25");
  const [range, setRange] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  return (
    <div className="grid max-w-md gap-6">
      <Checkbox label="Email on-call operators" description="Sent when an alert becomes Active." checked={notify} onCheckedChange={setNotify} />
      <Checkbox label="SMS (no number on file)" checked={false} onCheckedChange={() => {}} disabled />
      <Switch label="Include suspicious readings" checked={suspicious} onCheckedChange={setSuspicious} />
      <Segmented
        label="Metric"
        value={metric}
        onChange={setMetric}
        options={[
          { value: "pm25", label: "PM2.5" },
          { value: "temperature_c", label: "Temperature" },
          { value: "humidity_percent", label: "Humidity" },
        ]}
      />
      <RangeSelect
        label="Range"
        value={range}
        onChange={setRange}
        options={[
          { value: "1h", label: "1 h" },
          { value: "24h", label: "24 h" },
          { value: "7d", label: "7 d" },
          { value: "30d", label: "30 d" },
        ]}
      />
    </div>
  );
}

export const Toggles: Story = {
  name: "Checkbox, Switch, Segmented, RangeSelect",
  render: () => <Choices />,
};

export const FilterBar: Story = {
  name: "SearchField and InlineSelect",
  render: () => (
    <div className="flex max-w-2xl flex-wrap items-center gap-2">
      <SearchField label="Filter devices" placeholder="Filter by ID or site" className="w-72" />
      <InlineSelect label="Site" options={[{ value: "", label: "All sites" }, ...SITES]} className="w-48" />
    </div>
  ),
};
