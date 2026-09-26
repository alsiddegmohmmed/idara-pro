-- Local dev only — throwaway password, matches APP_DATABASE_URL in apps/api/.env.example.
-- Least-privilege role the app connects as (docs/adr/0004-rls-deferred.md point 3):
-- migrations run as the POSTGRES_USER owner role; the app never does.
CREATE ROLE idara_app WITH LOGIN PASSWORD 'idara_app';
GRANT USAGE ON SCHEMA public TO idara_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO idara_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO idara_app;

-- Tables created by future migrations (run as the owner role) are automatically
-- usable by idara_app without re-granting each time.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO idara_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO idara_app;
