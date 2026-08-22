/**
 * The customer health board — spec R5.4, R5.5 and R5.6.
 *
 * Two derivations already exist and neither is stored: `activity.ts` says how
 * long a customer has been silent, `ageing.ts` says how old their unpaid bill
 * is. This puts them side by side, because that is how the question is
 * actually asked — "who has gone quiet, and do they owe us anything?" — and
 * answers R5.4's daily block from the same read.
 *
 * ## Why "today's new entrants" needs no table
 *
 * The obvious way to report who *entered* the yellow band today is to store
 * yesterday's band and compare. That is the cache mistake in a fifth costume,
 * and it is not needed: the day counter goes up by exactly one every morning,
 * so a customer crossed a threshold on the single day their counter equals it.
 * Yesterday it was one less, tomorrow it is one more. Nothing is written, and
 * a company that changes its thresholds gets the new answer immediately
 * instead of a backlog of rows computed under the old ones.
 */
import { eq } from "drizzle-orm";
import { companies, withTenant } from "@hishabai/db";
import {
  ZERO,
  activityPolicyFrom,
  creditPolicyFrom,
  todayIso,
  type ActivityPolicy,
  type ActivityStatus,
  type CreditPolicy,
} from "@hishabai/shared";
import type { AgeingBand } from "@hishabai/accounting";
import { HEALTHY, loadAgeing, type PartyAgeing } from "./ageing";
import { enteredBandToday, loadCustomerActivity, type CustomerActivity } from "./activity";
import type { TenantScope } from "./session";

/**
 * How many orders make a habit — R5.5.
 *
 * The re-activation list is for customers who "ordered regularly and then
 * stopped". Somebody who bought once, eighteen months ago, never had a habit
 * to lose and is a lead rather than a lapsed regular; putting them on the call
 * list wastes the one thing the sales team has least of. Two is the smallest
 * number that means they came back.
 */
const REGULAR_ORDERS = 2;

export interface CustomerHealth extends CustomerActivity {
  ageing: PartyAgeing;
  /** The activity band they entered *today*, or null. R5.4. */
  enteredToday: ActivityStatus | null;
  /** The ageing band they crossed into *today*, or null. R5.4. */
  agedIntoToday: AgeingBand | null;
  /** R5.5 — they had a habit, and it stopped. */
  reactivation: boolean;
  /** R5.6 — worth a phone call: anything that is not green. */
  followUp: boolean;
}

export interface CustomerHealthView {
  /** The day every count on this page was measured against. */
  today: string;
  activityPolicy: ActivityPolicy;
  creditPolicy: CreditPolicy;
  customers: CustomerHealth[];
}

/**
 * Which ageing threshold, if any, this party crossed today.
 *
 * Same reasoning as `enteredBandToday`: `daysOverdue` advances by one a day,
 * so equality with a boundary is the crossing. A threshold set to zero is not
 * a crossing — with no credit period every outstanding party would "cross"
 * it every single morning.
 */
export function crossedAgeingToday(
  ageing: PartyAgeing,
  policy: CreditPolicy,
): AgeingBand | null {
  if (ageing.daysOverdue <= 0) return null;
  if (policy.riskyDays > 0 && ageing.daysOverdue === policy.riskyDays) return "risky";
  if (policy.slowPayerDays > 0 && ageing.daysOverdue === policy.slowPayerDays) return "slow";
  return null;
}

/**
 * Everything the health screens need, in one transaction.
 *
 * Three round trips inside it: the policy, the activity, and the ageing of
 * whoever actually owes something. The ageing query walks the journal per
 * party, so it is asked only about parties with a balance rather than about
 * every customer on the books.
 */
export async function getCustomerHealth(
  scope: TenantScope,
  options: { today?: string } = {},
): Promise<CustomerHealthView> {
  const today = options.today ?? todayIso();

  return withTenant(scope, async (tx) => {
    const [row] = await tx
      .select({ settings: companies.settings })
      .from(companies)
      .where(eq(companies.id, scope.companyId))
      .limit(1);

    const activityPolicy = activityPolicyFrom(row?.settings);
    const creditPolicy = creditPolicyFrom(row?.settings);

    const activity = await loadCustomerActivity(tx, scope.companyId, activityPolicy, today);
    const owing = activity.filter((a) => a.receivable > ZERO).map((a) => a.partyId);
    const ageing = await loadAgeing(tx, scope.companyId, owing, creditPolicy, today);

    const customers = activity.map((entry): CustomerHealth => {
      const aged = ageing.get(entry.partyId) ?? HEALTHY;
      return {
        ...entry,
        ageing: aged,
        enteredToday: enteredBandToday(entry, activityPolicy),
        agedIntoToday: crossedAgeingToday(aged, creditPolicy),
        reactivation: entry.status === "critical" && entry.orders >= REGULAR_ORDERS,
        followUp: entry.status !== "normal",
      };
    });

    return { today, activityPolicy, creditPolicy, customers };
  });
}

export interface DailyAlerts {
  today: string;
  /** R5.4's headline — the ones who have gone silent long enough to be gone. */
  likelyLost: CustomerHealth[];
  enteredDoubtful: CustomerHealth[];
  enteredCritical: CustomerHealth[];
  /** Parties whose unpaid bill crossed an ageing threshold today. */
  agedToday: CustomerHealth[];
  /** R5.3 — still ordering, but materially less than they used to. */
  volumeDrops: CustomerHealth[];
  /** R5.6 — the standing call list, not only today's arrivals. */
  followUps: CustomerHealth[];
  /** How many lines the block has, for the "no alerts" case. */
  count: number;
}

/**
 * The daily block, sliced out of the health view. Pure, so it can be tested
 * at the day boundary without a database.
 *
 * "Likely lost" is `critical`, which the spec's own table defines as *more
 * than* 14 days — R5.4's prose says "14+", and where the two disagree the
 * table wins, because it is what the traffic light on every other screen uses.
 * One customer appearing in two lists is deliberate: somebody who crossed into
 * red today is both new and lost, and dropping them from either list would
 * hide them from whoever reads only that one.
 */
export function dailyAlertsFrom(view: CustomerHealthView): DailyAlerts {
  const byValue = (a: CustomerHealth, b: CustomerHealth) =>
    // What they *used to* buy, not what they owe: the point of the list is the
    // trade that has stopped, and a lost customer with a clean ledger is still
    // the most expensive kind.
    b.baseline === a.baseline ? a.name.localeCompare(b.name) : b.baseline > a.baseline ? 1 : -1;

  const likelyLost = view.customers.filter((c) => c.status === "critical").sort(byValue);
  const enteredDoubtful = view.customers.filter((c) => c.enteredToday === "doubtful").sort(byValue);
  const enteredCritical = view.customers.filter((c) => c.enteredToday === "critical").sort(byValue);
  const agedToday = view.customers
    .filter((c) => c.agedIntoToday !== null)
    .sort((a, b) => b.ageing.daysOverdue - a.ageing.daysOverdue);
  const volumeDrops = view.customers.filter((c) => c.volumeDrop).sort(byValue);
  const followUps = view.customers.filter((c) => c.followUp).sort(byValue);

  return {
    today: view.today,
    likelyLost,
    enteredDoubtful,
    enteredCritical,
    agedToday,
    volumeDrops,
    followUps,
    count:
      likelyLost.length +
      enteredDoubtful.length +
      enteredCritical.length +
      agedToday.length +
      volumeDrops.length,
  };
}

/** R5.5. Customers who had a habit, and stopped. */
export function reactivationList(view: CustomerHealthView): CustomerHealth[] {
  return view.customers
    .filter((c) => c.reactivation)
    .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
}
