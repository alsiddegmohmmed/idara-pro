# infra

Docker Compose files (dev + prod), Caddyfile, backup scripts.

`docker-compose.dev.yml` — postgres, redis, minio for local dev:
`docker compose -f infra/docker-compose.dev.yml up -d`.
Prod compose + Caddyfile + backups: not created yet.
