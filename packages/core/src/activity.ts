/**
 * Which customers have gone quiet — spec R5.1 and R5.3.
 *
 * Derived from `journal_lines` on every read, and there is no
 * `last_order_date` column anywhere. CLAUDE.md records the same mistake three
 * times over, and a customer's traffic light is the worst possible thing to
 * cache: it is correct on the day it is written and wrong every day after,
 * because *nothing happening* is what changes it. No trigger fires when a
 * customer does not order.
 *
 * "An order" is a debit on the receivable control account carrying the party's
 * id, which is exactly what a sale posts — gross, before any payment against
 * it. A return credits that account, so it does not count as an order, and a
 * cash sale does, which is right: they came in and bought something.
 */
import { sql } from "drizzle-orm";
import type { Transaction as Tx } from "@hishabai/db";
import {
  DEFAULT_ACTIVITY_POLICY,
  ZERO,
  cmpMoney,
  moneyFromDb,
  scaleMoney,
  todayIso,
  type ActivityPolicy,
  type ActivityStatus,
  type Money,
} from "@hishabai/shared";

export interface CustomerActivity {
  partyId: string;
  name: string;
  /** ISO date of their most recent order, or null if they never ordered. */
  lastOrderDate: string | null;
  /** Days since that order. `null` when there has never been one. */
  daysSince: number | null;
  status: ActivityStatus;
  /** What they have bought in the recent window. */
  recent: Money;
  /**
   * What they bought over the same length of time before it, so the two are
   * comparable — the baseline window is longer, and is scaled down to match.
   */
  baseline: Money;
  /** Set when R5.3 is what made them doubtful, rather than R5.1's silence. */
  volumeDrop: boolean;
}

/** Whole days between two ISO dates, floor. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * The traffic light, as a pure function of the numbers.
 *
 * Separated from the query so the boundaries can be tested at the day, and so
 * R5.3's rule sits visibly next to R5.1's rather than being buried in SQL.
 */
export function statusFor(
  args: { daysSince: number | null; recent: Money; baseline: Money },
  policy: ActivityPolicy = DEFAULT_ACTIVITY_POLICY,
): { status: ActivityStatus; volumeDrop: boolean } {
  // Never ordered at all is not "critical" — there is nothing to have lost.
  if (args.daysSince === null) return { status: "normal", volumeDrop: false };

  if (args.daysSince > policy.criticalDays) return { status: "critical", volumeDrop: false };
  if (args.daysSince > policy.doubtfulDays) return { status: "doubtful", volumeDrop: false };

  // R5.3. Still inside the window, but buying materially less than they used
  // to. A customer halving their order is on their way out; waiting for them
  // to stop entirely is waiting too long.
  if (args.baseline > ZERO && policy.volumeDropPercent > 0) {
    const floor = scaleMoney(
      args.baseline,
      BigInt(100 - policy.volumeDropPercent),
      100n,
    );
    if (cmpMoney(args.recent, floor) < 0) return { status: "doubtful", volumeDrop: true };
  }

  return { status: "normal", volumeDrop: false };
}

interface Row extends Record<string, unknown> {
  party_id: string;
  name: string;
  last_order: string | null;
  recent_total: string;
  prior_total: string;
}

/**
 * Every customer's standing, in one query.
 *
 * `left join` from parties, not from the journal: a customer who has never
 * ordered has no journal line and still has to appear — an empty list of
 * customers is not the same answer as "all of them are fine".
 */
export async function loadCustomerActivity(
  tx: Tx,
  companyId: string,
  policy: ActivityPolicy = DEFAULT_ACTIVITY_POLICY,
  today = todayIso(),
): Promise<CustomerActivity[]> {
  const rows = (await tx.execute<Row>(sql`
    with orders as (
      select jl.party_id, jl.date, jl.debit
        from journal_lines jl
        join accounts a on a.id = jl.account_id
       where jl.company_id = ${companyId}::uuid
         and a.subtype = 'receivable'
         and jl.debit > 0
         and jl.party_id is not null
    )
    select p.id                       as party_id,
           p.name                     as name,
           max(o.date)::text          as last_order,
           coalesce(sum(o.debit) filter (
             where o.date > ${today}::date - ${policy.recentDays}::int
           ), 0)::text                as recent_total,
           coalesce(sum(o.debit) filter (
             where o.date <= ${today}::date - ${policy.recentDays}::int
               and o.date > ${today}::date - ${policy.baselineDays}::int
           ), 0)::text                as prior_total
      from parties p
      left join orders o on o.party_id = p.id
     where p.company_id = ${companyId}::uuid
       and p.type in ('customer', 'both')
       and p.is_active
     group by p.id, p.name
     order by p.name
  `)) as unknown as Row[];

  // The baseline window is longer than the recent one, so its total is scaled
  // down to the same length before the two are compared. Comparing 30 days
  // against 60 would call every customer alive a collapse.
  const priorDays = policy.baselineDays - policy.recentDays;

  return rows.map((row) => {
    const lastOrderDate = row.last_order;
    const daysSince = lastOrderDate === null ? null : daysBetween(lastOrderDate, today);
    const recent = moneyFromDb(row.recent_total);
    const baseline =
      priorDays > 0
        ? scaleMoney(moneyFromDb(row.prior_total), BigInt(policy.recentDays), BigInt(priorDays))
        : ZERO;

    const { status, volumeDrop } = statusFor({ daysSince, recent, baseline }, policy);

    return {
      partyId: row.party_id,
      name: row.name,
      lastOrderDate,
      daysSince,
      status,
      recent,
      baseline,
      volumeDrop,
    } satisfies CustomerActivity;
  });
}
