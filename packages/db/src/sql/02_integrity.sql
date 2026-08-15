-- =============================================================================
-- Financial invariants and derived balances.
--
-- The engine in packages/accounting already refuses to emit an unbalanced
-- entry. This file is the second lock: even a hand-written INSERT cannot leave
-- the ledger in a state that does not balance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Every journal entry balances. Checked at COMMIT, not per row, because the
-- rows of one entry necessarily arrive one at a time.
-- -----------------------------------------------------------------------------

create or replace function app.assert_entry_balanced() returns trigger
language plpgsql as $$
declare
  entry_id uuid := coalesce(new.journal_entry_id, old.journal_entry_id);
  total_debit numeric(18,4);
  total_credit numeric(18,4);
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into total_debit, total_credit
    from journal_lines
   where journal_entry_id = entry_id;

  if total_debit <> total_credit then
    raise exception
      'হিসাব মেলেনি: ডেবিট % ≠ ক্রেডিট % (journal entry %)',
      total_debit, total_credit, entry_id
      using errcode = '23514';
  end if;

  return null;
end $$;

drop trigger if exists journal_lines_balanced on journal_lines;
create constraint trigger journal_lines_balanced
  after insert or update or delete on journal_lines
  deferrable initially deferred
  for each row execute function app.assert_entry_balanced();

-- A line is one side or the other, never both and never negative.
alter table journal_lines drop constraint if exists journal_lines_single_side;
alter table journal_lines add constraint journal_lines_single_side
  check (debit >= 0 and credit >= 0 and (debit = 0 or credit = 0) and (debit + credit) > 0);

alter table transactions drop constraint if exists transactions_totals_sane;
alter table transactions add constraint transactions_totals_sane
  check (paid_amount >= 0 and total >= 0 and paid_amount <= total + 0.0001);

-- -----------------------------------------------------------------------------
-- Derived balances, maintained inside the posting transaction.
--
-- `balance` is stored debit-positive (debit − credit) for every account type.
-- Presentation flips the sign for credit-normal accounts; storing it already
-- flipped would mean the trigger needs the account type on every single line.
-- -----------------------------------------------------------------------------

create or replace function app.apply_journal_line() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  line journal_lines := coalesce(new, old);
  factor int := case when tg_op = 'DELETE' then -1 else 1 end;
  delta numeric(18,4);
  account_subtype_value account_subtype;
begin
  -- When a whole company is dropped, its journal cascades away and there is no
  -- balance left to maintain. Without this the trigger would try to write a
  -- running total for a company that no longer exists.
  if tg_op = 'DELETE'
     and not exists (select 1 from companies where id = line.company_id) then
    return null;
  end if;

  delta := factor * (line.debit - line.credit);

  insert into account_balances (company_id, account_id, debit_total, credit_total, balance)
  values (
    line.company_id, line.account_id,
    factor * line.debit, factor * line.credit, delta
  )
  on conflict (company_id, account_id) do update set
    debit_total = account_balances.debit_total + excluded.debit_total,
    credit_total = account_balances.credit_total + excluded.credit_total,
    balance = account_balances.balance + excluded.balance,
    updated_at = now();

  -- Wallet balances mirror their general-ledger account.
  update financial_accounts
     set balance = balance + delta, updated_at = now()
   where account_id = line.account_id
     and company_id = line.company_id;

  -- Party ledgers only care about the two control accounts.
  if line.party_id is not null then
    select a.subtype into account_subtype_value
      from accounts a where a.id = line.account_id;

    if account_subtype_value = 'receivable' then
      insert into party_balances (company_id, party_id, receivable, last_transaction_at)
      values (line.company_id, line.party_id, delta, now())
      on conflict (company_id, party_id) do update set
        receivable = party_balances.receivable + excluded.receivable,
        last_transaction_at = now(),
        updated_at = now();

    elsif account_subtype_value = 'payable' then
      insert into party_balances (company_id, party_id, payable, last_transaction_at)
      values (line.company_id, line.party_id, -delta, now())
      on conflict (company_id, party_id) do update set
        payable = party_balances.payable + excluded.payable,
        last_transaction_at = now(),
        updated_at = now();
    end if;
  end if;

  return null;
end $$;

drop trigger if exists journal_lines_apply_balances on journal_lines;
create trigger journal_lines_apply_balances
  after insert or delete on journal_lines
  for each row execute function app.apply_journal_line();

-- -----------------------------------------------------------------------------
-- Voucher numbering: gap-free and per company.
--
-- A shared sequence would leak one tenant's transaction volume to another and
-- would not restart per company. A locked counter row costs one round trip and
-- is worth it.
-- -----------------------------------------------------------------------------

create or replace function app.next_voucher_no(target_company uuid, prefix text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  next_value int;
begin
  insert into counters (company_id, key, value)
  values (target_company, prefix, 1)
  on conflict (company_id, key) do update set
    value = counters.value + 1,
    updated_at = now()
  returning value into next_value;

  return prefix || '-' || lpad(next_value::text, 6, '0');
end $$;

-- -----------------------------------------------------------------------------
-- Full-text search across the things people actually look for (spec §19).
-- -----------------------------------------------------------------------------

create index if not exists parties_search_idx
  on parties using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(phone, '')));

create index if not exists products_search_idx
  on products using gin (
    to_tsvector('simple', coalesce(name_bn, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(sku, ''))
  );

create index if not exists transactions_search_idx
  on transactions using gin (
    to_tsvector('simple', coalesce(voucher_no, '') || ' ' || coalesce(memo_no, '') || ' ' || coalesce(description, ''))
  );
