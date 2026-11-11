# Design principles

Five principles, in priority order. When two pull against each other, the higher one wins. Test every screen against them in design review.

## 1. Trust before beauty

**Every value shows how far it can be trusted.** A reading that is stale, suspicious, estimated or quarantined is marked where it appears: in the tile, on the chart, on the map and in the export.

- *Why:* the PRD’s core problem is late, duplicate, out-of-order and faulty data. A beautiful chart of a broken sensor misleads an operator.
- *Do:* a metric tile whose sensor has gone silent dims its value to `text-muted`, adds a clock icon and says “Last reading 12 min ago”.
- *Don’t:* keep showing the last value at full brightness with a green dot because the tile’s layout has no room for a quality flag.
- *Trade-off:* more labels and icons on screen. We accept the extra density.

## 2. Calm until it matters

**Colour is reserved for state.** With nothing wrong, the screen is neutral greys plus one Lichen accent. Colour appears only when a reading, device or alert needs attention.

- *Why:* if everything is colourful, an alert can’t stand out. Operators should spot a problem from across the room.
- *Do:* show normal readings in `text-primary` with a small `state-normal` dot.
- *Don’t:* colour every gauge green-to-red “because it looks good”, or tint cards by metric type.
- *Trade-off:* the default dashboard looks quiet, and some will call it plain. That is the point.

## 3. Never colour alone

**Every state has a colour, a shape and a word.** Normal is a circle, Warning a triangle, Critical an octagon, Suspicious a diamond. Charts add dash patterns or direct labels, and the heat map always has a labelled legend.

- *Why:* about 1 in 12 men has a colour-vision deficiency, the PRD requires colour-blind-safe output, and exported PDFs may be printed in greyscale.
- *Do:* a badge reads ▲ “Pending” in `state-warn`.
- *Don’t:* use an orange dot versus a red dot as the only difference between Pending and Active.
- *Trade-off:* badges are wider than dots. In very dense tables, keep the shape and put the word in the tooltip.

## 4. Show the working

**Estimates say they are estimates, and every number carries its unit and its time.** IDW cells carry the method caption, readings show event time and received time on demand, and exports include quality notes.

- *Why:* IDW doesn’t model wind or terrain, and late messages make “now” ambiguous. Users must be able to tell an observation from a calculation.
- *Do:* “≈ 38 µg/m³ · estimated from 4 sensors within 2.1 km”.
- *Don’t:* paint the map edge-to-edge with confident colour where no sensor exists.
- *Trade-off:* longer captions and tooltips, and a coverage fade that leaves gaps in the map.

## 5. Numbers are the hero

**Chrome steps back so readings step forward.** Readings are the brightest, largest type on the screen, in mono with tabular figures. Navigation, borders and labels stay quiet.

- *Why:* operators scan values. Live updates must not jitter as digits change width.
- *Do:* show `31.4` in `reading-xl`, with `°C` beside it in `body-sm` `text-muted`.
- *Don’t:* use a 24px card title above an 18px value, or decorative icons larger than the number.
- *Trade-off:* fewer illustrations and less “personality” in the app shell. Personality lives in the voice and the mark.
