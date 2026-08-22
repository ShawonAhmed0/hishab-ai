/**
 * The knobs a company turns once — spec R4.1, R5.2.
 *
 * They live in `companies.settings` (jsonb) rather than in columns because
 * every one of them has a working default and none of them is a fact about the
 * business: when its books close, and how late a bill has to be before it is
 * worth worrying about. Reading them is total — anything malformed falls back
 * to the default rather than throwing, because a bad settings blob must not be
 * able to stop every entry in the company.
 */
import { eq, sql } from "drizzle-orm";
import { companies, withTenant } from "@hishabai/db";
import {
  activityPolicyFrom,
  companyPolicySchema,
  confirmPolicyFrom,
  creditPolicyFrom,
  periodLockFrom,
  type ActivityPolicy,
  type ConfirmPolicy,
  type CreditPolicy,
  type PeriodLock,
} from "@hishabai/shared";
import { writeAudit } from "./audit";
import { requirePermission, type Session, type TenantScope } from "./session";

export interface CompanyPolicy {
  credit: CreditPolicy;
  lock: PeriodLock;
  confirm: ConfirmPolicy;
  /** R5.1 and R5.3 — how long a silence has to last to be worth a call. */
  activity: ActivityPolicy;
}

export async function getCompanyPolicy(scope: TenantScope): Promise<CompanyPolicy> {
  return withTenant(scope, async (tx) => {
    const [row] = await tx
      .select({ settings: companies.settings })
      .from(companies)
      .where(eq(companies.id, scope.companyId))
      .limit(1);
    return {
      credit: creditPolicyFrom(row?.settings),
      lock: periodLockFrom(row?.settings),
      confirm: confirmPolicyFrom(row?.settings),
      activity: activityPolicyFrom(row?.settings),
    };
  });
}

/**
 * Merges rather than replaces.
 *
 * `settings` is shared with whatever else ends up living there, so this writes
 * the keys it owns and leaves the rest of the object alone — `||` on jsonb is
 * a shallow merge, which is exactly the depth these keys have.
 */
export async function updateCompanyPolicy(
  session: Session,
  rawInput: unknown,
): Promise<void> {
  requirePermission(session, "settings.manage");
  const input = companyPolicySchema.parse(rawInput);

  const patch = {
    // An empty string is the form's way of saying "no floor at all".
    lockedBefore: input.lockedBefore ? input.lockedBefore : null,
    lockPriorMonths: input.lockPriorMonths,
    creditPeriodDays: input.creditPeriodDays,
    slowPayerDays: input.slowPayerDays,
    riskyDays: input.riskyDays,
    largeAmount: input.largeAmount,
    largeMultiple: input.largeMultiple,
    confirmEveryEntry: input.confirmEveryEntry,
    doubtfulDays: input.doubtfulDays,
    criticalDays: input.criticalDays,
    recentDays: input.recentDays,
    baselineDays: input.baselineDays,
    volumeDropPercent: input.volumeDropPercent,
  };

  await withTenant(session, async (tx) => {
    await tx
      .update(companies)
      .set({
        settings: sql`coalesce(${companies.settings}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, session.companyId));

    await writeAudit(tx, session, {
      action: "update",
      entityType: "company_policy",
      entityId: session.companyId,
      summaryBn: "কোম্পানির নিয়ম হালনাগাদ করা হয়েছে",
      after: patch,
    });
  });
}
