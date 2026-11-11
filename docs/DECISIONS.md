# Decisions

Dated, one paragraph each. Judgement calls, library choices and deviations from the brief.

## 2026-11-11 · Built from the brief’s §6; the brief is the component spec

The kickoff paste was truncated at 50,000 characters, so `design/components/*.md`, `OverviewScreen.md`, `templates-map.md` and `component-reference.css` looked missing. The product owner confirmed (2026-11-11) that those files don’t exist. The brief’s §5–6 (sizes, radii, surfaces, states), the tokens and the principles are the spec, and there is no separate diff to do.

## 2026-11-11 · ESLint 9, not 10

`eslint-plugin-jsx-a11y` (required by the brief) declares a peer range ending at ESLint 9. ESLint 9 runs the same flat config, so the a11y lint stays.

## 2026-11-11 · TanStack Table pinned to v8

npm resolved v9, which changes the table API substantially. v8 is the stable, documented API the DataTable plan is written against. Revisit once v9 is established.

## 2026-11-11 · MSW 3 WebSocket link for the mock stream

The mock live feed uses MSW’s `ws.link`, so the real `RealtimeClient` (backoff, heartbeat, Zod parsing, batching) runs unchanged in mock mode. Only the server end is simulated.

## 2026-11-11 · Mock “server-side” session in sessionStorage

The brief forbids tokens in browser storage and prefers an httpOnly refresh cookie. MSW can’t set httpOnly cookies, so the mock *server* remembers who signed in (in `sessionStorage`, inside `src/mocks/` only). App code keeps the access token in memory and calls `POST /auth/refresh` on boot, exactly as it would against the real backend. Logged as a gap.

## 2026-11-11 · Values outside the token set

- **22 px badge height** (`h-[22px]`): the brief specifies 22 px for StatusBadge and pills; no size token exists. Used for StatusBadge, StatCard context pills and the Estimated flag.
- **Opacity modifiers on tokens** (`bg-sunken/60`, `bg-on-brand/10`, `text-on-brand/70`, `/80`): the brief’s Drawer scrim is “60 % `bg-sunken`”. The same mechanism gives secondary text on the Lichen highlight card. No new colours are introduced.
- **Search input left padding 40 px** (`pl-10`): clears the 16 px icon at a 16 px inset. It equals `--icon-button`; not on the spacing scale.
- **Readable measure** (`max-w-[18ch…60ch]`): line-length limits for prose, not layout spacing.

## 2026-11-11 · Bar chart is a keyboard slider

The arrow-key-navigable bar chart uses `role="slider"` with `aria-valuetext` (“14:00 WAT, mean 23.4 µg/m³, peak 31.0 µg/m³”). A bar chart you step through is semantically a slider over periods, screen readers announce each step natively, and it satisfies jsx-a11y without suppressions. The `View as table` toggle remains the full alternative.

## 2026-11-11 · QualityBlocks stacks only non-valid readings

The brief describes stacked blocks per day of valid, estimated, suspicious and missing. Valid readings run near 97 % every day, so a proportional stack is a solid bar with slivers on top, and days can’t be compared (principle 1 outranks the look). Each column now stacks only estimated, suspicious and missing on their own labelled percentage axis, with the valid share printed as a mono number above each day. The table view gives exact shares. Approved by the product owner on 2026-11-11. On phones the per-day valid share drops to whole percentages so seven numbers fit side by side.

## 2026-11-11 · Radial gauge site defaults to the highest reading

The Overview gauge shows the site with the highest current PM2.5 (the one that matters), with a pill to switch to any of the top 12 sites. A city-mean gauge would duplicate the hero chip.

## 2026-11-11 · IDW coverage radius 3.2 km on the Overview

Lagos sites in the mock sit 3–6 km apart. A 3.2 km radius (opaque to 1.76 km, fading to zero at 3.2 km) leaves visible gaps between sparse sites instead of painting confident colour where no sensor is. This is principle 4 working as intended. It is configurable per map.

## 2026-11-11 · Basemap: Esri Dark Gray Canvas instead of CARTO

The brief suggests CARTO Dark Matter without labels. CARTO's tile servers now return an "API key required" image. Esri's Dark Gray Canvas has the same structure (a label-free base plus a separate reference-labels layer, drawn above the heat surface), needs no key, and permits this use with attribution, which the map shows. Swap the two URLs in `HeatMap.tsx` if the project gets a CARTO key.

