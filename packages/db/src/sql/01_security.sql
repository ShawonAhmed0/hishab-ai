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
