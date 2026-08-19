/**
 * How long a party has been sitting on what they owe — spec R5.2.
 *
 * Derived from `journal_lines` on every read, never stored. A band in a column
 * is correct on the day it is written and wrong the morning after, and it is
 * exactly the cache mistake CLAUDE.md records three times.
 *
 * `transactions.due_amount` is not usable here either: it is a posting-time
 * snapshot that is never revisited when a payment arrives, so ageing it would
 * report every bill as unpaid for ever.
 *
 * Settlement is FIFO — the oldest bill is the one a payment pays off. So what
 * is still outstanding is the *newest* set of charges, and the age that matters
 * is the date at which the running total of charges, counted newest first,
 * first covers the outstanding balance.
 */
import { sql } from "drizzle-orm";
import type { Transaction as Tx } from "@hishabai/db";
import {
  DEFAULT_CREDIT_POLICY,
  todayIso,
  type CreditPolicy,
} from "@hishabai/shared";
import type { AgeingBand } from "@hishabai/accounting";

export interface PartyAgeing {
  /** ISO date of the oldest charge still unpaid, or null when nothing is. */
  oldestUnpaid: string | null;
  /** Days past the end of the credit period. Zero when nothing is overdue. */
  daysOverdue: number;
  band: AgeingBand;
}

export const HEALTHY: PartyAgeing = { oldestUnpaid: null, daysOverdue: 0, band: "healthy" };

/** Whole days between two ISO dates, floor. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

export function bandFor(daysOverdue: number, policy: CreditPolicy): AgeingBand {
  if (daysOverdue >= policy.riskyDays) return "risky";
  if (daysOverdue >= policy.slowPayerDays) return "slow";
  return "healthy";
}

/**
 * Turns the oldest unpaid date into a band.
 *
 * Split out from the query so the boundaries can be tested at the day, which
 * is where an off-by-one in an ageing report actually hurts.
 */
export function ageingFrom(
  oldestUnpaid: string | null,
  policy: CreditPolicy,
  today = todayIso(),
): PartyAgeing {
  if (!oldestUnpaid) return HEALTHY;
  const dueOn = daysBetween(oldestUnpaid, today) - policy.creditPeriodDays;
  const daysOverdue = Math.max(0, dueOn);
  return { oldestUnpaid, daysOverdue, band: bandFor(daysOverdue, policy) };
}

interface AgeingRow extends Record<string, unknown> {
  party_id: string;
  oldest_unpaid: string | null;
}

/**
 * The oldest unpaid charge for each of the named parties, in one query.
 *
 * Pass no ids to age every party that owes anything — that is the shape the
 * ageing report wants; the posting path names exactly one.
 */
export async function loadAgeing(
  tx: Tx,
  companyId: string,
  partyIds: readonly string[],
  policy: CreditPolicy = DEFAULT_CREDIT_POLICY,
  today = todayIso(),
): Promise<Map<string, PartyAgeing>> {
  if (partyIds.length === 0) return new Map();

  const ids = partyIds.join(",");
  const rows = (await tx.execute<AgeingRow>(sql`
    with ledger as (
      select jl.party_id, jl.date as d, sum(jl.debit - jl.credit) as delta
        from journal_lines jl
        join accounts a on a.id = jl.account_id
       where jl.company_id = ${companyId}::uuid
         and a.subtype = 'receivable'
         and jl.party_id::text = any(string_to_array(${ids}::text, ','))
       group by jl.party_id, jl.date
    ),
    total as (
      select party_id, coalesce(sum(delta), 0) as outstanding
        from ledger group by party_id
    ),
    walk as (
      select party_id, d,
             sum(greatest(delta, 0)) over (
               partition by party_id order by d desc
               rows between unbounded preceding and current row
             ) as cum
        from ledger
    )
    select t.party_id,
           -- Counting back from the newest charge, this is where the running
           -- total first covers what is still owed: the oldest bill a FIFO
           -- payment run would not yet have reached.
           (select max(w.d)::text
              from walk w
             where w.party_id = t.party_id and w.cum >= t.outstanding) as oldest_unpaid
      from total t
     where t.outstanding > 0
  `)) as unknown as AgeingRow[];

  const found = new Map<string, PartyAgeing>();
  for (const row of rows) {
    found.set(row.party_id, ageingFrom(row.oldest_unpaid, policy, today));
  }
  // A party with nothing outstanding has no row, and is healthy by definition.
  for (const id of partyIds) if (!found.has(id)) found.set(id, HEALTHY);
  return found;
}
