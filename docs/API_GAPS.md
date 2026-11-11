# API gaps

Things the UI needs that the PRD contract (§8–9) doesn’t define. Each is mocked in `src/mocks/handlers.ts` with the shape below and marked `GAP` in `src/lib/api/schemas.ts`. Backend: please confirm or counter-propose.

| # | Need | Proposed shape | Used by |
|---|---|---|---|
| 1 | Login response body | `POST /auth/login` → `{ access_token, user: {id, organization_id, email, role}, organization: {id, name} }` | Session, top bar org name |
| 2 | Session restore without storing tokens | `POST /auth/refresh` (httpOnly refresh cookie) → same as login; `401` if none. `POST /auth/logout` clears it (`204`). | Reload keeps you signed in |
| 3 | Sites list | `GET /sites` → `{ items: Site[], next_cursor }` | Map projection, site names |
| 4 | Device supported metrics (FR-001) | `Device.metrics: MetricId[]` | Devices table, live means |
| 5 | Pagination envelope | Every list: `{ items: T[], next_cursor: string \| null }`, request `?cursor=&limit=` | All lists |
| 6 | City-wide aggregates | `GET /measurements/aggregates?metric&from&to&bucket=1h\|1d&group_by=all\|device` → rows with `device_id: null` when `group_by=all` | Overview hourly bars |
| 7 | Heatmap response | `GET /heatmap?metric` → `{ metric, unit, generated_at, samples: [{site_id, latitude, longitude, value, quality_status, event_time, received_at, device_count}] }`. IDW input, not a grid: the client interpolates, so map, legend and export share one implementation. | Mini-map, map page |
| 8 | Quality reason | `Measurement.quality_reason: string \| null`, e.g. `"spike +340 %"`, `"clock error"` | Quality flags everywhere |
| 9 | Alert kind and context | `Alert.kind: "environment" \| "device"`, `title`, `site_id`, `device_id`, `value`, `activated_at`, `corroborating_devices`, embedded `notifications: NotificationAttempt[]` | Alert rows, timeline |
| 10 | Valid-reading rate | `SystemHealth.valid_rate_24h: number` (0–1) | Overview stat, health page |
| 11 | Daily quality breakdown | `GET /measurements/quality-summary?days=7` → `{ days: [{date, valid, estimated, suspicious, missing}] }` (counts) | QualityBlocks |
| 12 | WebSocket envelope and auth | Messages `{ type, data }`. Types: `measurement.updated` (`data: Measurement[]`, one logical reading), `device.status_changed`, `alert.created`, `alert.resolved`, `sensor.fault_detected`, `heartbeat` every 5 s. Auth: proposed `?token=` on connect or a first `{type:"auth"}` frame. **Undecided.** | Realtime client |
| 13 | Public portal data | `/public/summary` → `{ generated_at, areas: [{site_id, name, latitude, longitude, readings: [{metric, value, event_time, quality_status}]}] }`. Still needed: `/public/trend?metric&hours=24`, `/public/export.csv` | Public portal (phase 5) |
| 14 | Admin resources | users, sites (write), alert rules, retention, simulator control: shapes to propose in phase 5 | Settings, Simulator |
| 15 | Tenant isolation signal | Cross-tenant requests return `403 { detail }` (mock: `GET /devices?organization_id=org-ibadan`) | Tenant e2e |
