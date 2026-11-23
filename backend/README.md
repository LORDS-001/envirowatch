# EnviroWatch backend

FastAPI + PostgreSQL + Redis. The API accepts readings into a bounded Redis stream; a separate ingestion worker validates and stores them. The alert engine, notification delivery, and isolated evaluation simulator also have separate workers. Starting the API alone does not start these workers.

## Local setup

Use Python 3.12, PostgreSQL 16, Redis 7, and the Node version in the root `.nvmrc`. Do not overwrite existing environment files or database volumes.

From the project root:

```sh
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
test -f backend/.env || cp backend/.env.example backend/.env
```

Edit `backend/.env` privately. Set matching PostgreSQL credentials in `POSTGRES_*` and `DATABASE_URL`, and a private, randomly generated `JWT_SECRET`. The example is not a usable production secret. `DATABASE_URL` and `REDIS_URL` must point to the intended local services; never point tests or demos at a production database.

```sh
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d db redis
cd backend
.venv/bin/alembic upgrade head
```

The Compose file preserves named volumes and binds database/Redis ports to loopback. Existing containers require recreation for changed port bindings to take effect. Never use `down -v` to update this project.

On an empty, development-only database, `cd backend && .venv/bin/python -m app.db.seed` creates the documented demo organization, sites, accounts, and threshold rule. Do not seed an existing or production database; the command refuses production mode.

## Run the real application

Run each backend command in its own terminal, from `backend/`:

```sh
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
.venv/bin/python -m app.workers.ingest_worker
.venv/bin/python -m app.workers.alert_worker
.venv/bin/python -m app.workers.simulation_worker
```

Run the optional notification worker only after delivery settings and recipients are approved:

```sh
.venv/bin/python -m app.workers.notification_worker
```

Leave `ALERTS_IN_API` unset when using the dedicated alert worker. The alert cycle uses a database advisory lock to avoid overlapping evaluation cycles. Ingestion workers default to distinct hostname/PID consumer names; if overriding `WORKER_NAME`, give each concurrent worker a distinct value. The ingest stream rejects new submissions with HTTP 503 when full; callers must retry with the same `reading_id`. Accepted pending messages are not trimmed to make space.

Ingestion workers retry Redis startup/reconnection failures, recover their unfinished deliveries and reclaim abandoned deliveries after 30 seconds idle. Reclaim scans retain their cursor rather than repeatedly scanning only the beginning of a large pending list. After database commit, a Redis script atomically acknowledges and removes only pending deliveries. A lost acknowledgement can replay a committed reading; the measurement primary key prevents duplicate measurement storage. This is not exactly-once processing: ingestion audit events can record a duplicate, and live PubSub updates remain best-effort. Redis persistence settings still determine what survives a broker/host failure.

