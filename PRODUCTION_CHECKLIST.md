# Production Checklist

## Before Deployment

- Use Node.js 22.
- Create `.env` from `.env.production.example`.
- Run `pnpm secrets:generate` and replace all placeholder secrets.
- Set the final HTTPS value for `PUBLIC_WEB_URL`.
- Set real provider keys only for providers you will use.
- Confirm `DATABASE_URL` uses the same password as `POSTGRES_PASSWORD`.

## Verification

```bash
pnpm preflight -- --content-env-file=.env
pnpm verify
```

## After Deployment

- Open `/api/health/ready` and confirm the response is ready.
- Open `/healthz` and confirm the web container responds.
- Log in with the bootstrap Admin, then rotate the bootstrap password from the Users screen.
- Add one WordPress site and run WordPress, Rank Math, and GSC tests.
- Create one test article and move it through the workflow before enabling automatic publishing.
- Backups: generate an age key (`age-keygen`), set `BACKUP_AGE_RECIPIENT` (public key only) and keep the private key offline.
- Backups: configure off-site storage (`BACKUP_S3_*`, write-only credentials) and a monitor URL (`BACKUP_PING_URL`).
- Store `ENCRYPTION_KEY_BASE64` separately from the backups (backups cannot be used without it).
- Confirm `docker compose ps` shows the `backup` service healthy, then perform one real restore into a new database (README -> Backups).
- Optional: set `SENTRY_DSN` and `METRICS_TOKEN` (see README → Monitoring) and add the suggested alerts.
- Confirm the worker container is healthy (`docker compose ps`) and `/api/health/ready` shows `checks.worker`.
