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
  /** So the sales team can ring them without a second page load — R5.6. */
  phone: string | null;
  /** ISO date of their most recent order, or null if they never ordered. */
  lastOrderDate: string | null;
  /** Days since that order. `null` when there has never been one. */
  daysSince: number | null;
  /** How many orders they have ever placed. One is not a habit. */
  orders: number;
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
  /**
   * What they still owe, from `party_balances`.
   *
   * Reading that table is fine and writing it is not: it is maintained by
   * trigger from `journal_lines`, and it is the same figure the dashboard tile
   * shows. How *old* the balance is cannot come from there, and does not —
   * that is `ageing.ts`, derived from the journal on every read.
   */
  receivable: Money;
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

/**
 * Did they cross into this band *today* — R5.4's "new entrants".
 *
 * Nothing is stored and nothing needs to be. The day counter goes up by
 * exactly one every morning, so a customer entered the yellow band on the
 * single day `daysSince` first exceeded the threshold, which is the day it
 * equals `doubtfulDays + 1`. Yesterday it was one less and they were green;
 * tomorrow it is one more and they are no longer new.
 *
 * A volume drop has no such day — it depends on two rolling windows that both
 * move — so `volumeDrop` customers are reported as their own list rather than
 * pretended into this one.
 */
export function enteredBandToday(
  activity: Pick<CustomerActivity, "daysSince" | "volumeDrop">,
  policy: ActivityPolicy = DEFAULT_ACTIVITY_POLICY,
): ActivityStatus | null {
  if (activity.daysSince === null || activity.volumeDrop) return null;
  if (activity.daysSince === policy.criticalDays + 1) return "critical";
  if (activity.daysSince === policy.doubtfulDays + 1) return "doubtful";
  return null;
}

interface Row extends Record<string, unknown> {
  party_id: string;
  name: string;
  phone: string | null;
  last_order: string | null;
  order_count: number;
  recent_total: string;
  prior_total: string;
  receivable: string;
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
           p.phone                    as phone,
           max(o.date)::text          as last_order,
           count(o.date)::int         as order_count,
           coalesce(sum(o.debit) filter (
             where o.date > ${today}::date - ${policy.recentDays}::int
           ), 0)::text                as recent_total,
           coalesce(sum(o.debit) filter (
             where o.date <= ${today}::date - ${policy.recentDays}::int
               and o.date > ${today}::date - ${policy.baselineDays}::int
           ), 0)::text                as prior_total,
           coalesce(max(pb.receivable), 0)::text as receivable
      from parties p
      left join orders o on o.party_id = p.id
      left join party_balances pb
        on pb.party_id = p.id and pb.company_id = p.company_id
     where p.company_id = ${companyId}::uuid
       and p.type in ('customer', 'both')
       and p.is_active
     group by p.id, p.name, p.phone
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
      phone: row.phone,
      lastOrderDate,
      daysSince,
      orders: Number(row.order_count ?? 0),
      status,
      recent,
      baseline,
      volumeDrop,
      receivable: moneyFromDb(row.receivable),
    } satisfies CustomerActivity;
  });
}
