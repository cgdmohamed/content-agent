# Content Agent

Modern TypeScript rebuild of the legacy PHP Content Agent. The app manages AI-assisted Arabic/RTL content production, editorial review, image generation, Admin approval, and WordPress publishing from one operational dashboard.

## Architecture

- `apps/web`: React, Vite, TypeScript admin UI with RTL-first layout.
- `apps/api`: NestJS API shell for auth, sites, content, jobs, reports, and health endpoints.
- `apps/worker`: BullMQ worker entry for long-running AI, image, GSC, and WordPress jobs.
- `packages/shared`: workflow state machine, scoring, Arabic duplicate detection, schemas, provider fallback contracts.
- `packages/config`: environment validation.
- `packages/types`: cross-app entity types.

## Development

1. Copy `.env.example` to `.env` and fill local values.
2. Use Node.js 22, then run `pnpm install`.
3. Start PostgreSQL and Redis with `docker compose up postgres redis`.
4. Start the API with `pnpm --filter @content-agent/api dev`.
5. Start the web app with `pnpm --filter @content-agent/web dev`.

The API runs PostgreSQL migrations automatically on startup. If `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are set, the first Admin is created only when the `users` table is empty.
Startup migrations run under a PostgreSQL advisory transaction lock, so multiple API instances do not race each other while applying the same migration set.
Database migrations include operational indexes for dashboard summaries, content timelines, job monitoring, audit review, AI usage reporting, scheduling, and WordPress post idempotency lookups.

External integrations are explicit: missing WordPress, GSC, or provider keys show as not configured; no fake connection status is generated. Text AI jobs require at least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `PERPLEXITY_API_KEY`.

## Bootstrap Admin

Fresh installs use the bootstrap environment variables:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Bootstrap automatically does nothing after the first user exists. User and bootstrap passwords must be at least 12 characters and include a letter, a number, and a special symbol.

## Authentication And Roles

The API uses an HTTP-only `content_agent_session` cookie. All API routes require a valid session except:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/health/live`
- `GET /api/health/ready`

The web app checks `GET /api/auth/me` on load and shows an Arabic login screen when no session exists. Logout clears the HTTP-only session cookie.
The navigation hides Admin-only screens for Editors, while backend guards remain the source of truth for authorization.
Malformed, tampered, expired, or structurally incomplete session cookies are treated as unauthenticated requests rather than internal server errors.
Every API response includes an `x-request-id` header. If the client sends a safe `x-request-id`, the API echoes it; otherwise the API generates a new UUID. Error responses also include `requestId`, so an operator can match a browser-visible failure to API logs without exposing stack traces to the user.
In production, unexpected API exceptions return the Arabic message `حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.` with the request id. Expected validation, authorization, and workflow errors keep their Arabic business message and any safe structured details needed by the UI.
DTO validation errors are normalized into Arabic messages before reaching the web app, including unknown-field, type, range, length, date, URL, and enum validation failures.
The API sets explicit request body limits (`2mb` JSON and `128kb` form bodies) and DTO-level length limits for large user-controlled fields such as article HTML, bulk topics, site writing standards, and GSC service-account JSON. Oversized inputs fail validation before they reach database or worker logic.

Role rules currently enforced server-side:

- `ADMIN`: manage users, create/edit/test sites, view jobs/reports, approve content, publish content.
- `EDITOR`: create content, generate ideas, research, write, review, edit article content, generate or skip images.

Frontend checks are only convenience; backend guards are the source of truth.
Unsafe authenticated writes also verify the request origin against `PUBLIC_WEB_URL`, which protects cookie-based sessions from cross-site write attempts.
Generated and manually edited article HTML is sanitized with an allowlist before storage or WordPress publishing. Executable tags, event handlers, iframes, protocol-relative URLs, and `javascript:` links are stripped.
Admin user management supports creating users, changing roles, activating/disabling accounts, and resetting passwords. The API prevents disabling or demoting the last active Admin account.
User emails are enforced as case-insensitively unique at the PostgreSQL index level, and create-user races return a clear conflict response instead of a generic server error.

