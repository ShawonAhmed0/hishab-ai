/**
 * Everything ড্যাশবোর্ড needs, in a single round trip.
 *
 * This used to be nine sequential queries plus a second transaction for the
 * low-stock alert. On a connection with 120ms of latency that is well over a
 * second of waiting, none of it doing any work. A pooled connection serialises
 * statements anyway, so `Promise.all` would not have helped — the only fix is
 * to ask for everything at once.
 *
 * The tiles read maintained balances rather than aggregating the journal; only
 * the flows and the trend aggregate, and both are bounded by date against the
 * (company_id, date) index.
 */
import { tenantQuery, tenantRead } from "@hishabai/db";
import {
  currentMonthRange,
  moneyFromDb,
  type Money,
  type TransactionStatus,
  type TransactionType,
} from "@hishabai/shared";
import type { TenantScope } from "./session";

export interface DashboardTiles {
  cash: Money;
  bank: Money;
  mfs: Money;
  monthIncome: Money;
  monthExpense: Money;
  netProfit: Money;
  customerDue: Money;
  vendorPayable: Money;
  stockValue: Money;
}

/**
 * The same month's figures, a month earlier.
 *
 * A figure on its own is not information: ৳1,99,000 of income is a good month
 * or a bad one depending entirely on what last month was, and the dashboard
 * used to make the reader remember. Only the *flows* are compared — income,
 * expense, profit. A wallet balance and a stock value are positions rather
 * than flows, and "12% more cash than last month" invites a conclusion the
 * number does not support.
 */
export interface PreviousPeriod {
  from: string;
  to: string;
  income: Money;
  expense: Money;
  netProfit: Money;
}

export interface TrendPoint {
  /** ISO month, e.g. "2026-08". */
  period: string;
  income: Money;
  expense: Money;
  sales: Money;
  profit: Money;
}

export interface RecentTransaction {
  id: string;
  voucherNo: string;
  type: TransactionType;
  status: TransactionStatus;
  date: string;
  total: string;
  paidAmount: string;
  dueAmount: string;
  memoNo: string | null;
  partyName: string | null;
}

export interface LowStockItem {
  id: string;
  nameBn: string;
  quantity: string;
  minStockLevel: string;
  unitSymbol: string;
}

export interface DashboardData {
  tiles: DashboardTiles;
  previous: PreviousPeriod;
  trend: TrendPoint[];
  recent: RecentTransaction[];
  topDueCustomers: { id: string; name: string; receivable: Money }[];
  lowStock: LowStockItem[];
}

function monthRange(reference = new Date()): { from: string; to: string } {
  return currentMonthRange(reference);
}

/**
 * The calendar month before the one given.
 *
 * Taken from the period's own start rather than from today, so a dashboard
 * asked about March compares against February and not against last month.
 */
