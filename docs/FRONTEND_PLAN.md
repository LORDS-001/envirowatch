# EnviroWatch frontend plan

Status: Phases 0–2 done (2026-11-11); next is phase 3 (map and analytics). This plan follows `CLAUDE_CODE_PROMPT.md`; where the two differ, the brief wins and the difference is logged in `DECISIONS.md`.

## Inputs actually received

The kickoff brief was pasted inline and was truncated at 50,000 characters. Received in full: the brief (§0–17), `design/tokens.css`, `design/tailwind-theme.css`, `design/principles.md`, all logo SVGs, and the six template images. Received in part: `design/brand-book.md` (stops inside “Colour”). **Not received:** `design/templates-map.md`, `design/components/*.md` (including `OverviewScreen.md`), `design/reference/component-reference.css`, `design/tokens.json`, and the Overview target screenshot.

Consequence: components are built from the brief’s §6 specs, which give anatomy, sizes, radii and states for every component. When the missing files arrive, each component is diffed against its spec and corrected (tracked below as Q1).

## Route map

| Route | Guard | Page | Phase |
|---|---|---|---|
| `/login` | public | Login | 0 |
| `/` → `/overview` | operator+ | Overview | 2 |
| `/map` | operator+ | Environmental map | 3 |
| `/analytics` | operator+ | Historical analytics | 3 |
| `/alerts`, `/alerts/:id` (drawer) | operator+ | Alerts | 4 |
| `/health` | operator+ | Sensor health | 4 |
| `/devices`, `/devices/:id` | operator+ (mutations admin) | Devices | 4 |
| `/reports` | operator+ | Reports | 5 |
| `/settings/*` | admin | Settings | 5 |
| `/simulator` | admin | Simulator controls | 5 |
| `/public`, `/public/map` | none | Public portal | 5 |
| `*` | none | 404 (403 rendered by guards) | 0 |

Every operator route is lazy-loaded (`route.lazy`), so Leaflet, d3 and the IDW worker only load where used.

## Component tree (operator app)

```
AppProviders (QueryClient, Tooltip provider, Toast viewport, RealtimeProvider)
└─ RouterProvider
   ├─ /login → LoginPage
   ├─ /public/* → PublicLayout (pill top nav) → PublicHome | PublicMap
   └─ RequireAuth → AppShell
      ├─ NavRail (mark, 8 destinations, settings, sign out, alert dot)
      ├─ TopBar (h1, subtitle, org name, LiveIndicator, SearchField, bell, settings)
      └─ <Outlet/> → page → BentoGrid → cards (StatCard, BarChartCard, RadialGauge, …)
```

## State and data flow

- **REST → TanStack Query.** All server data goes through `lib/api/client.ts`, which parses every response with Zod (`lib/api/schemas.ts`) and throws a typed `ApiError` on 4xx/5xx. A 401 clears the session and redirects to `/login?next=…`.
- **WebSocket → batcher → Query cache.** `lib/realtime/client.ts` owns one connection, with backoff plus jitter and a heartbeat. Each message is Zod-parsed and pushed into a buffer. Every 1,000 ms the buffer runs through the pure reducer `applyEvents(state, events)`, which de-duplicates by `reading_id`, keeps the latest reading by `event_time` (not arrival order) and counts throughput. One `setQueryData(['live'])` call then publishes the result. Components never re-render per message.
- **Client state → Zustand.** Session (in memory only), connection status, selected metric, time range.
- **Quality.** `lib/quality` is the single source for quality labels and staleness (3 × the 10 s cadence). Every tile, chart, map cell and table row asks it.

## Folder structure

As specified in brief §4. `src/mocks/` holds the seeded simulator (`sim/`), the MSW REST handlers and the MSW WebSocket link.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 Foundation | Tooling, tokens, fonts, schemas, MSW, router + guards, AppShell, Storybook Foundations | done |
| 1 Primitives + live data | Primitives, LiveIndicator, WS client + batching, seeded simulator, quality rules | done; Tabs, Dialog, Drawer and Toast move to phase 4 with their first consumers |
| 2 Overview | StatCard, BarChart, RadialGauge, QualityBlocks, IDW mini-map, Overview page | done |
| 3 Map + analytics | HeatMap + worker, LineChart, Lollipop, ChartFrame, virtual tables | not started |
| 4 Alerts, health, devices | AlertRow, Drawer + timeline, health, devices + key flows | not started |
| 5 Public, reports, settings, simulator | — | not started |
| 6 Hardening | axe, keyboard, perf, docs | not started |

## Open questions and conflicts

- **Q1. Missing design files** (see “Inputs actually received”). Needed to verify component fidelity.
- **Q2. `bg-sunken` scrim at 60 %.** No token gives that alpha. Proposed: `bg-sunken/60` (Tailwind opacity modifier on a token, not a new colour). Logged in DECISIONS.
- **Q3. Eyebrow style vs the frontend-design guidance against all-caps labels.** The brand defines `eyebrow` as the only uppercase style, so the brief wins. It is used sparingly: card kicker lines only, never above every heading.
- **Q4. QualityBlocks deviation.** The chart stacks only non-valid readings; see DECISIONS. Needs design sign-off.
- **Q5. WebSocket auth** (API_GAPS #12) is undecided, and it blocks pointing the client at a real backend.

## TODO register

Every `TODO` in source must have a line here.

- `TODO(phase-3)`: placeholder pages for Map, Analytics. Replace with real pages.
- `TODO(phase-4)`: placeholder pages for Alerts, Health, Devices.
- `TODO(phase-5)`: placeholder pages for Reports, Settings, Simulator, Public map.