## Audit Trail

Sensitive API actions write to `audit_logs` with the acting user when available. This includes content creation, idea selection, article updates, approvals, safe deletion of unpublished content, job enqueue/retry, site changes and tests, user creation, and settings updates. The Operations screen exposes the latest audit events for Admin review.
Audit metadata is sanitized before storage and again before article activity responses: password, secret, token, key, credential, cookie, authorization, and raw JSON-like fields are redacted, while oversized strings and arrays are shortened.
Each article detail response also includes a content activity timeline assembled from `audit_logs`, `job_runs`, and `api_usage_logs`, so the Article Workspace can show user actions, worker execution, provider usage, costs, and errors in one place.
The dashboard, content library, article workspace, and operations screen refresh automatically at short intervals while operators are watching the pipeline, so accepted jobs and worker results appear without a manual browser refresh.
The Content Library applies search, site, state, mode, score, date, and needs-attention filters on the API side with a bounded result set, so operators can search beyond the latest records without loading the full content table into the browser.
Dashboard site cards, the Sites screen, and Admin user listings are bounded to keep recurring refreshes predictable as installations grow.
Content workflow actions that advance publication state, such as selecting ideas, skipping images, approval, scheduling, job enqueue, retry, duplication, publishing, and integration tests, are blocked for disabled sites.

## Settings

Admin settings are stored in `system_settings` under `production_settings`. Provider API keys stay in environment variables; the dashboard only exposes configured/not-configured indicators, model names, and a masked key tail for operational verification.
Content creation reads `defaultIdeasCount` from the saved settings when the request does not provide a value, and both API and worker clamp idea batches to the production limit of 1-20 ideas. Editors can read only the safe content defaults needed by the creation form; full settings remain Admin-only.
Bulk creation is available from the Content Library. It creates a durable `content_batches` record, validates duplicate topics before insertion, calculates scheduled publish times from the start date/time and interval, and creates real `BULK` content items. When automatic start is enabled, each accepted item gets its first BullMQ idea-generation job.
For `BULK`/`AUTO_PILOT` items with automatic continuation enabled, the worker auto-selects the first valid idea and chains research, draft, review, and featured-image jobs. It stops at `IMAGE_READY`; Admin approval is still required before scheduling or publishing.
The `autoPublishAfterApproval` setting is applied server-side during Admin approval; when enabled, approval immediately queues the WordPress publish job.
Admins can also schedule approved articles from the Article Workspace. Scheduling requires a future date, stores `scheduled_publish_at`, moves the item to `SCHEDULED`, and queues the WordPress publish job so WordPress receives a real scheduled post instead of a local-only date.

## Legacy Migration

The legacy PHP/MySQL project remains read-only. Use the importer after the API has started once and applied PostgreSQL migrations:

```bash
pnpm legacy:migrate
```

The default mode is a dry run and commits nothing. To apply the import:

```bash
pnpm legacy:migrate -- --apply
```

Required variables:

- `DATABASE_URL`
- `ENCRYPTION_KEY_BASE64`
- `LEGACY_MYSQL_URL`, or `LEGACY_MYSQL_HOST`, `LEGACY_MYSQL_USER`, `LEGACY_MYSQL_PASSWORD`, and `LEGACY_MYSQL_DATABASE`
- `LEGACY_ENCRYPTION_KEY_BASE64` when importing encrypted legacy WordPress or GSC credentials

The importer maps `users`, `sites`, `content_items`, and `api_usage_log`, encrypts site secrets with the new AES-GCM envelope, stores an idempotent `legacy_migration_map`, preserves failed workflow context with `last_successful_state` and `failed_action`, and records a `LEGACY_CONTENT_IMPORTED` audit event for each content item.

Never copy hardcoded legacy secrets into source code.

## WordPress Setup

Use WordPress Application Passwords for REST authentication. Rank Math metadata requires the bridge snippet from `wordpress-snippets/rankmath-rest-bridge.php`; the Sites page exposes a bridge test so Admins can distinguish `Connected`, `Bridge Missing`, and `Permission Error`.
Admins can edit site settings after creation. WordPress application passwords and GSC service-account JSON are never returned to the frontend; leaving those edit fields blank keeps the existing encrypted secret, while entering a new value replaces it.

