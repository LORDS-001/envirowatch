# EnviroWatch frontend plan

Status: Phases 0–6 done (2026-11-11). Open: the backend contract (Q5, API_GAPS) and the Lighthouse performance follow-up below. This plan follows `CLAUDE_CODE_PROMPT.md`; where the two differ, the brief wins and the difference is logged in `DECISIONS.md`.

## Inputs actually received

The kickoff brief was pasted inline and was truncated at 50,000 characters. Received in full: the brief (§0–17), `design/tokens.css`, `design/tailwind-theme.css`, `design/principles.md`, all logo SVGs, and the six template images. Received in part: `design/brand-book.md` (stops inside “Colour”). **Not received:** `design/templates-map.md`, `design/components/*.md` (including `OverviewScreen.md`), `design/reference/component-reference.css`, `design/tokens.json`, and the Overview target screenshot.

Consequence: components are built from the brief’s §6 specs, which give anatomy, sizes, radii and states for every component. The product owner confirmed the other files don’t exist, so §6 is the spec (Q1, closed).

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
| 3 Map + analytics | HeatMap + worker, LineChart, virtual tables, Map and Analytics pages | done (LollipopChart not needed by any page yet) |
| 4 Alerts, health, devices | AlertRow, Drawer + timeline, health, devices + key flows | done |
| 5 Public, reports, settings, simulator | Public portal and map, Reports, Settings, Simulator | done |
| 6 Hardening | Keyboard-only passes, public bundle under 200 KB, tables as cards below 640 px, Lighthouse, Storybook | done; Lighthouse performance follow-up open |

## Open questions and conflicts

- **Q1. Missing design files.** Closed 2026-11-11: they don’t exist; the brief’s §6 is the spec.
- **Q2. `bg-sunken` scrim at 60 %.** No token gives that alpha. Uses `bg-sunken/60` (Tailwind opacity modifier on a token, not a new colour). Logged in DECISIONS.
- **Q3. Eyebrow style vs the frontend-design guidance against all-caps labels.** The brand defines `eyebrow` as the only uppercase style, so the brief wins. It is used sparingly: card kicker lines only, never above every heading.
- **Q4. QualityBlocks deviation.** Closed 2026-11-11: approved; see DECISIONS.
- **Q5. WebSocket auth** (API_GAPS #12) is undecided, and it blocks pointing the client at a real backend.

## TODO register

Every `TODO` in source must have a line here. None are open.

## Phase 6 (done 2026-11-11)

- Public portal initial JS, excluding the mock backend: about 112 KB gzipped, under the 200 KB budget.
- Tables become cards below 640 px (DataTable). No page scrolls sideways at 375 px.
- Keyboard-only walkthrough of journeys 1 and 2: `e2e/keyboard.spec.ts`, which also checks every stop shows a focus ring. `RECORD=1` saves videos.
- Lighthouse on the public portal (mobile, simulated mid-range, production build): accessibility 100, best practices 100, SEO 100, performance 42 (was 20). Fixed: layout shift 0.477 → 0.026, and a missing `robots.txt`. Performance: see the follow-up below.
- Storybook stories for every phase 3–5 component: Forms, Overlays, Charts, Domain and maps.

## Follow-up

- **Lighthouse performance on `/public`.** Total blocking time is 2.55 s and LCP 5.3 s, measured with the mock backend running in the page. The mock alone is about 2.1 s of main-thread script on a throttled phone; the app's main chunk is about 1.4 s. Re-measure against the real API before acting. If blocking time is still high, give the public portal its own lean entry, so it doesn't parse the operator app's shared chunk.
