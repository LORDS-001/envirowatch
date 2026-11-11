# EnviroWatch web

Operator dashboard and public portal for EnviroWatch, a simulation-first environmental monitoring platform (SIWES I, Round 2, Project 4). Every reading is shown with how far it can be trusted: stale, suspicious, estimated and quarantined data are marked wherever they appear.

## Run it

Requires Node 22+.

```sh
npm install
npm run dev          # http://localhost:5173
```

Mock mode is on by default. A seeded simulator streams 1,000 devices across 46 Lagos sites over a mock WebSocket (about 100 messages/s), with duplicates, late readings, a silent sensor, a drifting sensor, a spiking sensor and a wrong clock injected. Sign in as:

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@envirowatch.test` | `envirowatch-demo` |
| Operator | `operator@envirowatch.test` | `envirowatch-demo` |

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Dev server with mocks |
| `npm run build` | Typecheck and production build |
| `npm run check` | Typecheck, lint and unit tests |
| `npm test` | Unit and component tests (Vitest) |
| `npm run e2e` | End-to-end and accessibility tests (Playwright + axe), including keyboard-only journeys; starts its own server on port 5174. `RECORD=1` saves videos of the keyboard walkthroughs |

## Environment

Copy `.env.example` to `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_USE_MOCKS` | `true` | `false` talks to the real backend |
| `VITE_API_BASE_URL` | `/api/v1` | REST base URL |
| `VITE_WS_URL` | same host, `/ws` | Live events |
| `VITE_SIM_SEED` | `4242` | Simulator seed: same seed, same data |
| `VITE_DISPLAY_TZ` | `Africa/Lagos` | Display time zone (UTC on hover) |

## How it fits together

```
WebSocket ──► RealtimeClient ──(Zod)──► buffer ──(every 1 s)──► reducer ──► Query cache ["live"]
                                                  de-dup by reading_id, order by event_time
REST ──► api client ──(Zod)──► TanStack Query ──► pages
                                      │
           lib/quality (trust rules) ─┼─ lib/idw (worker) ─ lib/format (units, WAT/UTC)
```

- `design/`: tokens, Tailwind theme, principles and brand book (source of truth).
- `src/lib/`: API client and schemas, realtime, quality rules, IDW, formatting.
- `src/components/`: `ui` primitives, `charts`, `map`, `layout`, `domain`.
- `src/features/`: one folder per page.
- `src/mocks/`: MSW handlers, mock WebSocket and the seeded simulator.
- `docs/`: plan, decisions, API gaps and changelog.

## Status

All screens are built against the mocked contract: Overview, Map, Analytics, Alerts, Health, Devices, Reports, Settings, Simulator and the public portal. Phase 6 (hardening: phone layouts, keyboard-only journeys, Lighthouse, Storybook) is done; what's open is in `docs/FRONTEND_PLAN.md`, and the history in `docs/CHANGELOG.md`.
