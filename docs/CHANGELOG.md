# Changelog

## 2026-11-11 · Phase 6 (hardening)

**Phones**
- Tables become cards below 640 px: a title line, then each column as a labelled field. Sorting moves to a select; selection keeps a "Select all" checkbox.
- Devices below 1024 px uses a site picker instead of the 46-site tree.
- The reading-quality chart fits seven days at 375 px (whole percentages on phones).
- Checked at 375 px: no page scrolls sideways.

**Keyboard**
- `e2e/keyboard.spec.ts` runs journeys 1 and 2 with the keyboard alone and checks that every stop shows a focus ring. `RECORD=1` saves a video of each.
- The site tree is an ARIA tree with one tab stop (it was 93).
- Grids are one tab stop: row checkboxes and row links are reached with Space and Enter. Sensor health opens a device with Enter.
- Dialogs and drawers return focus to `main` when the element that opened them is gone (for example, a resolved alert that left the list).

**Fixes**
- Line charts over long ranges drew no line. Gaps were detected after thinning, and thinned neighbours sit minutes apart, so every point became its own segment. Gaps are now found on every reading, then each segment is thinned. Covered by new tests.
- The public home page jumped by 0.48 CLS when readings arrived. Its loading placeholder now has the hero's shape, line for line.
- Added `robots.txt` (index the public portal only).

**Design system**
- New token `reading-2xl` (64/64, 500, −0.02em) for the public portal's headline number, replacing a hard-coded size.
- The QualityBlocks deviation is approved; the brief's §6 is confirmed as the component spec.

**Storybook**
- New stories: Forms (fields, checkbox, switch, segmented, range, search), Overlays (dialog, confirm, drawer, toast, key reveal, tooltip), Charts (bar, line with gaps and suspicious points, gauges, quality blocks, DataTable at desktop and phone width, loading and empty), Domain and maps (stat cards, alert rows and timeline, live indicator, site tree, legends, IDW mini-map, heat map).

## 2026-11-11 · Phases 3–5 (all remaining screens)

**Screens**
- **Environmental map** (`/map`): full-bleed Leaflet map (Esri Dark Gray Canvas, labels drawn above the surface), IDW surface on its own canvas pane computed in a worker, metric picker, include-suspicious toggle, 24 h time scrubber, ranked site list, site panel (measured value, state, latest per metric, sensors needing a look, link to analytics), legend and method caption, and keyboard-reachable markers whose state is shape plus words.
- **Historical analytics** (`/analytics`): metric, site and device filters, 1 h / 24 h / 7 d / 30 d / custom ranges, compare up to 4 series, LineChart (gaps break the line, suspicious points are hollow diamonds kept out of it, crosshair with event and received time), aggregate min/max/mean/count, and a virtualised raw-readings table with event time, received time, lateness, quality and reading ID. The Export button carries the selection to Reports.
- **Alerts** (`/alerts`, `/alerts/:id`): state, kind and site filters; a drawer with the lifecycle timeline (crossed, Pending, Active, each notification and its outcome, Acknowledged, Resolved, with the resolve rule), a per-minute context chart with the opening marked, sensors at the site with live quality, and Acknowledge. Device alerts carry a left rule and a "Device" kind label.
- **Sensor health** (`/health`): online, silent, drifting and suspicious counts; the valid-reading half-donut; pipeline metrics (ingest rate, queue depth, error rate, DB writes, p50/p95/p99); sensors needing a look sorted by severity; the live `sensor.fault_detected` feed; reading quality.
- **Devices** (`/devices`, `/devices/:id`): Organization → Site → Device tree, a virtualised table with checkbox selection, bulk deactivate, and register (the key is shown once, with copy and a warning). Detail page: metadata, edit, rotate key (confirm, then the new key once), deactivate or reactivate, live readings with quality and event/received time, health timeline, ingestion outcomes.
- **Reports** (`/reports`): metrics, range (presets or custom), sites (filterable, or all), CSV or PDF, quality-notes switch, and session job rows (Preparing, Ready with download and size, Failed with reason). Exports state units, range (UTC) and quality notes.
- **Settings** (`/settings/*`, admin): organization; users and roles (invite, change role); sites (add, with coordinate validation); alert rules (threshold or unusual change, hysteresis, consecutive readings, cooldown, channels, enabled; a plain-language summary of each rule; Save only when changed); retention (raw ≤ hourly ≤ daily enforced, with a storage estimate).
- **Simulator** (`/simulator`, admin): baseline, one-hour fault injection or custom mix; seed; 60× or 360× speed; pause, resume and stop (confirmed); simulated clock and progress; injected, detected, missed and false-alert counts; recall = TP/(TP+FN) and precision = TP/(TP+FP) with their working; mean time to detect; ground truth against detections; CSV evaluation export.
- **Public portal** (`/public`, `/public/map`, no sign-in): pill nav with the lockup; "Air is moderate in Yaba this afternoon" with an area picker; big PM2.5 and temperature with advice; every area with its band shape and word; 24 h city trend; CSV download; "What do these numbers mean?" with the bands and how readings are checked; public map with metric picker, legend and method caption.

