# infra

## Dev

`docker-compose.dev.yml` — postgres and redis for local dev:
`docker compose -f infra/docker-compose.dev.yml up -d`.

## Prod

`docker-compose.prod.yml` builds and runs `caddy` (bundles the built `apps/web`
static files — see `Dockerfile.caddy` and `Caddyfile`), `api` (`Dockerfile.api`),
`worker` (same image as `api`, `dist/worker.js` instead — ADR-0006, the document
expiry-check job), `postgres`, `redis`. Uploaded files live in the `idara_files`
volume mounted into `api` (ADR-0005).

Create `infra/.env` (gitignored, never commit it) with:

```
POSTGRES_USER=idara
POSTGRES_PASSWORD=<real secret>
POSTGRES_DB=idara_prod
IDARA_APP_PASSWORD=<real secret, different from POSTGRES_PASSWORD>
JWT_ACCESS_SECRET=<32+ char random string>
JWT_REFRESH_SECRET=<different 32+ char random string>
DOMAIN=your-real-domain.example
SMTP_HOST=<your SMTP server>
SMTP_PORT=587
SMTP_USER=<smtp username>
SMTP_PASS=<smtp password>
SMTP_FROM=Idara Pro <noreply@your-real-domain.example>
```

`TRUST_PROXY` (private Docker ranges, so the real client IP is read from Caddy's `X-Forwarded-For`
for rate limiting) is set in the compose file — the API port is never published, so only Caddy can
reach it. `WEB_APP_URL` is derived (`https://$DOMAIN`) and used for the links inside emails. Dev mail
is caught by Mailpit (`docker-compose.dev.yml` only, UI at http://localhost:8025) — it is
never part of the prod compose.

Then: `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build`,
`docker compose -f infra/docker-compose.prod.yml exec api npx prisma migrate deploy`.
Caddy gets HTTPS automatically once `DOMAIN` resolves to the server.

**Verified end to end:** Caddyfile syntax (`caddy validate`), the `idara_app`
role-creation script, `docker compose config` resolution of both compose
files, and the api image — built via `Dockerfile.api`, run against a real
Postgres, migrated, and exercised over real HTTP (`/health`, `/ready`,
`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, all 200s with a real
Argon2id-hashed user). Getting there took two real Prisma+Alpine bugs, both
fixed in this repo, not worked around: the query engine needs
`binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` in
`apps/api/prisma/schema.prisma` (Alpine ships OpenSSL 3, not the 1.1 Prisma
defaults to), and `Dockerfile.api` needs `apk add --no-cache openssl` — Alpine
ships `libssl.so.3` but not the `openssl` CLI, and without it Prisma's own
version detection fails and silently loads the wrong engine binary regardless
of `binaryTargets`.

Not yet run against a real domain/server, so "Caddy gets HTTPS automatically"
is unverified in practice (it's Caddy's documented behavior, not something
special to this config).

Backup scripts (nightly `pg_dump` + copy of the `idara_files` volume, off-server) not written yet.