function previousMonthOf(period: { from: string }): { from: string; to: string } {
  const year = Number(period.from.slice(0, 4));
  const month = Number(period.from.slice(5, 7));
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const lastDay = new Date(Date.UTC(prev.y, prev.m, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    from: `${prev.y}-${pad(prev.m)}-01`,
    to: `${prev.y}-${pad(prev.m)}-${pad(lastDay)}`,
  };
}

/** `tx.execute` requires an index signature; the shape is documented above. */
interface RawDashboard {
  [key: string]: unknown;
  wallets: { kind: string; balance: string }[] | null;
  flows: { type: string; amount: string }[] | null;
  prior_flows: { type: string; amount: string }[] | null;
  dues: { receivable: string; payable: string } | null;
  stock_value: string | null;
  trend: { period: string; income: string; expense: string; sales: string }[] | null;
  recent: RecentTransaction[] | null;
  top_due: { id: string; name: string; receivable: string }[] | null;
  low_stock: LowStockItem[] | null;
}

export async function getDashboard(
  session: TenantScope,
  options: { from?: string; to?: string; months?: number } = {},
): Promise<DashboardData> {
  const period = {
    from: options.from ?? monthRange().from,
    to: options.to ?? monthRange().to,
  };
  const prior = previousMonthOf(period);
  const months = options.months ?? 6;

  // One statement, one round trip. Each subquery returns JSON so the whole
  // dashboard arrives as a single row, and the company is never named: it
  // comes from the session context, which RLS checks membership against.
  const rows = await tenantRead<RawDashboard>(
    session,
    tenantQuery`
      select
        (select coalesce(json_agg(json_build_object('kind', kind, 'balance', balance::text)), '[]'::json)
           from financial_accounts
          where company_id = app.current_company_id() and is_active) as wallets,

        (select coalesce(json_agg(json_build_object('type', t.type, 'amount', t.amount)), '[]'::json)
           from (
             select a.type::text as type,
                    coalesce(sum(jl.credit - jl.debit), 0)::text as amount
               from journal_lines jl
               join accounts a on a.id = jl.account_id
              where jl.company_id = app.current_company_id()
                and jl.date between ${period.from}::date and ${period.to}::date
                and a.type in ('income', 'expense')
              group by a.type
           ) t) as flows,

        -- The same aggregation a month earlier, so every flow tile can say
        -- what it is up or down against. One more subquery on the same
        -- (company_id, date) index rather than a second round trip.
        (select coalesce(json_agg(json_build_object('type', t.type, 'amount', t.amount)), '[]'::json)
           from (
             select a.type::text as type,
                    coalesce(sum(jl.credit - jl.debit), 0)::text as amount
               from journal_lines jl
               join accounts a on a.id = jl.account_id
              where jl.company_id = app.current_company_id()
                and jl.date between ${prior.from}::date and ${prior.to}::date
                and a.type in ('income', 'expense')
              group by a.type
           ) t) as prior_flows,

        (select json_build_object(
                  'receivable', coalesce(sum(receivable), 0)::text,
                  'payable', coalesce(sum(payable), 0)::text)
           from party_balances where company_id = app.current_company_id()) as dues,

        (select coalesce(sum(value), 0)::text
           from product_stock where company_id = app.current_company_id()) as stock_value,

        (select coalesce(json_agg(json_build_object(
                  'period', t.period, 'income', t.income,
                  'expense', t.expense, 'sales', t.sales) order by t.period), '[]'::json)
           from (
             select to_char(date_trunc('month', jl.date), 'YYYY-MM') as period,
                    coalesce(sum(case when a.type = 'income' then jl.credit - jl.debit else 0 end), 0)::text as income,
                    coalesce(sum(case when a.type = 'expense' then jl.debit - jl.credit else 0 end), 0)::text as expense,
                    coalesce(sum(case when a.subtype = 'sales' then jl.credit - jl.debit else 0 end), 0)::text as sales
               from journal_lines jl
               join accounts a on a.id = jl.account_id
              where jl.company_id = app.current_company_id()
                and jl.date >= (current_date - make_interval(months => ${months}))
              group by 1
           ) t) as trend,

        (select coalesce(json_agg(json_build_object(
                  'id', t.id, 'voucherNo', t.voucher_no, 'type', t.type, 'status', t.status,
                  'date', t.date, 'total', t.total, 'paidAmount', t.paid_amount,
                  'dueAmount', t.due_amount, 'memoNo', t.memo_no, 'partyName', t.party_name)
                  order by t.created_at desc), '[]'::json)
           from (
             select tr.id, tr.voucher_no, tr.type::text, tr.status::text, tr.date::text,
                    tr.total::text, tr.paid_amount::text, tr.due_amount::text,
                    tr.memo_no, p.name as party_name, tr.created_at
               from transactions tr
               left join parties p on p.id = tr.party_id
              where tr.company_id = app.current_company_id()
              order by tr.created_at desc
              limit 12
           ) t) as recent,

        (select coalesce(json_agg(json_build_object(
                  'id', t.id, 'name', t.name, 'receivable', t.receivable)
                  order by t.receivable desc), '[]'::json)
           from (
             select p.id, p.name, pb.receivable::text
               from party_balances pb
               join parties p on p.id = pb.party_id
              where pb.company_id = app.current_company_id() and pb.receivable > 0
              order by pb.receivable desc
              limit 8
           ) t) as top_due,

        (select coalesce(json_agg(json_build_object(
                  'id', t.id, 'nameBn', t.name_bn, 'quantity', t.quantity,
                  'minStockLevel', t.min_stock_level, 'unitSymbol', t.unit_symbol)), '[]'::json)
           from (
             select pr.id, pr.name_bn, coalesce(ps.quantity, 0)::text as quantity,
                    pr.min_stock_level::text, u.symbol as unit_symbol
               from products pr
               join units u on u.id = pr.unit_id
               left join product_stock ps
                 on ps.product_id = pr.id and ps.company_id = pr.company_id
              where pr.company_id = app.current_company_id()
                and pr.is_active
                and pr.min_stock_level > 0
                and coalesce(ps.quantity, 0) <= pr.min_stock_level
              order by pr.name_bn
              limit 20
           ) t) as low_stock
    `,
  );

  const raw = rows[0]!;

  const walletTotal = (kind: string): Money => {
    let total = 0n;
    for (const wallet of raw.wallets ?? []) {
      if (wallet.kind === kind) total += moneyFromDb(wallet.balance);
    }
    return total as Money;
  };

  const flow = (type: string) =>
    moneyFromDb((raw.flows ?? []).find((f) => f.type === type)?.amount ?? "0");
  const priorFlow = (type: string) =>
    moneyFromDb((raw.prior_flows ?? []).find((f) => f.type === type)?.amount ?? "0");

  const monthIncome = flow("income");
  // Expenses are debit-normal, so `credit - debit` comes back negative.
  const monthExpense = -flow("expense") as Money;
  const priorIncome = priorFlow("income");
  const priorExpense = -priorFlow("expense") as Money;

  const trend: TrendPoint[] = (raw.trend ?? []).map((row) => {
    const income = moneyFromDb(row.income);
    const expense = moneyFromDb(row.expense);
    return {
      period: row.period,
      income,
      expense,
      sales: moneyFromDb(row.sales),
      profit: (income - expense) as Money,
    };
  });

  return {
    tiles: {
      cash: walletTotal("cash"),
      bank: walletTotal("bank"),
      mfs: walletTotal("mfs"),
      monthIncome,
      monthExpense,
      netProfit: (monthIncome - monthExpense) as Money,
      customerDue: moneyFromDb(raw.dues?.receivable ?? "0"),
      vendorPayable: moneyFromDb(raw.dues?.payable ?? "0"),
      stockValue: moneyFromDb(raw.stock_value ?? "0"),
    },
    previous: {
      from: prior.from,
      to: prior.to,
      income: priorIncome,
      expense: priorExpense,
      netProfit: (priorIncome - priorExpense) as Money,
    },
    trend,
    recent: raw.recent ?? [],
    topDueCustomers: (raw.top_due ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      receivable: moneyFromDb(row.receivable),
    })),
    lowStock: raw.low_stock ?? [],
  };
}