**Shared**: Dialog and ConfirmDialog, Drawer, Toast, TextField, SelectField, InlineSelect, Checkbox, Switch, Segmented, KeyReveal, DataTable (TanStack Table + Virtual, keyboard rows, sorting, checkbox selection), LineChart (+ LTTB display thinning), HalfDonut, AlertTimeline, TreeSidebar, HeatMap.

**Mock backend**: raw measurements (paged, up to 24 h), site and device aggregates (1 m to 1 d buckets), historical and suspicious-inclusive heatmaps, single alert, acknowledgement followed by resolution about 12 s later over the socket, device CRUD with keys, device health and ingestion outcomes, health summary, users, sites, rules, retention, CSV and PDF exports, simulator runs with a seeded ground-truth plan, and public trend, heatmap and CSV. Admin routes return 403 to operators.

**Fixes found while checking the screens**
- The full-map IDW grid takes over a second. The old hook dropped every result older than the newest request, so with live data changing each second the surface never drew. The hook now keeps one job in flight and queues only the newest request, and `computeGrid` skips cells clearly beyond coverage before running the exact IDW.
- CARTO basemaps now need an API key. Switched to Esri Dark Gray Canvas (no key; attribution shown).
- TanStack Table caches accessor values per row, so site names that loaded after the rows never appeared. Names now go into the row data.

**Tests**: 56 unit and component tests. Playwright journeys 1–5 (register → key once → online; alert → acknowledge → resolved; public map without login; fault-injection evaluation; cross-tenant 403) and axe on 13 routes.

## 2026-11-11 · Phases 0–2 (foundation, live data, Overview)

**Built**
- Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind v4 with the EnviroWatch tokens and theme (default palette cleared), self-hosted IBM Plex Sans and Mono, ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier.
- Typed API client with Zod at the boundary, typed endpoints, in-memory session with cookie-based restore, route guards (`RequireAuth`, `RequireRole`), lazy routes, 403 and 404 pages.
- Seeded simulator: 46 Lagos sites, 1,000 devices, diurnal temperature, humidity and PM2.5, and injected faults (silent `sensor-014`, drifting `sensor-207`, spiking `sensor-512`, wrong-clock `sensor-733`, 1 % duplicates, 2 % late by 30–180 s). MSW REST handlers for the contract plus gap endpoints; the MSW WebSocket streams about 100 messages/s.
- Realtime client: one socket, Zod-validated, backoff with jitter, heartbeat timeout, refetch after reconnect. Events are buffered and applied to the query cache once per second by a pure reducer that de-duplicates by `reading_id`, orders by `event_time` and keeps quarantined readings out.
- Quality rules (`lib/quality`), formatting (`lib/format`: units, true minus, en dashes, WAT with UTC on hover), IDW + haversine (`lib/idw`) with a Web Worker grid.
- Primitives: Button, IconButton, StatusBadge, QualityFlag, EstimatedFlag, Card, RangeSelect, SearchField, Tooltip, Skeleton, EmptyState, ErrorState, LiveIndicator (Live, Delayed, Reconnecting, Offline).
- Layout: AppShell with floating NavRail and TopBar, BentoGrid.
- Charts: ChartFrame (summary and View as table), BarChart, RadialGauge, QualityBlocks, IdwMiniMap and HeatLegend. Domain: StatCard, AlertRow.
- **Overview page**: plain-language hero with a ranked “Highest now” list, two stat chips and a live IDW mini-map (Estimated flag, legend, method caption); stat strip; PM2.5 by hour or day; site gauge; reading quality; alerts needing attention.

**Tests**: 52 unit and component tests (IDW within 1e-9 of an independent calculation, quality rules, formatting, reducer de-dup and ordering, backoff, simulator determinism and faults, badge icon + word, quality flags, chart table toggle). Playwright: auth redirect, login error, Overview live with IDW caption and alerts, chart table view, operator role guard, axe on four routes.

**Visual check against the brief** (no target screenshot received): matches the hero → stat strip → bars and gauge → quality structure from the template-1 layout. Deviation: QualityBlocks stacks only non-valid readings (see DECISIONS).

**Performance** (production build, `/overview`, 100 msg/s mock stream, 10 s window, page verified rendered and live)
- Before: 18–21 long tasks, 1,761 ms total, longest 137 ms, timer lag p95 101 ms.
- After: **0 long tasks**, timer lag p95 8–12 ms.
- Fixes: a shared 1 s clock that only age labels subscribe to (the page no longer re-renders every second); derived data keyed to the live snapshot’s flush time; memoised BarChart, IdwMiniMap, QualityBlocks and AlertRow; bar labels formatted once per data change; an inlined single-parse site-mean hot path; a cached reduced-motion media query and heat colours; and the mock server computes latest readings at most once per second (it shares the page’s main thread).

**Accessibility**: axe (WCAG 2.0–2.2 A/AA) reports no serious or critical violations on `/login`, `/overview`, `/public` and 404.

**Storybook**: config plus Foundations (colour, type, space and shape, state shapes) and Primitives (StatusBadge, QualityFlag, Button and IconButton, loading, empty and error) stories.

**Known issues**
- Initial JS is 174 KB gzipped, plus 162 KB for MSW in mock mode. The public portal needs its own lean entry to meet the 200 KB budget.
- Under load, the cold Playwright dev server is slow; the Overview axe scan is marked `test.slow()`.
- Fast-refresh lint warnings (files exporting a component plus helpers). Harmless, to tidy.