In the root `.env`, use:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=/api/v1
VITE_WS_URL=ws://localhost:5173/api/v1/auth/ws
```

Then run `npm run dev` from the project root. Vite proxies `/api` to port 8000, including authenticated WebSockets. `ALLOWED_ORIGINS` must include the actual frontend origin. Use HTTPS/WSS and secure cookies outside local development. Access tokens stay in memory; refresh cookies are httpOnly. A refresh rotates its token, and logout revokes it.

## Invitations and notifications

Invitations store a hash of a purpose-specific token in `user_invitations`, expire after 24 hours, and can be accepted once at `/accept-invitation`. Settings shows pending invitations and lets an administrator issue a replacement; replacement invalidates the previous link. An existing account that completed setup cannot be re-enrolled through this endpoint.

`SMTP_HOST`, `SMTP_PORT`, `SMTP_STARTTLS`, optional `SMTP_USERNAME`/`SMTP_PASSWORD`, and `NOTIFICATION_FROM_EMAIL` configure email delivery. `FRONTEND_BASE_URL` determines the link placed in invitation emails. If SMTP is absent or fails, the administrator gets a one-time link to share securely; no temporary password is generated for sharing or written to logs. Do not paste invitation links into tickets or logs.

Alert email recipients are an explicit per-organization `NOTIFICATION_EMAIL_RECIPIENTS` JSON mapping from organization UUID to email-address list. No recipients are inferred from private accounts. Without transport and recipients, alerts record `not_configured`, not `delivered`. A successful SMTP submission means acceptance by the mail server, not proof of inbox delivery. SMS and webhook transports are not implemented and are reported as not configured.

Alert notification retries require migration `b4e527db0634`; apply `alembic upgrade head` during an approved maintenance window before starting the updated API/workers on an existing database. New pending notifications have persisted `attempt_count` and `next_attempt_at` values. Transient SMTP 4xx and connection failures retry after 30, 60, 120 and 240 seconds, with at most five committed delivery attempts. Retries remain `pending`; exhaustion becomes terminal `failed`. Existing `failed` records are not automatically resent. Permanent SMTP failures, missing configuration and partial-recipient acceptance are terminal, avoiding automatic resends to recipients already known to have accepted the message.

The worker locks each due record with `SKIP LOCKED` during sending, and each record uses a stable Message-ID across retries. This prevents concurrent workers from sending the same locked record, but SMTP and PostgreSQL cannot commit atomically: an ambiguous disconnect or a process/database failure after SMTP acceptance can still cause a duplicate delivery. A stable Message-ID is not a guarantee that a mail provider deduplicates. Partial acceptance requires operator investigation; there is no automated per-recipient retry. Invitation emails retain their existing synchronous delivery/manual-link fallback and are not part of this retry queue. Notification and simulation worker loops retry transient database connection failures rather than exiting.

## Request and production hardening

HTTP request bodies are capped before JSON parsing or device authentication. Ingestion accepts at most 65,536 wire bytes; other HTTP routes default to 1 MiB, configurable with `MAX_REQUEST_BODY_BYTES` (64 KiB–10 MiB). Both declared lengths and streamed chunks are checked, so omitting or understating Content-Length does not bypass the limit. The bounded body is buffered before routing; WebSockets bypass this HTTP middleware. Production CORS requires a nonempty list of explicit HTTPS origins without wildcards, credentials, paths, queries or fragments.

These application checks do not replace ingress body/time/rate/concurrency limits, login abuse protection or WebSocket connection limits. Configure those at the approved deployment boundary, including trusted proxy addresses and HTTPS/WSS. Approved local maintenance on 2026-11-23 subsequently applied migration `b4e527db0634` and recreated only PostgreSQL/Redis with their original images and data volumes to enforce loopback-only ports. No credentials, firewall or public reverse-proxy settings were changed.

For an approved deployment, supervise the API and each enabled worker as separate services with bounded restart backoff, a graceful shutdown interval and alerts on repeated restarts. Keep notification delivery disabled until SMTP and recipients are approved. Monitor authenticated `/api/v1/system/health`, queue depth, pending-delivery age, dead letters and worker logs; a reachable API alone does not establish worker readiness. Run an isolated restart/outage drill before release. No supervisor or scheduler has been installed or enabled; the hosting target and service owner still need to be selected.

Opt-in systemd units and a loopback-only Nginx staging example are in `backend/deploy/`; read `backend/deploy/README.md` before using them. Unit syntax and Nginx configuration parsing are verified, not installed-host behavior or public HTTPS readiness. Their initial connection/rate budgets must be validated against the chosen environment and representative traffic before release.

## Public publication

`PUBLIC_ORGANIZATION_IDS` is an explicit JSON allowlist of organizations approved for publication. Its default is empty, so anonymous endpoints disclose no private tenant data. All sites in an allowlisted organization are public; do not enable this for a mixed private/public organization without agreeing a finer-grained publication policy first.

Public summary, heatmap, and CSV use only valid, active-device readings from the preceding 30 seconds. A newer suspicious reading excludes that device rather than falling back to an older good value. Trend data covers up to 24 hours of valid readings. Public export is a latest-site summary, not a download of private raw sensor identities.

## Simulator

The UI creates a persistent, organization-owned run and a separate sandbox organization containing 12 sensors. A fixed seed determines fault scheduling. The worker feeds actual prepared readings through the ingestion service and observes ingestion outcomes and health events; it does not preassign successful detections. Pause/resume/stop survive API restarts. A missing worker is shown as stalled rather than fabricated progress.

Sandbox measurements and device-health evaluations are isolated from the operator's devices, public allowlists, and regular alert cycles. Run data currently remains in the database; sandbox/history cleanup and quotas are still required for sustained multi-user operation. Virtual time is accelerated, so this evaluates detector behavior, not HTTP throughput or production end-to-end latency. A network injection is a simulated loss of messages; a silence alarm demonstrates missing-data detection, not proof of the physical cause.

## Retention

Saving retention settings does not enable deletion. Before scheduling anything, take a backup and inspect a dry-run, from `backend/`:

```sh
.venv/bin/python -m app.workers.retention_worker --organization-id ORGANIZATION_UUID
```

Only an explicit `--apply` performs cleanup. Run it nightly through an approved scheduler after checking the policy and a restore test. It transactionally creates per-device hourly and daily summaries before deleting expired raw measurements, then expires summaries and ingestion events according to the tenant policy. Raw ≤ hourly ≤ daily is enforced. Cutoffs use complete UTC days.

Aggregates and reports combine raw data and retained summaries without double-counting. Means are weighted by observation counts; minimum, maximum and quality exclusion counts are preserved. Fine buckets and partial retained-hour/day windows return a clear 422 instead of inventing precision. Never run `--apply` against an organization until deletion is explicitly approved.

## Verification

Run frontend checks from the project root:

```sh
npm run check
npm run build
npm run e2e
npm run e2e:real
```

For an already installed Chrome, set `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/google-chrome`. Otherwise install Playwright's browser explicitly before running browser tests. Do not assume a cached Chromium version matches the installed Playwright package.

Backend tests use `TEST_DATABASE_URL` and create uniquely named temporary schemas. Fixtures roll back test changes and remove only their own schemas. Without this setting PostgreSQL integration tests are skipped, not passed. The queue-capacity test uses only its own Redis key and skips if Redis is unavailable.

```sh
backend/.venv/bin/python -m pytest backend/tests -q
backend/.venv/bin/python -m pip check
```

Set `TEST_DATABASE_URL` privately to the intended test PostgreSQL URL before pytest. The real-browser server uses the configured database and Redis, creates an isolated schema and stream namespace, and cleans them up on graceful shutdown. Test email delivery is disabled, and signing keys are test-only. Migration tests upgrade and downgrade only a temporary schema; they never downgrade the application's database.

The GitHub Actions workflow runs these checks with disposable PostgreSQL and Redis services. Its remote execution still needs verification after the changes are pushed by the owner.

## Production gate

Production is not approved by a passing build. Before deployment, configure a private signing key, private accounts, TLS, secure cookies, actual allowed origins, database credentials, explicit publication consent, delivery recipients, supervised workers, retention scheduling, backups/restores, request-size/rate limits, and monitoring. Production mode rejects the former example signing key and insecure cookie/origin settings. Existing historical measurements are not automatically reclassified by the new quality rules. See `docs/IMPLEMENTATION_STATUS.md` for remaining acceptance work.
