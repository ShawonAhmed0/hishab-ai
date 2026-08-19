-- =============================================================================
-- Company isolation, enforced by the database.
--
-- The application always scopes its queries by company_id. This file exists so
-- that when it one day forgets to, the answer is zero rows instead of another
-- business's ledger. Both locks, not one.
-- =============================================================================

create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Session identity
--
-- Set by packages/core's withTenant() via set_config(..., true), so the values
-- live for exactly one transaction and cannot leak across pooled connections.
-- -----------------------------------------------------------------------------

create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

create or replace function app.current_company_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.company_id', true), '')::uuid;
$$;

create or replace function app.is_member(target_company uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from company_members cm
     where cm.company_id = target_company
       and cm.user_id = app.current_user_id()
       and cm.is_active
  );
$$;

create or replace function app.has_role(target_company uuid, allowed role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
      from company_members cm
     where cm.company_id = target_company
       and cm.user_id = app.current_user_id()
       and cm.is_active
       and cm.role = any(allowed)
  );
$$;

-- -----------------------------------------------------------------------------
-- Session resolution, in one round trip.
--
-- Working out "who is this and what may they see" used to be two separate
-- transactions — a membership lookup and a company list — which is eight
-- network round trips before a page has read any of its own data. Against a
-- database in another region that was most of a second, every navigation.
--
-- SECURITY DEFINER with an explicit user id, so it needs no session settings
-- and therefore no transaction of its own.
-- -----------------------------------------------------------------------------

create or replace function app.resolve_session(
  target_user uuid,
  requested_company uuid default null
) returns json
language sql stable security definer set search_path = public, pg_temp as $$
  select json_build_object(
    -- Saves the page a second call to the auth service just to render a name.
    'fullName', (select p.full_name from profiles p where p.id = target_user),
    -- The role for the company the request asked for, or null when the user is
    -- not a member of it — which is how a stale cookie gets rejected.
    'role', (
      select cm.role::text
        from company_members cm
       where cm.company_id = requested_company
         and cm.user_id = target_user
         and cm.is_active
    ),
    'companies', coalesce((
      select json_agg(json_build_object(
               'id', c.id, 'name', c.name, 'nameBn', c.name_bn,
               'businessType', c.business_type, 'role', cm.role::text)
             order by c.name)
        from company_members cm
        join companies c on c.id = cm.company_id
       where cm.user_id = target_user
         and cm.is_active
         and c.is_active
    ), '[]'::json)
  );
$$;

-- -----------------------------------------------------------------------------
-- Policies
--
-- Every tenant table gets the same rule: the row's company must be the one the
-- session declared, and the user must actually belong to it. FORCE is required
-- because the application connects as the table owner, and owners bypass RLS
-- unless told otherwise.
-- -----------------------------------------------------------------------------

do $$
declare
  tenant_table text;
begin
  foreach tenant_table in array array[
    'accounts', 'financial_accounts', 'account_balances',
    'parties', 'party_balances',
    'units', 'product_categories', 'products', 'product_stock', 'stock_movements',
    'production_recipes', 'production_recipe_inputs',
    'transactions', 'transaction_lines', 'transaction_payments',
    'journal_entries', 'journal_lines', 'attachments',
    'audit_logs', 'notifications', 'counters'
  ]
  loop
    execute format('alter table %I enable row level security', tenant_table);
    execute format('alter table %I force row level security', tenant_table);
    execute format('drop policy if exists tenant_isolation on %I', tenant_table);
    execute format($f$
      create policy tenant_isolation on %I
        using (company_id = app.current_company_id() and app.is_member(company_id))
        with check (company_id = app.current_company_id() and app.is_member(company_id))
    $f$, tenant_table);
  end loop;
end $$;

-- Companies are addressed by `id`, not `company_id`.
alter table companies enable row level security;
alter table companies force row level security;
drop policy if exists company_membership on companies;
create policy company_membership on companies
  using (app.is_member(id))
  with check (app.is_member(id));

alter table company_members enable row level security;
alter table company_members force row level security;
drop policy if exists membership_visibility on company_members;
create policy membership_visibility on company_members
  using (app.is_member(company_id))
  with check (app.has_role(company_id, array['admin']::role[]));

-- The override PIN is the one thing in the schema that a colleague must not be
-- able to read, and `membership_visibility` above shows every member row to
-- every member — RLS is row-level, not column-level. So the hash lives in its
-- own table with its own rule: your row, and only yours. Writing one also
-- requires the admin role, since only an admin may override at all.
alter table override_credentials enable row level security;
alter table override_credentials force row level security;
drop policy if exists override_pin_is_private on override_credentials;
create policy override_pin_is_private on override_credentials
  using (
    company_id = app.current_company_id()
    and user_id = app.current_user_id()
    and app.is_member(company_id)
  )
  with check (
    company_id = app.current_company_id()
    and user_id = app.current_user_id()
    and app.has_role(company_id, array['admin']::role[])
  );

-- A user sees their own profile, plus the profiles of people they share a
-- company with — enough to render "কে তৈরি করেছে", and nothing more.
alter table profiles enable row level security;
alter table profiles force row level security;
drop policy if exists profile_visibility on profiles;
create policy profile_visibility on profiles
  using (
    id = app.current_user_id()
    or exists (
      select 1
        from company_members mine
        join company_members theirs on theirs.company_id = mine.company_id
       where mine.user_id = app.current_user_id()
         and mine.is_active
         and theirs.user_id = profiles.id
    )
  )
  with check (id = app.current_user_id());

-- -----------------------------------------------------------------------------
-- Audit logs are append-only. Nobody edits history, including admins.
-- -----------------------------------------------------------------------------

drop policy if exists audit_append_only on audit_logs;
create policy audit_append_only on audit_logs
  for insert with check (company_id = app.current_company_id() and app.is_member(company_id));

create or replace function app.reject_audit_mutation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- A cascade from `delete from companies` reaches here after the parent row
  -- is already gone, so its absence is what distinguishes "the whole company
  -- is being removed" from "someone is deleting one inconvenient log line".
  -- Only the second is tampering, and only the second is refused.
  if tg_op = 'DELETE'
     and not exists (select 1 from companies where id = old.company_id) then
    return old;
  end if;

  raise exception 'Audit log rows cannot be modified or deleted'
    using errcode = '42501';
end $$;

drop trigger if exists audit_logs_immutable on audit_logs;
create trigger audit_logs_immutable
  before update or delete on audit_logs
  for each row execute function app.reject_audit_mutation();
