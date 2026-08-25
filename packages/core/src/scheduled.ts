/**
 * The jobs nothing triggers — spec R4.6's daily summary and R5.6's reminders.
 *
 * Every other event in this codebase hangs off a posting: somebody saved an
 * entry, and something follows from it. These two do not. A summary happens
 * because the day ended, and a customer turns yellow because *nothing*
 * happened — no trigger fires when a customer does not order. So they need a
 * clock, and the clock is outside the app.
 *
 * ## Running without a session
 *
 * There is no user behind a cron, and RLS checks `app.user_id` on every row.
 * The answer is not to bypass RLS — a runtime connection with BYPASSRLS turns
 * every policy in the application inert while `pg_class` still reports them
 * enabled, which is the failure `04_grants.sql` exists to prevent.
 *
 * Instead `app.scheduled_job_targets()` (SECURITY DEFINER, and returning
 * nothing but `(company_id, user_id)` pairs) names one admin per company, and
 * each company's work then runs in an ordinary `withTenant` transaction as that
 * admin. The job has exactly the reach that one person already has, and
 * anything it writes is attributed to them rather than to "the system".
 *
 * ## One company's failure is not the others'
 *
 * A company with a malformed settings blob, or no admin, must not stop the
 * other forty from getting their summary. Each is caught and counted.
 */
import { sql } from "drizzle-orm";
import { getDb, withTenant } from "@hishabai/db";
import { moneyFromDb, todayIso, type Money } from "@hishabai/shared";
import { queueAtRiskReminders, queueDailySummary } from "./delivery-events";
import { flushDeliveries } from "./delivery";
import type { Session } from "./session";

export interface JobTarget {
  companyId: string;
  userId: string;
}

export interface JobReport {
  companies: number;
  queued: number;
  sent: number;
  failures: { companyId: string; error: string }[];
}

/** One admin per active company. See the SQL for why this is not a plain read. */
export async function scheduledJobTargets(): Promise<JobTarget[]> {
  const rows = (await getDb().execute(
    sql`select company_id, user_id from app.scheduled_job_targets()`,
  )) as unknown as { company_id: string; user_id: string }[];
  return rows.map((row) => ({ companyId: row.company_id, userId: row.user_id }));
}

function sessionFor(target: JobTarget): Session {
  // The role is what the SQL selected on, so this is a statement of fact
  // rather than a claim: RLS re-checks membership on every row regardless.
  return { userId: target.userId, companyId: target.companyId, role: "admin" };
}

interface DayTotals {
  sales: Money;
  collected: Money;
  outstanding: Money;
}

/**
 * The day's figures, from `journal_lines`.
 *
 * Not from `transactions`: a cancelled voucher posts a mirror entry, so the
 * journal nets it to zero without this query knowing cancellation exists — the
 * same reason every report in this codebase reads the journal.
 */
async function dayTotals(session: Session, date: string): Promise<DayTotals> {
  return withTenant(session, async (tx) => {
    const rows = (await tx.execute(sql`
      select
        coalesce(sum(case when a.subtype = 'sales'
                          then jl.credit - jl.debit else 0 end), 0)::text as sales,
        coalesce(sum(case when a.subtype = 'receivable'
                          then jl.credit - jl.debit else 0 end), 0)::text as collected
        from journal_lines jl
        join accounts a on a.id = jl.account_id
       where jl.company_id = ${session.companyId}::uuid
         and jl.date = ${date}::date
    `)) as unknown as { sales: string; collected: string }[];

    const outstanding = (await tx.execute(sql`
      select coalesce(sum(receivable), 0)::text as total
        from party_balances where company_id = ${session.companyId}::uuid
    `)) as unknown as { total: string }[];

    return {
      sales: moneyFromDb(rows[0]?.sales ?? "0"),
      // Credits on the receivable control account are money coming in; a new
      // credit sale debits it, so this nets to what was actually collected.
      collected: moneyFromDb(rows[0]?.collected ?? "0"),
      outstanding: moneyFromDb(outstanding[0]?.total ?? "0"),
    };
  });
}

/**
 * Everything the clock owes every company, once.
 *
 * Idempotent per day: `queueDailySummary` and `queueAtRiskReminders` both
 * refuse to queue the same thing twice on the same date, because a cron that
 * fires twice is a Tuesday.
 */
export async function runDailyJobs(
  options: { today?: string; targets?: JobTarget[] } = {},
): Promise<JobReport> {
  const today = options.today ?? todayIso();
  const targets = options.targets ?? (await scheduledJobTargets());
  const report: JobReport = { companies: 0, queued: 0, sent: 0, failures: [] };

  for (const target of targets) {
    const session = sessionFor(target);
    try {
      const totals = await dayTotals(session, today);
      report.queued += await queueDailySummary(session, {
        date: today,
        sales: totals.sales,
        collected: totals.collected,
        outstanding: totals.outstanding,
      });
      report.queued += await queueAtRiskReminders(session, { today });

      // Sending is outside the queueing, exactly as it is on the posting path,
      // and `flushDeliveries` never throws.
      const flushed = await flushDeliveries(session);
      report.sent += flushed.sent;
      report.companies += 1;
    } catch (error) {
      // One company's bad data is not the other forty's problem.
      report.failures.push({
        companyId: target.companyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return report;
}
