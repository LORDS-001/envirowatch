import type { Meta, StoryObj } from "@storybook/react-vite";
import { STATE_SHAPE, STATE_TEXT_CLASS, StateIcon, type DataState } from "@/components/ui/StateIcon";

/** The team's visual QA page: every token with its name and job. */
const meta: Meta = { title: "Foundations" };
export default meta;
type Story = StoryObj;

const SURFACES = [
  ["bg-canvas", "Page background"],
  ["bg-sunken", "Wells, map ground, scrims"],
  ["bg-surface-1", "Cards, nav rail"],
  ["bg-surface-2", "Hover, inputs, popovers"],
  ["bg-surface-3", "Selected, pressed, quiet bars"],
] as const;

const TEXT = [
  ["text-fg", "Primary text and readings"],
  ["text-fg-secondary", "Supporting text"],
  ["text-fg-muted", "Labels, stale values"],
  ["text-fg-disabled", "Disabled"],
] as const;

const BRAND = [
  ["bg-brand", "Lichen: primary action, active nav, selection, focus. Never a data state."],
  ["bg-brand-subtle", "Active nav item fill"],
] as const;

const STATES: Array<[DataState, string]> = [
  ["normal", "Normal: circle"],
  ["warn", "Warning: triangle"],
  ["critical", "Critical: octagon"],
  ["suspicious", "Suspicious: diamond"],
];

const SERIES = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-other"];
const HEAT = ["bg-heat-1", "bg-heat-2", "bg-heat-3", "bg-heat-4", "bg-heat-5", "bg-heat-6", "bg-heat-7"];

function Swatch({ cls, label }: { cls: string; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className={`size-10 shrink-0 rounded-md border border-line ${cls}`} />
      <span>
        <span className="num block text-data text-fg">{cls}</span>
        <span className="text-body-sm text-fg-muted">{label}</span>
      </span>
    </li>
  );
}

export const Colour: Story = {
  render: () => (
    <div className="grid max-w-5xl gap-8 md:grid-cols-2">
      <section>
        <h2 className="mb-4 text-h2">Surfaces (depth is a step, not a shadow)</h2>
        <ul className="flex flex-col gap-3">{SURFACES.map(([c, l]) => <Swatch key={c} cls={c} label={l} />)}</ul>
      </section>
      <section>
        <h2 className="mb-4 text-h2">Text</h2>
        <ul className="flex flex-col gap-3">
          {TEXT.map(([c, l]) => (
            <li key={c} className={`text-body-lg ${c}`}>
              {l} <span className="num text-data">({c})</span>
            </li>
          ))}
        </ul>
        <h2 className="mt-8 mb-4 text-h2">Brand</h2>
        <ul className="flex flex-col gap-3">{BRAND.map(([c, l]) => <Swatch key={c} cls={c} label={l} />)}</ul>
      </section>
      <section>
        <h2 className="mb-4 text-h2">States: colour, shape and word</h2>
        <ul className="flex flex-col gap-3">
          {STATES.map(([s, l]) => (
            <li key={s} className={`flex items-center gap-2 text-body ${STATE_TEXT_CLASS[s]}`}>
              <StateIcon shape={STATE_SHAPE[s]} size={14} /> {l}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-4 text-h2">Series (fixed order) and heat (low → high)</h2>
        <div className="flex gap-2">{SERIES.map((c) => <span key={c} title={c} className={`h-8 flex-1 rounded-sm ${c}`} />)}</div>
        <div className="mt-4 flex overflow-hidden rounded-pill">{HEAT.map((c) => <span key={c} title={c} className={`h-4 flex-1 ${c}`} />)}</div>
      </section>
    </div>
  ),
};

const TYPE = [
  ["text-display-xl", "Display XL 40/44"],
  ["text-display-lg", "Display L 32/36"],
  ["text-h1", "Heading 1 24/30"],
  ["text-h2", "Heading 2 18/24"],
  ["text-h3", "Heading 3 15/20"],
  ["text-body-lg", "Body L 16/24, public portal"],
  ["text-body", "Body 14/20, operator app"],
  ["text-body-sm", "Body S 13/18"],
  ["text-label", "Label 12/16"],
  ["text-eyebrow uppercase", "Eyebrow 11/16, the only uppercase style, never with a unit"],
] as const;

export const Type: Story = {
  render: () => (
    <div className="flex max-w-4xl flex-col gap-4">
      {TYPE.map(([c, l]) => (
        <p key={c} className={`${c} text-fg`}>
          {l}
        </p>
      ))}
      <p className="flex items-baseline gap-2">
        <span className="num text-reading-xl">31.4</span>
        <span className="text-body-sm text-fg-muted">°C</span>
        <span className="text-body-sm text-fg-muted">Reading XL: IBM Plex Mono, tabular figures</span>
      </p>
      <p className="flex items-baseline gap-2">
        <span className="num text-reading-md">1,000</span>
        <span className="text-body-sm text-fg-muted">Reading M</span>
      </p>
      <p className="num text-data text-fg-secondary">Data 13/18 · −2.4 · 10–20 °C · 35 µg/m³</p>
    </div>
  ),
};

const SPACE = [1, 2, 3, 4, 6, 8, 12, 16];
const RADII = [
  ["rounded-xs", "2"],
  ["rounded-sm", "4"],
  ["rounded-md", "8: tiles inside cards, nav items"],
  ["rounded-lg", "16: cards"],
  ["rounded-xl", "24: hero, rail, frame"],
  ["rounded-pill", "Buttons, inputs, badges, chips"],
] as const;

export const SpaceAndShape: Story = {
  name: "Space and shape",
  render: () => (
    <div className="flex max-w-4xl flex-col gap-8">
      <section>
        <h2 className="mb-4 text-h2">Spacing scale (4 px step; only these)</h2>
        <ul className="flex flex-col gap-2">
          {SPACE.map((n) => (
            <li key={n} className="flex items-center gap-3">
              <span className="num w-24 text-data text-fg-muted">
                space-{n} · {n * 4}px
              </span>
              <span className="h-3 rounded-xs bg-brand" style={{ width: n * 4 }} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-4 text-h2">Radii</h2>
        <ul className="flex flex-wrap gap-4">
          {RADII.map(([c, l]) => (
            <li key={c} className="flex flex-col items-center gap-2">
              <span className={`size-20 border border-line-strong bg-surface-2 ${c}`} />
              <span className="num text-data">{c}</span>
              <span className="max-w-32 text-center text-label text-fg-muted">{l}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  ),
};
