> **Incomplete copy.** The source brief was truncated at 50,000 characters partway through the Colour section. Everything below the marker at the end is missing. Paste the rest of `brand-book.md` to complete this file.

EnviroWatch watches the air, heat and water of a community through a network of sensors, and says plainly how much each reading can be trusted. The brand is an instrument panel at night: a calm, near-black field where numbers are the brightest thing on screen and colour appears only when something needs attention. Tagline: **Every reading, accounted for.**

Read `principles.md` before designing a new screen; it settles most arguments. `references.md` maps the six chosen UI templates (the Templates asset group) to EnviroWatch pages, and says what to take from each and what to leave behind.

**The look in one line:** the soft, rounded bento layout of the chosen templates, translated to a dark instrument panel. Big rounded cards, pill controls, one Lichen highlight per chart, numbers first.

## Content fundamentals

**Voice: a careful field scientist.** Precise, calm, plain. EnviroWatch never dramatises a reading and never hides a doubt about one.

| Trait | We write | We don’t write |
|---|---|---|
| Precise | “PM2.5 above 35 µg/m³ for 10 min” | “Air quality is bad” |
| Calm | “Sensor 014 stopped reporting 6 min ago” | “⚠️ DEVICE FAILURE!!!” |
| Honest about doubt | “Estimated from 4 sensors within 2.1 km” | “Air quality in Surulere: 42” (when nothing sits in Surulere) |
| Plain | “Readings are 3 min late” | “Ingestion latency exceeded SLA” (on public pages) |

- **Two registers.** Operator screens are terse and technical: metric names (`PM2.5`, `temperature_c`), device IDs, ISO timestamps. The public portal is plain language at body-lg: “Air is moderate in Yaba this afternoon.”
- **Always give the unit.** Every number carries its unit beside it (`31.4 °C`, `68 %`, `35 µg/m³`), with a thin space or normal space before the unit and none before `%` in tables.
- **Always give the time.** Every reading shows its age (“2 min ago”) and, on hover or in detail, its event time and received time in UTC.
- **Sentence case** for buttons, titles and alerts (“Acknowledge alert”, not “Acknowledge Alert”). Uppercase only in `eyebrow` style.
- **Second person, sparingly**, on the public portal (“Air near you”). The product never says “I” or “we” inside the app.
- **No emoji** in product UI, alerts, emails or reports. Icons carry meaning.
- **Numbers:** tabular figures, thousands separators (`1,000 devices`), en dash for ranges (`10–20 °C`), true minus (`−2.4`), × for multiplication.
- **Alert titles** follow *metric · condition · duration · place*: “PM2.5 above 35 µg/m³ for 10 min · Yaba North”. Device-health alerts start with the device: “Sensor 014 · silent for 6 min”. The two kinds must never read alike.

## Visual foundations

### Colour
- Paint every page on `bg-canvas`. Cards and the left nav sit on `surface-1`; hover rows, inputs and popovers on `surface-2`; selected rows on `surface-3`. Depth is a step in surface, not a shadow.
- `brand` (Lichen, #C5F269) is the only brand hue. Use it for the primary button (text `on-brand`), the active nav item (`brand-subtle` fill, `brand` icon), selection and `focus-ring`. Never use `brand` to mean a data state; good air is `state-normal`, not lime.
- Keep a screen about 90 % neutral. If a dashboard looks colourful when nothing is wrong, something is miscoloured.
- **States are fixed and never borrowed:** `state-normal` (circle), `state-warn` (triangle), `state-critical` (octagon), `state-suspicious` (diamond). Each always appears with its icon shape **and** a word. Warn and critical are close in lightness, so the shape and the word are what separate them for colour-blind readers, not the hue.
- **Estimated** data (IDW cells, interpolated gaps) has no colour of its own: draw it dashed or hatched in `text-secondary`, and label it “Estimated”. **Stale** data dims to `text-muted` with a clock icon and its age.
- Chart series use `series-1` … `series-4` in that order on every chart, so “Device A” is the same teal everywhere. Context lines (nearby sensors, baselines) use `series-other`. Thresholds are dashed `state-warn` or `state-critical` lines, labelled at the right edge.
- The heat map uses `heat-1` … `heat-7`, low to high. Highest values are the brightest so hotspots pop on

<!-- TRUNCATED: source ended here -->
