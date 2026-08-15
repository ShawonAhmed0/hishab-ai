-- =============================================================================
-- Runtime role privileges.
--
-- Migrations run as the project owner (`postgres`), which on Supabase carries
-- BYPASSRLS — and BYPASSRLS overrides FORCE ROW LEVEL SECURITY. Connecting the
-- application as that role would leave every policy in 01_security.sql inert
-- while still *looking* enabled in pg_class.
--
-- So the application connects as `hishabai_app`, which has no such attribute.
-- Create it with scripts/create-app-role.mjs; this file only grants, and does
-- nothing at all when the role is absent.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'hishabai_app') then
    raise notice 'hishabai_app role not present — skipping grants';
    return;
  end if;

  grant usage on schema public to hishabai_app;
  grant usage on schema app to hishabai_app;

  -- Table privileges only. No DDL, no ownership: the runtime role must not be
  -- able to disable a policy or drop a trigger.
  grant select, insert, update, delete on all tables in schema public to hishabai_app;
  grant usage, select on all sequences in schema public to hishabai_app;
  grant execute on all functions in schema app to hishabai_app;

  -- Future tables added by a later migration are covered without remembering.
  alter default privileges in schema public
    grant select, insert, update, delete on tables to hishabai_app;
  alter default privileges in schema public
    grant usage, select on sequences to hishabai_app;
  alter default privileges in schema app
    grant execute on functions to hishabai_app;
end $$;

-- Belt and braces: if someone ever grants this role BYPASSRLS by hand, the
-- next migration takes it straight back off.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hishabai_app' and rolbypassrls) then
    alter role hishabai_app nobypassrls;
    raise notice 'removed BYPASSRLS from hishabai_app';
  end if;
end $$;
