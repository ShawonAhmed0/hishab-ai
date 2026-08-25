/**
 * What actually gets sent, and to whom — spec R4.6's event table.
 *
 * | Event                              | Recipient          |
 * |------------------------------------|--------------------|
 * | Money collected from a customer    | Admin              |
 * | Entry recorded against a customer  | That customer      |
 * | Entry recorded / daily summary     | Admin              |
 * | Customer enters Yellow or Red      | Sales side + admin |
 *
 * The first two are consequences of a posting and are queued inside its
 * transaction. The last two are not caused by anything a user did — a daily
 * summary happens because the day ended, and a customer turns yellow because
 * *nothing happened* — so they are functions something scheduled has to call.
 * See `queueDailySummary` and `queueAtRiskReminders`; both refuse to queue the
 * same thing twice on the same day, because a cron that fires twice is a
 * Tuesday.
 *
 * There is no per-user language column, so everything goes out in Bengali, the
 * product default. A recipient-locale column is the obvious next thing here.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  companyMembers,
  messageDeliveries,
  parties,
  profiles,
  withTenant,
  type Transaction as Tx,
} from "@hishabai/db";
import {
  BUSINESS_TIME_ZONE,
  DEFAULT_LOCALE,
  formatMoney,
  todayIso,
  type Money,
  type TransactionType,
} from "@hishabai/shared";
import { dailyAlertsFrom, getCustomerHealth } from "./customer-health";
import { queueDeliveries, type DeliveryRequest } from "./delivery";
import type { Session } from "./session";

/** Admins, with whatever phone number is on their profile. */
async function adminPhones(tx: Tx, companyId: string): Promise<(string | null)[]> {
  const rows = await tx
    .select({ phone: profiles.phone })
    .from(companyMembers)
    .innerJoin(profiles, eq(profiles.id, companyMembers.userId))
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.role, "admin"),
        eq(companyMembers.isActive, true),
      ),
    );
  return rows.map((row) => row.phone);
}

/**
 * The phone number of whoever each of these parties is assigned to — R5.6.
 *
 * One statement for the whole batch rather than one per customer: the caller
 * already holds every party that crossed a band this morning.
 */
async function assignedPhones(
  tx: Tx,
  companyId: string,
  partyIds: readonly string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (partyIds.length === 0) return found;

  const rows = await tx
    .select({ partyId: parties.id, phone: profiles.phone })
    .from(parties)
    .innerJoin(profiles, eq(profiles.id, parties.assignedTo))
    .where(and(eq(parties.companyId, companyId), inArray(parties.id, [...partyIds])));

  for (const row of rows) if (row.phone) found.set(row.partyId, row.phone);
  return found;
}

/** Entry types that are worth telling the customer about. */
const CUSTOMER_FACING: ReadonlySet<TransactionType> = new Set([
  "sale",
  "customer_payment",
]);

export interface TransactionDeliveryArgs {
  transactionId: string;
  voucherNo: string;
  type: TransactionType;
  partyId?: string | undefined;
  total: Money;
  paid: Money;
  newDue: Money;
}

/** The party, the admins and the company's own name, in one statement. */
interface RecipientRow extends Record<string, unknown> {
  party: { name: string; phone: string | null } | null;
  admins: (string | null)[] | null;
  company_name: string | null;
}

/**
 * The two posting-driven events, queued inside the posting transaction.
 *
 * Inside, so an entry that rolls back leaves no message claiming it happened.
 * Nothing is sent from here — `flushDeliveries` does that after the commit.
 */
export async function queueTransactionDeliveries(
  tx: Tx,
  session: Session,
  args: TransactionDeliveryArgs,
): Promise<void> {
  const requests: DeliveryRequest[] = [];
  const entity = { entityType: "transaction", entityId: args.transactionId };

  // One statement, not three. Every statement inside the posting transaction is
  // a serial round trip, and this one runs on the save path of every entry.
  const rows = (await tx.execute<RecipientRow>(sql`
    select
      ${args.partyId ? sql`(select json_build_object('name', p.name, 'phone', p.phone)
          from parties p
         where p.id = ${args.partyId}::uuid
           and p.company_id = ${session.companyId}::uuid)` : sql`null::json`} as party,

      (select coalesce(json_agg(pr.phone), '[]'::json)
         from company_members cm
         join profiles pr on pr.id = cm.user_id
        where cm.company_id = ${session.companyId}::uuid
          and cm.role = 'admin'
          and cm.is_active) as admins,

      (select coalesce(c.name_bn, c.name)
         from companies c where c.id = ${session.companyId}::uuid) as company_name
  `)) as unknown as RecipientRow[];

  const row = rows[0];
  const party = row?.party ?? null;
  const companyName = row?.company_name ?? "";

  // → the customer: an entry was recorded in their name.
  if (party && CUSTOMER_FACING.has(args.type)) {
    requests.push({
      template: "entryRecorded",
      phone: party.phone,
      params: [
        companyName,
        formatMoney(args.total),
        formatMoney(args.newDue),
        args.voucherNo,
      ],
      ...entity,
    });
  }

  // → the admins: money came in from a customer.
  if (args.type === "customer_payment" && party) {
    for (const phone of row?.admins ?? []) {
      requests.push({
        template: "paymentReceived",
        phone,
        params: [party.name, formatMoney(args.paid), args.voucherNo],
        ...entity,
      });
    }
  }

  await queueDeliveries(tx, session, requests);
}