## Production

Target Ubuntu 24.04 with Docker Compose:

- `postgres` with persistent volume
- `redis` for BullMQ coordination
- `api` for REST and health endpoints
- `worker` for AI/publishing queues
- `web` for the React bundle behind Nginx or Cloudflare

The API and worker images run as the non-root `node` user and copy only runtime package metadata plus compiled `dist` output into the final image.
The API trusts the production reverse proxy for forwarded protocol/client metadata, enables Nest shutdown hooks, and the worker closes BullMQ workers, Redis, and PostgreSQL on `SIGTERM`/`SIGINT` for safer container stops.
The web container serves the React bundle through Nginx with conservative security headers, immutable asset caching, gzip compression, and a `/healthz` endpoint used by Docker Compose.

Back up PostgreSQL regularly. Redis is operational infrastructure and is never the source of truth for content records.

### Production Environment

Use the same `.env` file for Compose, the API, worker, and web build. Important production rules:

- `NODE_ENV=production`
- `PUBLIC_WEB_URL` must be the final HTTPS dashboard origin.
- `VITE_API_URL` should normally be `/api` when the React bundle and API share the same production origin through the reverse proxy.
- `DATABASE_URL` must point at the production PostgreSQL service and include the same password as `POSTGRES_PASSWORD`.
- `REDIS_URL` must point at the production Redis service.
- `SESSION_SECRET` must be at least 32 random characters and must not be a placeholder.
- `ENCRYPTION_KEY_BASE64` must decode to exactly 32 bytes. Losing or changing it makes stored encrypted site secrets unreadable.
- `BOOTSTRAP_ADMIN_PASSWORD`, when set, must satisfy the strong password policy and must not remain a placeholder.
- The dashboard is Arabic-only; site `language` input is accepted as `ar` only.

### Production Run

1. Create `.env` from `.env.production.example` for production, or `.env.example` for local development.
2. Set strong values for `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `ENCRYPTION_KEY_BASE64`.
   You can generate safe starter values with:
   ```bash
   pnpm secrets:generate
   ```
3. Set `DATABASE_URL` to match the production Postgres service:
   `postgresql://content_agent:${POSTGRES_PASSWORD}@postgres:5432/content_agent`
4. Set `REDIS_URL=redis://redis:6379`.
5. Make sure `ENCRYPTION_KEY_BASE64` decodes to exactly 32 bytes; API and worker startup validate the environment and fail fast with a readable error when required values are missing or unsafe.
6. Run the preflight check before deployment:

```bash
pnpm preflight -- --content-env-file=.env
```

In production, preflight also rejects insecure web origins, localhost database/Redis URLs, missing or weak `POSTGRES_PASSWORD`, and a `DATABASE_URL` that does not match the configured database password.

7. Run the full verification gate:

```bash
pnpm verify
```

The test suite covers shared workflow logic, environment validation, API security and workflow rules, worker budget/secrets behavior, web Arabic label fallbacks, and production preflight rules.

8. Build and run:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Health endpoints:

- `GET /api/health/live`
- `GET /api/health/ready` verifies both PostgreSQL and Redis. It returns HTTP 200 when ready and HTTP 503 when degraded.
- `GET /healthz` verifies the web container is serving traffic.

### Deploying with Coolify

Use `docker-compose.yml` as the Coolify Docker Compose file. The only public service is `web` on internal port `80`; Coolify should route the public domain to that service. The `web` container proxies `/api` requests to `api:3000` over the internal Docker network. PostgreSQL and Redis are internal only and have no host port bindings.

Required Coolify environment variables:

- `POSTGRES_PASSWORD`
- `PUBLIC_WEB_URL`
- `SESSION_SECRET`
- `ENCRYPTION_KEY_BASE64`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Optional Coolify environment variables:

