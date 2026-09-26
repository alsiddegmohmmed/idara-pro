# infra

## Dev

`docker-compose.dev.yml` — postgres, redis, minio for local dev:
`docker compose -f infra/docker-compose.dev.yml up -d`.

## Prod

`docker-compose.prod.yml` builds and runs `caddy` (bundles the built `apps/web`
static files — see `Dockerfile.caddy` and `Caddyfile`), `api` (`Dockerfile.api`),
`postgres`, `redis`, `minio`. No `worker` service yet — no BullMQ background job
exists to run.

Create `infra/.env` (gitignored, never commit it) with:

```
POSTGRES_USER=idara
POSTGRES_PASSWORD=<real secret>
POSTGRES_DB=idara_prod
IDARA_APP_PASSWORD=<real secret, different from POSTGRES_PASSWORD>
MINIO_ROOT_USER=idara
MINIO_ROOT_PASSWORD=<real secret>
JWT_ACCESS_SECRET=<32+ char random string>
JWT_REFRESH_SECRET=<different 32+ char random string>
DOMAIN=your-real-domain.example
```

Then: `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build`,
`docker compose -f infra/docker-compose.prod.yml exec api npx prisma migrate deploy`.
Caddy gets HTTPS automatically once `DOMAIN` resolves to the server.

**Verified so far:** Caddyfile syntax (`caddy validate`), the `idara_app`
role-creation script, `docker compose config` resolution of both compose
files, the api image builds and — before a `binaryTargets` fix for Prisma's
query engine on Alpine (`linux-musl-openssl-3.0.x`; see `apps/api/prisma/schema.prisma`) —
ran against real Postgres. The rebuilt image with that fix was not re-verified:
the rebuild was killed by a host memory constraint in this environment, not a
build failure. Rerun `docker build -f infra/Dockerfile.api -t idara-api-test .`
from the repo root and smoke-test it before relying on this for a real deploy.

Backup scripts (nightly `pg_dump` + MinIO mirror) not written yet.
