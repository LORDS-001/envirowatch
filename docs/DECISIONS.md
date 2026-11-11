# Decisions

Dated, one paragraph each. Judgement calls, library choices and deviations from the brief.

## 2026-11-11 · Built from the brief’s §6 because the component specs never arrived

The kickoff paste was truncated at 50,000 characters, so `design/components/*.md`, `OverviewScreen.md`, `templates-map.md` and `component-reference.css` are missing. Components follow the brief’s §5–6 (sizes, radii, surfaces, states), the tokens and the principles, which together pin down most decisions. Each component gets diffed against its spec once the files arrive.

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

The brief describes stacked blocks per day of valid, estimated, suspicious and missing. Valid readings run near 97 % every day, so a proportional stack is a solid bar with slivers on top, and days can’t be compared (principle 1 outranks the look). Each column now stacks only estimated, suspicious and missing on their own labelled percentage axis, with the valid share printed as a mono number above each day. The table view gives exact shares. Needs a nod from design.

## 2026-11-11 · Radial gauge site defaults to the highest reading

The Overview gauge shows the site with the highest current PM2.5 (the one that matters), with a pill to switch to any of the top 12 sites. A city-mean gauge would duplicate the hero chip.

## 2026-11-11 · IDW coverage radius 3.2 km on the Overview

Lagos sites in the mock sit 3–6 km apart. A 3.2 km radius (opaque to 1.76 km, fading to zero at 3.2 km) leaves visible gaps between sparse sites instead of painting confident colour where no sensor is. This is principle 4 working as intended. It is configurable per map.