- `VITE_API_URL` defaults to `/api`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `PERPLEXITY_API_KEY`
- `GEMINI_API_KEY`
- `OPENAI_MODEL` defaults to `gpt-4o-mini`
- `ANTHROPIC_MODEL` defaults to `claude-3-5-sonnet-latest`
- `PERPLEXITY_MODEL` defaults to `sonar-pro`
- `GEMINI_IMAGE_MODEL` defaults to `gemini-3.1-flash-image`
- `MONTHLY_AI_BUDGET_USD` defaults to `30`
- `MONTHLY_AI_HARD_LIMIT_USD` defaults to `40`
- `WORKER_CONCURRENCY` defaults to `2`

First deployment procedure:

1. Create a new Coolify project from the GitHub repository.
2. Select Docker Compose and use `docker-compose.yml`.
3. Set the public service to `web` and the public internal port to `80`.
4. Add the required environment variables in Coolify. `PUBLIC_WEB_URL` must be the final HTTPS dashboard URL. `POSTGRES_PASSWORD` should use URL-safe characters because Compose embeds it in the internal PostgreSQL URL. `DATABASE_URL` and `REDIS_URL` are created by `docker-compose.yml` from the internal service names.
5. Deploy. The `api` service waits for healthy PostgreSQL and Redis, runs non-destructive SQL migrations on startup under a PostgreSQL advisory lock, and uses `/api/health/live` for the container healthcheck.
6. The `web` and `worker` services start after the API container starts, while `/api/health/ready` remains the manual readiness check for PostgreSQL and Redis connectivity.
7. Keep the same `ENCRYPTION_KEY_BASE64` forever unless you intentionally build a re-encryption process for stored WordPress/GSC secrets.

For a short launch checklist, see `PRODUCTION_CHECKLIST.md`.

### Operations Runbook

- Use the Operations page for failed, waiting, delayed, completed, and cancelled jobs. Failed content jobs can be retried; waiting or delayed jobs can be cancelled before execution.
- Use the `x-request-id` value from a failing browser request or API error response to find the matching API log entry.
- Use `GET /api/health/ready` before and after deployments. A degraded response means PostgreSQL or Redis is unavailable from the API container.
- Keep PostgreSQL backups before migrations, before legacy imports, and before major deployments.
- Run `pnpm legacy:migrate` first as a dry run when importing old PHP/MySQL data; use `-- --apply` only after reviewing the output.
- Do not rotate `ENCRYPTION_KEY_BASE64` unless you have implemented and tested a re-encryption procedure for all stored secrets.

### Current Integration Status

The production foundation is wired for real persistence, auth, dashboard data, BullMQ dispatch, and Docker deployment.

Implemented worker processors:

- `GENERATE_IDEAS`
- `RESEARCH_GAPS`
- `WRITE_DRAFT`
- `REVIEW_DRAFT`
- `GENERATE_IMAGE` with Gemini image generation and WordPress media upload
- `PUBLISH` for idempotent WordPress create/update using `wordpress_post_id`
- `SYNC_GSC` for Search Console query snapshots

Text generation supports fallback across configured Anthropic, OpenAI, and Perplexity keys and records usage in `api_usage_logs`.
The worker checks the monthly hard AI budget before provider calls and stops text generation once the configured limit is reached. Set `MONTHLY_AI_HARD_LIMIT_USD=0` only when you intentionally want to disable the hard stop.
WordPress publishing creates categories/tags when needed and sends Rank Math metadata through the post `meta` payload when the bridge allows those fields.
Google Search Console supports service-account connection testing, queued synchronization, query snapshot storage, dashboard opportunity discovery, and site report opportunities.
Failed content jobs can be retried from the Operations screen; retry creates a new BullMQ job and preserves the previous failed run for audit history. Waiting or delayed jobs can be cancelled before execution; the BullMQ job is removed, the persisted run is marked `CANCELLED`, and an audit event is recorded. Finished jobs record the actual provider used plus start/end times and duration, so operations reporting can trace execution without digging into raw logs.
The Operations API fetches each job status group with its own bounded query, so recent completed jobs cannot hide active, waiting, delayed, failed, or cancelled work from the dashboard.

### Verification

Useful local checks:

```bash
pnpm verify
```
