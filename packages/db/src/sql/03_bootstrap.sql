-- =============================================================================
-- Company bootstrap.
--
-- Creating a company is a chicken-and-egg problem under RLS: the row must
-- exist before anyone can be a member of it, and nobody can insert it until
-- they are. This runs as SECURITY DEFINER, checks that the caller is creating
-- the company for themselves, and does the whole setup atomically.
--
-- It also seeds the chart of accounts, which the user will never see. Spec §26:
-- the accounting is professional-grade underneath and invisible on top.
-- =============================================================================

create or replace function app.create_company(
  p_name text,
  p_name_bn text default null,
  p_business_type text default null,
  p_phone text default null,
  p_address text default null,
  p_fiscal_year_start_month int default 7
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := app.current_user_id();
  v_company uuid;
  v_cash_account uuid;
  v_unit record;
begin
  if v_user is null then
    raise exception 'লগইন ছাড়া কোম্পানি তৈরি করা যাবে না' using errcode = '42501';
  end if;

  insert into companies (name, name_bn, business_type, phone, address, fiscal_year_start_month, created_by)
  values (p_name, p_name_bn, p_business_type, p_phone, p_address, p_fiscal_year_start_month, v_user)
  returning id into v_company;

  -- The creator is always an admin of what they created.
  insert into company_members (company_id, user_id, role)
  values (v_company, v_user, 'admin');

  -- ---------------------------------------------------------------------------
  -- Chart of accounts. `is_system` rows back the posting rules and are
  -- addressed by subtype, never by code — renaming them is safe.
  -- `is_category` rows are what appears in the খাত dropdown.
  -- ---------------------------------------------------------------------------
  insert into accounts (company_id, code, name_bn, name_en, type, subtype, is_system, is_category)
  values
    -- সম্পদ
    (v_company, '1000', 'নগদ',                  'Cash',                 'asset',     'cash',                     true,  false),
    (v_company, '1010', 'ব্যাংক',                 'Bank',                 'asset',     'bank',                     true,  false),
    (v_company, '1020', 'মোবাইল ব্যাংকিং',        'MFS',                  'asset',     'mfs',                      true,  false),
    (v_company, '1100', 'কাস্টমার বকেয়া',        'Accounts Receivable',  'asset',     'receivable',               true,  false),
    (v_company, '1200', 'স্টক',                   'Inventory',            'asset',     'inventory',                true,  false),
    (v_company, '1300', 'স্থায়ী সম্পদ',            'Fixed Assets',         'asset',     'fixed_asset',              false, false),
    (v_company, '1310', 'পুঞ্জীভূত অবচয়',         'Accumulated Depn.',    'asset',     'accumulated_depreciation', false, false),
    -- দায়
    (v_company, '2000', 'ভেন্ডর পাওনা',           'Accounts Payable',     'liability', 'payable',                  true,  false),
    -- মূলধন
    (v_company, '3000', 'মূলধন',                  'Capital',              'equity',    'capital',                  false, false),
    (v_company, '3010', 'উত্তোলন',                'Drawings',             'equity',    'drawings',                 false, false),
    (v_company, '3020', 'প্রারম্ভিক ব্যালেন্স',     'Opening Balance',      'equity',    'opening_balance_equity',   true,  false),
    -- আয়
    (v_company, '4000', 'বিক্রয়',                 'Sales',                'income',    'sales',                    true,  false),
    (v_company, '4010', 'বিক্রয় ফেরত',            'Sales Return',         'income',    'sales_return',             true,  false),
    (v_company, '4020', 'অন্যান্য আয়',            'Other Income',         'income',    'other_income',             true,  false),
    (v_company, '4030', 'সেবা আয়',               'Service Income',       'income',    'other_income',             false, true),
    (v_company, '4040', 'ভাড়া আয়',               'Rental Income',        'income',    'other_income',             false, true),
    (v_company, '4050', 'কমিশন আয়',              'Commission Income',    'income',    'other_income',             false, true),
    -- ব্যয়
    (v_company, '5000', 'বিক্রীত পণ্যের ব্যয়',     'Cost of Goods Sold',   'expense',   'cogs',                     true,  false),
    (v_company, '5010', 'উৎপাদনে অপচয়',          'Production Wastage',   'expense',   'wastage',                  true,  false),
    (v_company, '5020', 'স্টক সমন্বয়',            'Stock Adjustment',     'expense',   'stock_adjustment',         true,  false),
    (v_company, '5100', 'বেতন',                  'Salary',               'expense',   'operating_expense',        false, true),
    (v_company, '5110', 'দোকান ভাড়া',            'Shop Rent',            'expense',   'operating_expense',        false, true),
    (v_company, '5120', 'বিদ্যুৎ বিল',             'Electricity',          'expense',   'operating_expense',        false, true),
    (v_company, '5130', 'পরিবহন খরচ',            'Transport',            'expense',   'operating_expense',        false, true),
    (v_company, '5140', 'লেবার খরচ',             'Labour',               'expense',   'operating_expense',        false, true),
    (v_company, '5150', 'মোবাইল ও ইন্টারনেট',     'Mobile & Internet',    'expense',   'operating_expense',        false, true),
    (v_company, '5160', 'আপ্যায়ন',               'Entertainment',        'expense',   'operating_expense',        false, true),
    (v_company, '5170', 'মেরামত ও রক্ষণাবেক্ষণ',  'Repairs',              'expense',   'operating_expense',        false, true),
    (v_company, '5900', 'অন্যান্য খরচ',           'Other Expense',        'expense',   'operating_expense',        false, true);

  select id into v_cash_account
    from accounts where company_id = v_company and code = '1000';

  -- Every business starts with a cash drawer. Bank and bKash are added when
  -- the user has one to add.
  insert into financial_accounts (company_id, account_id, kind, name_bn, is_default)
  values (v_company, v_cash_account, 'cash', 'নগদ', true);

  -- ---------------------------------------------------------------------------
  -- Units. Decimal places matter: KG is weighed to three, পিস is counted.
  -- ---------------------------------------------------------------------------
  for v_unit in
    select * from (values
      ('কেজি',   'kg',   3),
      ('গ্রাম',   'g',    0),
      ('টন',     'ton',  3),
      ('পিস',    'pcs',  0),
      ('রোল',    'roll', 2),
      ('বস্তা',   'bag',  0),
      ('লিটার',  'ltr',  3),
      ('মিটার',  'm',    2),
      ('ফুট',    'ft',   2),
      ('ডজন',    'dzn',  0)
    ) as u(name_bn, symbol, decimals)
  loop
    insert into units (company_id, name_bn, symbol, decimal_places)
    values (v_company, v_unit.name_bn, v_unit.symbol, v_unit.decimals);
  end loop;

  insert into product_categories (company_id, name_bn)
  values (v_company, 'সাধারণ'), (v_company, 'কাঁচামাল'), (v_company, 'উৎপাদিত পণ্য');

  update profiles set last_company_id = v_company, updated_at = now()
   where id = v_user;

  insert into audit_logs (company_id, user_id, action, entity_type, entity_id, summary_bn)
  values (v_company, v_user, 'create', 'company', v_company, 'কোম্পানি তৈরি করা হয়েছে');

  return v_company;
end $$;

-- Profiles are created on first login rather than by a database trigger on
-- auth.users, so the application controls what a new user starts with.
create or replace function app.ensure_profile(p_full_name text, p_phone text default null)
returns profiles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := app.current_user_id();
  v_profile profiles;
begin
  if v_user is null then
    raise exception 'লগইন প্রয়োজন' using errcode = '42501';
  end if;

  insert into profiles (id, full_name, phone)
  values (v_user, p_full_name, p_phone)
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    phone = coalesce(excluded.phone, profiles.phone),
    updated_at = now()
  returning * into v_profile;

  return v_profile;
end $$;

-- -----------------------------------------------------------------------------
-- Adding a colleague.
--
-- Under RLS a user can only see the profiles of people they already share a
-- company with, which is correct and also means an admin cannot look up the
-- person they are trying to add. So the lookup runs as SECURITY DEFINER, with
-- the admin check done here rather than trusted from the caller.
--
-- It resolves a phone number, never an arbitrary id, and it tells the caller
-- only whether that number has an account — which an admin adding a colleague
-- has to learn anyway. It creates nothing: the person must have registered
-- already, because a login is theirs to make, not their employer's.
-- -----------------------------------------------------------------------------
create or replace function app.add_member_by_phone(
  p_company uuid,
  p_phone text,
  p_role role default 'operator'
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := app.current_user_id();
  v_target uuid;
  v_name text;
begin
  if v_actor is null then
    raise exception 'লগইন প্রয়োজন' using errcode = '42501';
  end if;

  if not exists (
    select 1 from company_members
     where company_id = p_company and user_id = v_actor
       and role = 'admin' and is_active
  ) then
    raise exception 'ব্যবহারকারী যোগ করার অনুমতি আপনার নেই' using errcode = '42501';
  end if;

  select id, full_name into v_target, v_name
    from profiles
   where phone = regexp_replace(p_phone, '[^0-9+]', '', 'g')
   limit 1;

  if v_target is null then
    raise exception 'এই নম্বরে কোনো HishabAI অ্যাকাউন্ট নেই। আগে রেজিস্টার করতে বলুন।'
      using errcode = 'P0002';
  end if;

  -- Re-adding somebody who was removed restores them rather than failing on
  -- the primary key, which is what "যোগ করুন" means to the person clicking it.
  insert into company_members (company_id, user_id, role, invited_by, is_active)
  values (p_company, v_target, p_role, v_actor, true)
  on conflict (company_id, user_id) do update set
    role = excluded.role,
    is_active = true,
    invited_by = excluded.invited_by,
    updated_at = now();

  insert into audit_logs (company_id, user_id, action, entity_type, entity_id, summary_bn)
  values (p_company, v_actor, 'create', 'company_member', v_target,
          format('%s কে %s হিসেবে যোগ করা হয়েছে', v_name, p_role));

  return v_target;
end $$;