## 2026-11-11 · Raw readings for one device, up to 24 h

`/measurements` serves raw rows for one device and metric over at most 24 h (8,640 rows at the 10 s cadence). Longer ranges and site means use `/measurements/aggregates`, with a bucket chosen from the span (1 m, 15 m, 1 h, 6 h, 1 d). The chart and table say which they show. This keeps the browser and API bounded and matches FR-012.

## 2026-11-11 · LineChart stays SVG, thinned with LTTB to about one point per pixel

The brief suggests Canvas above roughly 2,000 points. With LTTB thinning to the plot width (display only; tables, aggregates and tooltips use every point), SVG stays well within budget and keeps per-element accessibility. Canvas remains the plan if we ever draw several dense series at once.

## 2026-11-11 · IDW worker requests are coalesced

One grid job is in flight per map; the newest request waits behind it and every result is drawn. Cells clearly beyond coverage (flat-earth distance with a 5 % margin) are skipped before the exact haversine IDW, which still computes every drawn cell, so the 1e-9 acceptance test is unaffected.

## 2026-11-11 · Mock alerts resolve after acknowledgement

To show the whole lifecycle (PRD journey 2) without waiting for the model's air to clear, the mock resolves an acknowledged environmental alert about 12 s later and pushes `alert.resolved` over the socket. Device alerts stay open until the device recovers.

## 2026-11-11 · `reading-2xl` token for the public hero number

The public portal's headline reading is 64 px mono, larger than `reading-xl`. It is the one number a resident came for, read on a phone at arm's length. Approved by the product owner on 2026-11-11 and added as `reading-2xl` (64/64, 500, −0.02em) in `tokens.css` and `tailwind-theme.css` (both copies). It replaces the hard-coded `text-[64px]`. Use it only for a page's single headline reading.

## 2026-11-11 · Tenant switch by query parameter

`/devices?organization_id=…` passes the organization to the API, for administrators who belong to more than one tenant. The API refuses other tenants (403), and the page shows "You don't have access to this. Ask an administrator". Journey 5 tests this. A proper organization switcher waits for the users/organizations contract.

## 2026-11-11 · Tables become cards below 640 px

`DataTable` switches layout itself (`useMediaQuery`, below Tailwind's `sm`), so every table gets it without page changes. Each row becomes a card: one title column on top (the first column, or the one marked `meta.cardTitle`) and every other column as a labelled field. Column headers aren't visible in cards, so sorting moves to a select plus a direction button, and "Select all" becomes a labelled checkbox. Cards stay virtualised with measured heights. On the Devices page below 1024 px, the 46-site tree is replaced by a site picker so the list isn't pushed a screen down.

## 2026-11-11 · Keyboard: a grid and a tree are one tab stop each

The keyboard-only walkthrough found two places where Tab walked through everything. **Grids:** row checkboxes and row links were each tab stops, although the grid already selects with Space and opens with Enter. Where the grid's keys cover them (checkboxes when selectable, links when `onRowOpen` is set), they now leave the tab order; other controls in cells stay reachable. Sensor health gained Enter-to-open so its device links are still reachable. **Site tree:** it was two tab stops per site (93 on Devices). It is now an ARIA tree with a roving tab stop: ↑ ↓ move, → expands or enters, ← collapses or goes up, Home/End, and Enter or Space selects. The expand chevron stays as a mouse affordance outside the tab order.

## 2026-11-11 · Focus returns to main when the opener is gone

Radix returns focus to whatever opened a dialog or drawer. When that element no longer exists (a resolved alert leaves the open-alerts list, a Deactivate button becomes Reactivate), focus dropped to `<body>`, and the next Tab started from the top of the page. Dialogs and drawers now fall back to `main#main`, which already takes focus for the skip link.

## 2026-11-11 · `tabIndex` allowed on `role="region"`

A scrolling area must take focus so it scrolls from the keyboard (WCAG 2.1.1; axe `scrollable-region-focusable`). The card list is such a region, so `jsx-a11y/no-noninteractive-tabindex` now allows `region` next to its default `tabpanel`.

