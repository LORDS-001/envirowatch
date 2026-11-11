# Changelog

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