/**
 * Has this exact thing already been queued today?
 *
 * The scheduled events below have no natural key of their own — "the summary
 * for the 23rd" is not a row anywhere — so the guard is the delivery log
 * itself: same template, same subject, same calendar day.
 *
 * The day is **Dhaka's**, not the database's. `created_at` is a timestamptz and
 * a bare `::date` renders it in the session's time zone, which is UTC on a
 * hosted Postgres — so between midnight and 6 a.m. local it lands on yesterday
 * and never matches the `todayIso()` the caller passed. The guard then silently
 * never fires, and a cron that retried sent the summary again. Same UTC-vs-
 * Dhaka trap `calendar.ts` was written for.
 */
async function alreadyQueuedToday(
  tx: Tx,
  companyId: string,
  template: string,
  entityId: string | null,
  today: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: messageDeliveries.id })
    .from(messageDeliveries)
    .where(
      and(
        eq(messageDeliveries.companyId, companyId),
        eq(messageDeliveries.template, template),
        entityId
          ? eq(messageDeliveries.entityId, entityId)
          : sql`${messageDeliveries.entityId} is null`,
        sql`(${messageDeliveries.createdAt} at time zone ${BUSINESS_TIME_ZONE})::date = ${today}::date`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export interface DailySummaryArgs {
  date: string;
  sales: Money;
  collected: Money;
  outstanding: Money;
}

/** The day's totals to every admin. Needs a daily trigger; see the note above. */
export async function queueDailySummary(
  session: Session,
  args: DailySummaryArgs,
): Promise<number> {
  return withTenant(session, async (tx) => {
    if (
      await alreadyQueuedToday(tx, session.companyId, "dailySummary", null, args.date)
    ) {
      return 0;
    }

    const requests: DeliveryRequest[] = (await adminPhones(tx, session.companyId)).map(
      (phone) => ({
        template: "dailySummary" as const,
        phone,
        params: [
          args.date,
          formatMoney(args.sales),
          formatMoney(args.collected),
          formatMoney(args.outstanding),
        ],
      }),
    );

    await queueDeliveries(tx, session, requests);
    return requests.length;
  });
}

/**
 * R5.6 — the follow-up reminder, for customers who crossed into yellow or red
 * *today*.
 *
 * Today's crossings only, not the standing list: the standing list is what the
 * health screen is for, and sending it every morning would train everyone to
 * ignore the messages inside a week.
 *
 * Spec R5.6 addresses this to "the assigned sales person" — `parties.assigned_to`.
 * Most parties have nobody assigned, and a reminder addressed to no one is
 * worse than one addressed to the admins, so the admins are the fallback rather
 * than the rule. When somebody *is* assigned they get it **as well as** the
 * admins, not instead of them: the spec's own table says "assigned sales person
 * + admin".
 */
export async function queueAtRiskReminders(
  session: Session,
  options: { today?: string } = {},
): Promise<number> {
  const today = options.today ?? todayIso();
  const alerts = dailyAlertsFrom(await getCustomerHealth(session, { today }));
  const crossed = [...alerts.enteredDoubtful, ...alerts.enteredCritical];
  if (crossed.length === 0) return 0;

  return withTenant(session, async (tx) => {
    const admins = await adminPhones(tx, session.companyId);
    const assignees = await assignedPhones(
      tx,
      session.companyId,
      crossed.map((c) => c.partyId),
    );

    const requests: DeliveryRequest[] = [];
    for (const customer of crossed) {
      if (
        await alreadyQueuedToday(
          tx,
          session.companyId,
          "customerAtRisk",
          customer.partyId,
          today,
        )
      ) {
        continue;
      }

      // The rep who owns this customer, plus the admins. Deduplicated by
      // number, because the admin who assigned the account to themselves
      // should not get told twice.
      const recipients = new Set<string>();
      const assigned = assignees.get(customer.partyId);
      if (assigned) recipients.add(assigned);
      for (const phone of admins) if (phone) recipients.add(phone);

      for (const phone of recipients) {
        requests.push({
          template: "customerAtRisk",
          locale: DEFAULT_LOCALE,
          phone,
          params: [
            customer.name,
            String(customer.daysSince ?? 0),
            formatMoney(customer.receivable),
          ],
          entityType: "party",
          entityId: customer.partyId,
        });
      }
    }

    await queueDeliveries(tx, session, requests);
    return requests.length;
  });
}
