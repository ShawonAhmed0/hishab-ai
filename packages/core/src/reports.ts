/**
 * রিপোর্ট — the five questions a trader actually asks the books.
 *
 * Every report reads the journal rather than the transaction rows. That is the
 * whole point of having posted double entry underneath a one-screen entry form:
 * a cancelled voucher posts a mirror-image entry, so it nets to zero here
 * without any report needing to know that cancellation exists, and a sale that
 * was half paid appears as a bill and a receipt rather than one net figure.
 *
 * Each function is one round trip. The date range is always bounded and always
 * hits the (company_id, date) index; nothing here scans a whole company.
 */
import { raw, tenantQuery, tenantRead, token } from "@hishabai/db";
import {
  currentMonthRange,
  moneyFromDb,
  todayIso,
  type FinancialAccountKind,
  type Money,
  type TransactionType,
} from "@hishabai/shared";
import type { PartySide } from "./party-ledger";
import type { TenantScope } from "./session";

export interface ReportPeriod {
  /** ISO date, inclusive. */
  from: string;
  /** ISO date, inclusive. */
  to: string;
}

/** The current month in Dhaka, which is what every report opens on. */
export function currentMonth(reference = new Date()): ReportPeriod {
  return currentMonthRange(reference);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `tenantQuery` rejects anything that is not a date, but the message it throws
 *  is about SQL. A report asked for a bad range should say so in Bengali. */
function checkPeriod(period: ReportPeriod): ReportPeriod {
  if (!ISO_DATE.test(period.from) || !ISO_DATE.test(period.to)) {
    throw new Error("রিপোর্টের তারিখ সঠিক নয়");
  }
  if (period.from > period.to) throw new Error("শুরুর তারিখ শেষের পরে হতে পারে না");
  return period;
}

// ---------------------------------------------------------------------------
// লাভ-ক্ষতি
// ---------------------------------------------------------------------------

export interface ProfitLossLine {
  accountId: string;
  name: string;
  subtype: string;
  /** Positive means it helped: income earned, or expense incurred. */
  amount: Money;
}

export interface ProfitLoss {
  period: ReportPeriod;
  income: ProfitLossLine[];
  expense: ProfitLossLine[];
  totals: {
    /** বিক্রয় alone, before other income. */
    sales: Money;
    /** বিক্রীত পণ্যের ব্যয় — the cost of what was sold, at weighted average. */
    cogs: Money;
    /** বিক্রয় − COGS. The number that says whether the pricing works. */
    grossProfit: Money;
    income: Money;
    expense: Money;
    netProfit: Money;
  };
}

interface RawLine {
  accountId: string;
  name: string;
  type: "income" | "expense";
  subtype: string;
  amount: string;
}

export async function getProfitLoss(
  scope: TenantScope,
  input: ReportPeriod,
): Promise<ProfitLoss> {
  const period = checkPeriod(input);

  const rows = await tenantRead<{ lines: RawLine[] | null }>(
    scope,
    tenantQuery`
      select (select coalesce(json_agg(t order by t.type, t.amount desc), '[]'::json) from (
        select a.id                as "accountId",
               a.name_bn           as name,
               a.type::text        as type,
               a.subtype::text     as subtype,
               -- Income is credit-normal and expense debit-normal, so both come
               -- out positive and the report never shows a negative expense.
               (case when a.type = 'income'
                     then sum(jl.credit - jl.debit)
                     else sum(jl.debit - jl.credit) end)::text as amount
          from journal_lines jl
          join accounts a on a.id = jl.account_id
         where jl.company_id = app.current_company_id()
           and jl.date between ${period.from}::date and ${period.to}::date
           and a.type in ('income', 'expense')
         group by a.id, a.name_bn, a.type, a.subtype
        -- On the net, not on the gross. A cancelled voucher posts a mirror
        -- entry rather than disappearing, so its account still has two lines of
        -- activity — but nothing happened, and a ৳0 row on a লাভ-ক্ষতি is a
        -- question the reader should never have to ask.
        having (case when a.type = 'income'
                     then sum(jl.credit - jl.debit)
                     else sum(jl.debit - jl.credit) end) <> 0
      ) t) as lines
    `,
  );

  const lines = rows[0]?.lines ?? [];
  const income: ProfitLossLine[] = [];
  const expense: ProfitLossLine[] = [];
  let sales = 0n;
  let cogs = 0n;
  let incomeTotal = 0n;
  let expenseTotal = 0n;

  for (const row of lines) {
    const amount = moneyFromDb(row.amount);
    const line: ProfitLossLine = {
      accountId: row.accountId,
      name: row.name,
      subtype: row.subtype,
      amount,
    };

    if (row.type === "income") {
      income.push(line);
      incomeTotal += amount;
      if (row.subtype === "sales" || row.subtype === "sales_return") sales += amount;
    } else {
      expense.push(line);
      expenseTotal += amount;
      if (row.subtype === "cogs") cogs += amount;
    }
  }

  return {
    period,
    income,
    expense,
    totals: {
      sales: sales as Money,
      cogs: cogs as Money,
      grossProfit: (sales - cogs) as Money,
      income: incomeTotal as Money,
      expense: expenseTotal as Money,
      netProfit: (incomeTotal - expenseTotal) as Money,
    },
  };
}

// ---------------------------------------------------------------------------
// বকেয়া বয়স বিশ্লেষণ
// ---------------------------------------------------------------------------

export const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export interface AgingRow {
  partyId: string;
  name: string;
  phone: string | null;
  /** Outstanding in each bucket, oldest last. */
  buckets: Record<AgingBucket, Money>;
  total: Money;
  /** Days since the oldest still-unsettled bill. */
  oldestDays: number;
}

export interface AgingReport {
  asOf: string;
  side: PartySide;
  rows: AgingRow[];
  totals: Record<AgingBucket, Money> & { all: Money };
}

interface RawAging {
  partyId: string;
  name: string;
  phone: string | null;
  b0: string;
  b1: string;
  b2: string;
  b3: string;
  total: string;
  oldestDays: number | null;
}

/**
 * How old is the money, allocated oldest bill first.
 *
 * There is no invoice-level settlement table — a payment is its own voucher
 * against the party's control account, not a link to the bill it clears. So
 * this does what a shopkeeper does with a receipt book: run the bills in date
 * order, pour the payments over them from the top, and whatever is still dry is
 * what is outstanding, dated by the bill it belongs to.
 *
 * The alternative, reading `transactions.due_amount`, is wrong: that column
 * records the due at the moment of posting and is never revisited when a later
 * payment arrives, so every bill would look permanently unpaid.
 */
export async function getDueAging(
  scope: TenantScope,
  options: { asOf?: string; side?: PartySide } = {},
): Promise<AgingReport> {
  const asOf = options.asOf ?? todayIso();
  if (!ISO_DATE.test(asOf)) throw new Error("রিপোর্টের তারিখ সঠিক নয়");
  const side: PartySide = options.side ?? "receivable";

  // Which ledger side is the charge, and which is the settlement.
  const charge = side === "receivable" ? "jl.debit" : "jl.credit";
  const settle = side === "receivable" ? "jl.credit" : "jl.debit";

  const rows = await tenantRead<{ rows: RawAging[] | null }>(
    scope,
    tenantQuery`
      with movements as (
        select jl.party_id, jl.date, jl.id,
               ${raw(charge)} as charge,
               ${raw(settle)} as settled,
               tr.created_at
          from journal_lines jl
          join accounts a on a.id = jl.account_id
          left join transactions tr on tr.id = jl.transaction_id
         where jl.company_id = app.current_company_id()
           and a.subtype = ${token(side)}
           and jl.party_id is not null
           and jl.date <= ${asOf}::date
      ),
      paid as (
        select party_id, sum(settled) as total from movements group by party_id
      ),
      bills as (
        select m.party_id, m.date, m.charge,
               sum(m.charge) over (
                 partition by m.party_id
                 order by m.date, m.created_at, m.id
                 rows between unbounded preceding and current row
               ) as running
          from movements m
         where m.charge > 0
      ),
      outstanding as (
        -- What the payments did not reach: the slice of this bill lying above
        -- the high-water mark of everything received.
        select b.party_id, b.date,
               greatest(0, least(b.charge, b.running - coalesce(p.total, 0))) as amount
          from bills b
          left join paid p on p.party_id = b.party_id
      )
      select (select coalesce(json_agg(t order by t.total::numeric desc), '[]'::json) from (
        select o.party_id as "partyId", pt.name, pt.phone,
               coalesce(sum(o.amount) filter (where ${asOf}::date - o.date <= 30), 0)::text as b0,
               coalesce(sum(o.amount) filter (where ${asOf}::date - o.date between 31 and 60), 0)::text as b1,
               coalesce(sum(o.amount) filter (where ${asOf}::date - o.date between 61 and 90), 0)::text as b2,
               coalesce(sum(o.amount) filter (where ${asOf}::date - o.date > 90), 0)::text as b3,
               sum(o.amount)::text as total,
               max(${asOf}::date - o.date) filter (where o.amount > 0) as "oldestDays"
          from outstanding o
          join parties pt on pt.id = o.party_id
         group by o.party_id, pt.name, pt.phone
        having sum(o.amount) > 0
      ) t) as rows
    `,
  );

  const parsed = (rows[0]?.rows ?? []).map((row): AgingRow => {
    const buckets: Record<AgingBucket, Money> = {
      "0-30": moneyFromDb(row.b0),
      "31-60": moneyFromDb(row.b1),
      "61-90": moneyFromDb(row.b2),
      "90+": moneyFromDb(row.b3),
    };
    return {
      partyId: row.partyId,
      name: row.name,
      phone: row.phone,
      buckets,
      total: moneyFromDb(row.total),
      oldestDays: row.oldestDays ?? 0,
    };
  });

  const totals = { "0-30": 0n, "31-60": 0n, "61-90": 0n, "90+": 0n, all: 0n };
  for (const row of parsed) {
    for (const bucket of AGING_BUCKETS) totals[bucket] += row.buckets[bucket];
    totals.all += row.total;
  }

  return { asOf, side, rows: parsed, totals: totals as AgingReport["totals"] };
}

// ---------------------------------------------------------------------------
// বিক্রয় ও ক্রয় রেজিস্টার
// ---------------------------------------------------------------------------

export interface RegisterPartyRow {
  partyId: string | null;
  name: string;
  count: number;
  total: Money;
  paid: Money;
  due: Money;
}

export interface RegisterProductRow {
  productId: string;
  name: string;
  unitSymbol: string;
  quantity: string;
  amount: Money;
}

export interface RegisterReport {
  period: ReportPeriod;
  type: "sale" | "purchase";
  totals: { count: number; total: Money; paid: Money; due: Money };
  byParty: RegisterPartyRow[];
  byProduct: RegisterProductRow[];
}

interface RawRegister {
  [key: string]: unknown;
  by_party: { partyId: string | null; name: string | null; count: number; total: string; paid: string; due: string }[] | null;
  by_product: { productId: string; name: string; unitSymbol: string; quantity: string; amount: string }[] | null;
}

/**
 * Who we sold to and what we sold, over a period.
 *
 * Cancelled vouchers are excluded rather than netted: unlike the journal, a
 * cancelled sale has no mirror row in `transactions`, so counting it would
 * inflate both the count and the totals.
 */
export async function getRegister(
  scope: TenantScope,
  input: ReportPeriod & { type: "sale" | "purchase" },
): Promise<RegisterReport> {
  const period = checkPeriod(input);

  const rows = await tenantRead<RawRegister>(
    scope,
    tenantQuery`
      select
        (select coalesce(json_agg(t order by t.total::numeric desc), '[]'::json) from (
          select tr.party_id as "partyId", p.name, count(*)::int as count,
                 sum(tr.total)::text as total,
                 sum(tr.paid_amount)::text as paid,
                 sum(tr.due_amount)::text as due
            from transactions tr
            left join parties p on p.id = tr.party_id
           where tr.company_id = app.current_company_id()
             and tr.type = ${token(input.type)}
             and tr.status = 'posted'
             and tr.date between ${period.from}::date and ${period.to}::date
           group by tr.party_id, p.name
        ) t) as by_party,

        (select coalesce(json_agg(t order by t.amount::numeric desc), '[]'::json) from (
          select tl.product_id as "productId", pr.name_bn as name,
                 u.symbol as "unitSymbol",
                 sum(tl.quantity)::text as quantity,
                 sum(tl.amount)::text as amount
            from transaction_lines tl
            join transactions tr on tr.id = tl.transaction_id
            join products pr on pr.id = tl.product_id
            join units u on u.id = pr.unit_id
           where tr.company_id = app.current_company_id()
             and tr.type = ${token(input.type)}
             and tr.status = 'posted'
             and tr.date between ${period.from}::date and ${period.to}::date
           group by tl.product_id, pr.name_bn, u.symbol
        ) t) as by_product
    `,
  );

  const byParty = (rows[0]?.by_party ?? []).map(
    (row): RegisterPartyRow => ({
      partyId: row.partyId,
      // A cash sale carries no party. It still belongs in the register.
      name: row.name ?? "নগদ লেনদেন",
      count: row.count,
      total: moneyFromDb(row.total),
      paid: moneyFromDb(row.paid),
      due: moneyFromDb(row.due),
    }),
  );

  const totals = byParty.reduce(
    (out, row) => ({
      count: out.count + row.count,
      total: (out.total + row.total) as Money,
      paid: (out.paid + row.paid) as Money,
      due: (out.due + row.due) as Money,
    }),
    { count: 0, total: 0n as Money, paid: 0n as Money, due: 0n as Money },
  );

  return {
    period,
    type: input.type,
    totals,
    byParty,
    byProduct: (rows[0]?.by_product ?? []).map((row) => ({
      productId: row.productId,
      name: row.name,
      unitSymbol: row.unitSymbol,
      quantity: row.quantity,
      amount: moneyFromDb(row.amount),
    })),
  };
}

// ---------------------------------------------------------------------------
// স্টক রিপোর্ট
// ---------------------------------------------------------------------------

export interface StockReportRow {
  productId: string;
  name: string;
  unitSymbol: string;
  openingQty: string;
  inQty: string;
  outQty: string;
  closingQty: string;
  avgCost: Money;
  closingValue: Money;
}

export interface StockReport {
  period: ReportPeriod;
  rows: StockReportRow[];
  totals: { openingValue: Money; closingValue: Money };
}

/**
 * Opening, movement and closing per product, read from the movement log.
 *
 * Every movement is stamped with the balance that followed it, so opening and
 * closing are lookups of the last movement either side of the range rather than
 * a sum over history — which also means the report agrees with the product's
 * own movement page line for line.
 */
export async function getStockReport(
  scope: TenantScope,
  input: ReportPeriod,
): Promise<StockReport> {
  const period = checkPeriod(input);

  const rows = await tenantRead<{ rows: StockReportRow[] | null }>(
    scope,
    tenantQuery`
      with opening as (
        select distinct on (product_id)
               product_id, quantity_after, stock_value_after
          from stock_movements
         where company_id = app.current_company_id()
           and occurred_at < ${period.from}::date
         order by product_id, occurred_at desc, id desc
      ),
      closing as (
        select distinct on (product_id)
               product_id, quantity_after, stock_value_after, avg_cost_after
          from stock_movements
         where company_id = app.current_company_id()
           and occurred_at < (${period.to}::date + 1)
         order by product_id, occurred_at desc, id desc
      ),
      flow as (
        select product_id,
               coalesce(sum(quantity) filter (where direction = 'in'), 0)  as in_qty,
               coalesce(sum(quantity) filter (where direction = 'out'), 0) as out_qty
          from stock_movements
         where company_id = app.current_company_id()
           and occurred_at >= ${period.from}::date
           and occurred_at < (${period.to}::date + 1)
         group by product_id
      )
      select (select coalesce(json_agg(t order by t.name), '[]'::json) from (
        select pr.id as "productId", pr.name_bn as name, u.symbol as "unitSymbol",
               coalesce(o.quantity_after, 0)::text     as "openingQty",
               coalesce(f.in_qty, 0)::text             as "inQty",
               coalesce(f.out_qty, 0)::text            as "outQty",
               coalesce(c.quantity_after, o.quantity_after, 0)::text as "closingQty",
               coalesce(c.avg_cost_after, 0)::text     as "avgCost",
               coalesce(o.stock_value_after, 0)::text  as "openingValue",
               coalesce(c.stock_value_after, o.stock_value_after, 0)::text as "closingValue"
          from products pr
          join units u on u.id = pr.unit_id
          left join opening o on o.product_id = pr.id
          left join closing c on c.product_id = pr.id
          left join flow f    on f.product_id = pr.id
         where pr.company_id = app.current_company_id()
           and pr.is_active
      ) t) as rows
    `,
  );

  const raw = (rows[0]?.rows ?? []) as (StockReportRow & { openingValue: string })[];

  let openingValue = 0n;
  let closingValue = 0n;
  const parsed = raw.map((row): StockReportRow => {
    openingValue += moneyFromDb(row.openingValue);
    const closing = moneyFromDb(String(row.closingValue));
    closingValue += closing;
    return {
      productId: row.productId,
      name: row.name,
      unitSymbol: row.unitSymbol,
      openingQty: row.openingQty,
      inQty: row.inQty,
      outQty: row.outQty,
      closingQty: row.closingQty,
      avgCost: moneyFromDb(String(row.avgCost)),
      closingValue: closing,
    };
  });

  return {
    period,
    rows: parsed,
    totals: {
      openingValue: openingValue as Money,
      closingValue: closingValue as Money,
    },
  };
}

// ---------------------------------------------------------------------------
// ক্যাশ বই
// ---------------------------------------------------------------------------

export interface CashBookEntry {
  id: string;
  date: string;
  voucherNo: string | null;
  transactionId: string | null;
  transactionType: TransactionType | null;
  accountName: string;
  narration: string | null;
  received: Money;
  paid: Money;
  balance: Money;
}

export interface CashBookReport {
  period: ReportPeriod;
  opening: Money;
  closing: Money;
  entries: CashBookEntry[];
  totals: { received: Money; paid: Money };
  wallets: { id: string; name: string; kind: string; balance: Money }[];
}

/**
 * Every taka in and out of নগদ, ব্যাংক and MFS, with the balance carried down.
 *
 * The wallet balances are trigger-maintained from these same journal lines, so
 * `opening + received − paid` has to equal what the dashboard shows. If it ever
 * does not, one of the two is wrong and this report is the one that can prove it.
 */
export async function getCashBook(
  scope: TenantScope,
  input: ReportPeriod & { financialAccountId?: string; kind?: FinancialAccountKind },
): Promise<CashBookReport> {
  const period = checkPeriod(input);

  // `kind` is what the dashboard's নগদ / ব্যাংক / MFS tiles drill into — R5.7.
  // Each of those tiles is the sum of every wallet of one kind, so the ledger
  // behind it is the same sum's movements, not one account's.
  const walletFilter = input.financialAccountId
    ? tenantQuery`and fa.id = ${input.financialAccountId}::uuid`
    : input.kind
      ? tenantQuery`and fa.kind = ${token(input.kind)}`
      : "";

  const rows = await tenantRead<{
    opening: string | null;
    entries: CashBookEntry[] | null;
    wallets: { id: string; name: string; kind: string; balance: string }[] | null;
  }>(
    scope,
    tenantQuery`
      select
        (select coalesce(sum(jl.debit - jl.credit), 0)::text
           from journal_lines jl
           join financial_accounts fa on fa.account_id = jl.account_id
                                     and fa.company_id = jl.company_id
          where jl.company_id = app.current_company_id()
            and jl.date < ${period.from}::date
            ${raw(walletFilter)}) as opening,

        (select coalesce(json_agg(t order by t.seq), '[]'::json) from (
          select jl.id,
                 jl.date::text                          as date,
                 tr.voucher_no                          as "voucherNo",
                 jl.transaction_id                      as "transactionId",
                 tr.type::text                          as "transactionType",
                 fa.name_bn                             as "accountName",
                 coalesce(jl.narration, tr.description) as narration,
                 jl.debit::text                         as received,
                 jl.credit::text                        as paid,
                 row_number() over (order by jl.date, tr.created_at, jl.id) as seq
            from journal_lines jl
            join financial_accounts fa on fa.account_id = jl.account_id
                                      and fa.company_id = jl.company_id
            left join transactions tr on tr.id = jl.transaction_id
           where jl.company_id = app.current_company_id()
             and jl.date between ${period.from}::date and ${period.to}::date
             ${raw(walletFilter)}
        ) t) as entries,

        (select coalesce(json_agg(json_build_object(
                  'id', id, 'name', name_bn, 'kind', kind, 'balance', balance::text)
                  order by kind, name_bn), '[]'::json)
           from financial_accounts
          where company_id = app.current_company_id() and is_active) as wallets
    `,
  );

  const opening = moneyFromDb(rows[0]?.opening ?? "0");
  let running = opening;
  let received = 0n;
  let paid = 0n;

  // The balance is carried in TypeScript rather than by a window function
  // because it has to start from the opening figure, which the window does not
  // see — it only knows about rows inside the range.
  const entries = (rows[0]?.entries ?? []).map((entry): CashBookEntry => {
    const inAmount = moneyFromDb(String(entry.received));
    const outAmount = moneyFromDb(String(entry.paid));
    received += inAmount;
    paid += outAmount;
    running = (running + inAmount - outAmount) as Money;
    return { ...entry, received: inAmount, paid: outAmount, balance: running };
  });

  return {
    period,
    opening,
    closing: running,
    entries,
    totals: { received: received as Money, paid: paid as Money },
    wallets: (rows[0]?.wallets ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      kind: w.kind,
      balance: moneyFromDb(w.balance),
    })),
  };
}
