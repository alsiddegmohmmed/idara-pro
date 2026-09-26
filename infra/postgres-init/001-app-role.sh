#!/bin/sh
# Least-privilege role the app connects as (docs/adr/0004-rls-deferred.md
# point 3): migrations run as $POSTGRES_USER (the owner role); the app never
# does. IDARA_APP_PASSWORD must be set on the postgres service's own
# environment (dev: a fixed throwaway value; prod: a real secret) — a .sql
# file here couldn't read it, hence the shell script.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE idara_app WITH LOGIN PASSWORD '${IDARA_APP_PASSWORD}';
  GRANT USAGE ON SCHEMA public TO idara_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO idara_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO idara_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO idara_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO idara_app;
EOSQL
