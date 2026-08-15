/**
 * Everything ড্যাশবোর্ড needs, in as few round trips as it can be done in.
 *
 * The tiles read maintained balances rather than aggregating the journal.
 * The trends do aggregate, but over a bounded date window and against the
 * (company_id, date) index.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import {
  accountBalances,
  accounts,
  financialAccounts,
  parties,
  partyBalances,
  productStock,
  transactions,
  withTenant,
} from "@hishabai/db";
import { moneyFromDb, sumMoney, type Money } from "@hishabai/shared";
import type { Session } from "./session";

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

export interface TrendPoint {
  /** ISO month, e.g. "2026-08". */
  period: string;
  income: Money;
  expense: Money;
  sales: Money;
  profit: Money;
}

export interface DashboardData {
  tiles: DashboardTiles;
  trend: TrendPoint[];
  recent: Awaited<ReturnType<typeof recentForDashboard>>;
  topDueCustomers: { id: string; name: string; receivable: Money }[];
}

function monthRange(reference = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const to = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function getDashboard(
  session: Session,
  options: { from?: string; to?: string; months?: number } = {},
): Promise<DashboardData> {
  const period = {
    from: options.from ?? monthRange().from,
    to: options.to ?? monthRange().to,
  };

  return withTenant(session, async (tx) => {
    // --- wallets -------------------------------------------------------------
    const wallets = await tx
      .select({ kind: financialAccounts.kind, balance: financialAccounts.balance })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.companyId, session.companyId),
          eq(financialAccounts.isActive, true),
        ),
      );

    const walletTotal = (kind: "cash" | "bank" | "mfs"): Money =>
      sumMoney(wallets.filter((w) => w.kind === kind).map((w) => moneyFromDb(w.balance)));

    // --- income and expense for the window ----------------------------------
    // Income accounts carry credit balances, so the stored debit-positive
    // number is negated to read as a positive আয় figure.
    const flows = await tx.execute<{ type: string; amount: string }>(sql`
      select a.type::text as type,
             coalesce(sum(jl.credit - jl.debit), 0)::text as amount
        from journal_lines jl
        join accounts a on a.id = jl.account_id
       where jl.company_id = ${session.companyId}::uuid
         and jl.date between ${period.from} and ${period.to}
         and a.type in ('income', 'expense')
       group by a.type
    `);

    const flowRows = flows as unknown as { type: string; amount: string }[];
    const monthIncome = moneyFromDb(flowRows.find((r) => r.type === "income")?.amount ?? "0");
    // Expenses are debit-normal, so the same expression comes back negative.
    const monthExpense = -moneyFromDb(
      flowRows.find((r) => r.type === "expense")?.amount ?? "0",
    ) as Money;

    // --- receivable / payable / stock ---------------------------------------
    const [dues] = await tx
      .select({
        receivable: sql<string>`coalesce(sum(${partyBalances.receivable}), 0)::text`,
        payable: sql<string>`coalesce(sum(${partyBalances.payable}), 0)::text`,
      })
      .from(partyBalances)
      .where(eq(partyBalances.companyId, session.companyId));

    const [stock] = await tx
      .select({
        value: sql<string>`coalesce(sum(${productStock.value}), 0)::text`,
      })
      .from(productStock)
      .where(eq(productStock.companyId, session.companyId));

    // --- trend --------------------------------------------------------------
    const months = options.months ?? 6;
    const trendRows = (await tx.execute<{
      period: string;
      income: string;
      expense: string;
      sales: string;
    }>(sql`
      select to_char(date_trunc('month', jl.date), 'YYYY-MM') as period,
             coalesce(sum(case when a.type = 'income' then jl.credit - jl.debit else 0 end), 0)::text as income,
             coalesce(sum(case when a.type = 'expense' then jl.debit - jl.credit else 0 end), 0)::text as expense,
             coalesce(sum(case when a.subtype = 'sales' then jl.credit - jl.debit else 0 end), 0)::text as sales
        from journal_lines jl
        join accounts a on a.id = jl.account_id
       where jl.company_id = ${session.companyId}::uuid
         and jl.date >= (current_date - make_interval(months => ${months}))
       group by 1
       order by 1
    `)) as unknown as { period: string; income: string; expense: string; sales: string }[];

    const trend: TrendPoint[] = trendRows.map((row) => {
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

    // --- lists --------------------------------------------------------------
    const recent = await recentForDashboard(tx, session.companyId);

    const topDue = await tx
      .select({
        id: parties.id,
        name: parties.name,
        receivable: partyBalances.receivable,
      })
      .from(partyBalances)
      .innerJoin(parties, eq(parties.id, partyBalances.partyId))
      .where(
        and(
          eq(partyBalances.companyId, session.companyId),
          sql`${partyBalances.receivable} > 0`,
        ),
      )
      .orderBy(desc(partyBalances.receivable))
      .limit(8);

    return {
      tiles: {
        cash: walletTotal("cash"),
        bank: walletTotal("bank"),
        mfs: walletTotal("mfs"),
        monthIncome,
        monthExpense,
        netProfit: (monthIncome - monthExpense) as Money,
        customerDue: moneyFromDb(dues?.receivable ?? "0"),
        vendorPayable: moneyFromDb(dues?.payable ?? "0"),
        stockValue: moneyFromDb(stock?.value ?? "0"),
      },
      trend,
      recent,
      topDueCustomers: topDue.map((row) => ({
        id: row.id,
        name: row.name,
        receivable: moneyFromDb(row.receivable),
      })),
    };
  });
}

async function recentForDashboard(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  companyId: string,
) {
  return tx
    .select({
      id: transactions.id,
      voucherNo: transactions.voucherNo,
      type: transactions.type,
      status: transactions.status,
      date: transactions.date,
      total: transactions.total,
      paidAmount: transactions.paidAmount,
      dueAmount: transactions.dueAmount,
      memoNo: transactions.memoNo,
      partyName: parties.name,
    })
    .from(transactions)
    .leftJoin(parties, eq(parties.id, transactions.partyId))
    .where(eq(transactions.companyId, companyId))
    .orderBy(desc(transactions.createdAt))
    .limit(12);
}

/** Cash / bank / MFS report backing — spec §17's financial section. */
export async function accountBalanceReport(session: Session) {
  return withTenant(session, async (tx) =>
    tx
      .select({
        accountId: accounts.id,
        code: accounts.code,
        nameBn: accounts.nameBn,
        type: accounts.type,
        subtype: accounts.subtype,
        balance: accountBalances.balance,
      })
      .from(accounts)
      .leftJoin(
        accountBalances,
        and(
          eq(accountBalances.accountId, accounts.id),
          eq(accountBalances.companyId, accounts.companyId),
        ),
      )
      .where(eq(accounts.companyId, session.companyId))
      .orderBy(accounts.code),
  );
}
