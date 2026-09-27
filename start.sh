#!/usr/bin/env bash
# Run Idara Pro on this laptop with ONE command:   bash start.sh
# Stop it with Ctrl+C. Safe to run again any time.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n▶ %s\n' "$1"; }

say "1/6 Docker"
if ! docker info >/dev/null 2>&1; then
  echo "  Starting Docker Desktop (can take up to a minute)..."
  open -a Docker || true
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  docker info >/dev/null 2>&1 || { echo "✗ Docker did not start. Open Docker Desktop, wait for it, then run: bash start.sh"; exit 1; }
fi
echo "  Docker is running."

say "2/6 Settings (apps/api/.env)"
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
[ -z "$(tail -c1 apps/api/.env)" ] || echo >> apps/api/.env
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Z_]+= ]] || continue
  key="${line%%=*}"
  grep -q "^${key}=" apps/api/.env || { echo "$line" >> apps/api/.env; echo "  added missing setting: $key"; }
done < apps/api/.env.example
echo "  Settings OK."

say "3/6 Database (Postgres + Redis)"
docker compose -f infra/docker-compose.dev.yml up -d
for _ in $(seq 1 60); do
  docker compose -f infra/docker-compose.dev.yml exec -T postgres pg_isready -U idara -d idara_dev >/dev/null 2>&1 && break
  sleep 1
done
echo "  Database is ready."

say "4/6 Packages"
command -v pnpm >/dev/null 2>&1 || corepack enable
pnpm install --frozen-lockfile

say "5/6 Database tables + admin user"
pnpm --filter @idara-pro/api exec prisma migrate deploy
pnpm --filter @idara-pro/api db:seed

say "6/6 Starting the app"
# Stop copies of the app left running from an earlier session (ports 3000 = API, 5173 = web).
for port in 3000 5173; do
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "$pids" ] || { echo "  stopping old process on port $port"; kill $pids 2>/dev/null || true; }
done
sleep 1

cat <<'MSG'

  ┌──────────────────────────────────────────────────────┐
  │  Idara Pro is starting...                            │
  │  Open:      http://localhost:5173   (use Chrome)     │
  │  Email:     admin@idara.local                        │
  │  Password:  Admin@12345                              │
  │  Stop:      press Ctrl+C in this window              │
  └──────────────────────────────────────────────────────┘

MSG

# Open Chrome once the web app has had time to start.
( sleep 15; open -a "Google Chrome" http://localhost:5173 2>/dev/null || open http://localhost:5173 ) &

exec pnpm dev
