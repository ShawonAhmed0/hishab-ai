/**
 * বিজ্ঞপ্তি — spec §20 asks for useful alerts, not a feed.
 *
 * There are two kinds here, and the difference matters more than it looks.
 *
 * **Alerts are states.** "স্টক কমে গেছে" is true exactly while the stock is
 * low, and it stops being true the moment a purchase lands. Writing that into
 * a table would create the same divergence every other cache in this codebase
 * has already caused once — a row insisting the flour ran out while
 * `product_stock` says it was restocked on Tuesday. So alerts are derived on
 * read, in one query, and there is nothing to go stale.
 *
 * **Notifications are events.** "এই ভাউচারে গড় ক্রয়মূল্য শূন্য ছিল" happened
 * at a particular moment to a particular voucher and stays true afterwards.
 * That is worth storing, and it is what the `notifications` table holds. They
 * come from the engine's own warnings, so nothing here re-derives a judgement
 * the engine already made.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  notifications,
  tenantQuery,
  tenantRead,
  withTenant,
  type Transaction as Tx,
} from "@hishabai/db";
import { warningMessageBn, type PostingWarning } from "@hishabai/accounting";
import { formatMoney, formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { type Session, type TenantScope } from "./session";

export type AlertKind = "low_stock" | "overdue_due" | "negative_wallet";

export interface Alert {
  kind: AlertKind;
  severity: "info" | "warning" | "critical";
  titleBn: string;
  bodyBn: string;
  /** Where clicking it should go. */
  href: string;
}

export interface NotificationRow {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  titleBn: string;
  bodyBn: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  isRead: boolean;
}

export interface NotificationsView {
  alerts: Alert[];
  notifications: NotificationRow[];
  /** Alerts plus unread stored rows — what the bell shows. */
  badgeCount: number;
}

/** Anything older than this is what "বকেয়া অনেক দিনের" means here. */
const OVERDUE_DAYS = 30;

interface AlertSource {
  low_stock: { nameBn: string; quantity: string; unitSymbol: string; minStock: string }[] | null;
  overdue: { name: string; amount: string; partyId: string }[] | null;
  negative_wallets: { nameBn: string; balance: string }[] | null;
  stored: NotificationRow[] | null;
  unread: number | null;
}

export async function getNotifications(scope: TenantScope): Promise<NotificationsView> {
  const rows = await tenantRead<AlertSource>(
    scope,
    tenantQuery`
      select
        (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
          select p.name_bn as "nameBn", coalesce(ps.quantity, 0)::text as quantity,
                 u.symbol as "unitSymbol", p.min_stock_level::text as "minStock"
            from products p
            join units u on u.id = p.unit_id
            left join product_stock ps
              on ps.product_id = p.id and ps.company_id = p.company_id
           where p.company_id = app.current_company_id()
             and p.is_active
             and p.min_stock_level > 0
             and coalesce(ps.quantity, 0) <= p.min_stock_level
           limit 20
        ) t) as low_stock,

        -- Derived from the journal, never from transactions.due_amount, which
        -- is a posting-time snapshot and would age every bill as unpaid.
        (select coalesce(json_agg(t order by t.amount desc), '[]'::json) from (
          select pt.id as "partyId", pt.name,
                 sum(jl.debit - jl.credit)::text as amount
            from journal_lines jl
            join accounts a on a.id = jl.account_id
            join parties pt on pt.id = jl.party_id
           where jl.company_id = app.current_company_id()
             and a.subtype = 'receivable'
             and jl.date <= current_date - ${OVERDUE_DAYS}
           group by pt.id, pt.name
          having sum(jl.debit - jl.credit) > 0
           limit 10
        ) t) as overdue,

        (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
          select name_bn as "nameBn", balance::text as balance
            from financial_accounts
           where company_id = app.current_company_id() and is_active and balance < 0
        ) t) as negative_wallets,

        (select coalesce(json_agg(t order by t."createdAt" desc), '[]'::json) from (
          select id, type, severity::text as severity,
                 title_bn as "titleBn", body_bn as "bodyBn",
                 entity_type as "entityType", entity_id as "entityId",
                 created_at::text as "createdAt",
                 read_at is not null as "isRead"
            from notifications
           where company_id = app.current_company_id()
             and (user_id is null or user_id = app.current_user_id())
           order by created_at desc
           limit 30
        ) t) as stored,

        (select count(*)::int from notifications
          where company_id = app.current_company_id()
            and (user_id is null or user_id = app.current_user_id())
            and read_at is null) as unread
    `,
  );

  const source = rows[0];
  const alerts: Alert[] = [];

  // Every figure below crosses from the database's own text into something a
  // shopkeeper reads, so it goes through the formatters rather than being
  // interpolated raw — `90.000000 kg` is a column, not a sentence.
  for (const row of source?.low_stock ?? []) {
    alerts.push({
      kind: "low_stock",
      severity: "warning",
      titleBn: `${row.nameBn} — স্টক কমে গেছে`,
      bodyBn: `এখন ${formatQty(qtyFromDb(row.quantity), { unit: row.unitSymbol })}, সর্বনিম্ন ${formatQty(qtyFromDb(row.minStock), { unit: row.unitSymbol })}`,
      href: "/inventory?lowOnly=1",
    });
  }

  for (const row of source?.overdue ?? []) {
    alerts.push({
      kind: "overdue_due",
      severity: "warning",
      titleBn: `${row.name} — ${OVERDUE_DAYS} দিনের বেশি বকেয়া`,
      bodyBn: `বকেয়া ${formatMoney(moneyFromDb(row.amount))}`,
      href: `/customers/${row.partyId}`,
    });
  }

  // A wallet cannot really hold less than nothing, so this is a data problem
  // rather than a business one — usually a payment entered before its receipt.
  for (const row of source?.negative_wallets ?? []) {
    alerts.push({
      kind: "negative_wallet",
      severity: "critical",
      titleBn: `${row.nameBn} — ব্যালেন্স ঋণাত্মক`,
      bodyBn: `${formatMoney(moneyFromDb(row.balance))} — কোনো এন্ট্রি বাদ পড়েছে কি না দেখুন`,
      href: "/reports/cash-book",
    });
  }

  const stored = source?.stored ?? [];
  return {
    alerts,
    notifications: stored,
    badgeCount: alerts.length + (source?.unread ?? 0),
  };
}

export async function markNotificationRead(
  session: Session,
  notificationId: string,
): Promise<void> {
  await withTenant(session, async (tx) => {
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.companyId, session.companyId),
        ),
      );
  });
}

export async function markAllNotificationsRead(session: Session): Promise<void> {
  await withTenant(session, async (tx) => {
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.companyId, session.companyId),
          isNull(notifications.readAt),
          sql`(${notifications.userId} is null or ${notifications.userId} = ${session.userId}::uuid)`,
        ),
      );
  });
}

/**
 * The engine's warnings, kept.
 *
 * `postTransaction` already decides when something is worth flagging — stock
 * going negative, an issue costed at zero. Those are shown once in a toast and
 * would otherwise be gone, which is exactly the wrong fate for "this voucher's
 * cost of goods is a guess". Written inside the posting transaction, so a
 * rolled-back entry leaves no notification behind.
 */
export async function recordPostingWarnings(
  tx: Tx,
  session: Session,
  options: { transactionId: string; voucherNo: string; warnings: readonly PostingWarning[] },
): Promise<void> {
  if (options.warnings.length === 0) return;

  await tx.insert(notifications).values(
    options.warnings.map((warning) => ({
      companyId: session.companyId,
      // Company-wide: whoever is looking at the books next needs to know, not
      // only the operator who happened to be at the keyboard.
      userId: null,
      type: warning.code,
      severity: "warning" as const,
      titleBn: `${options.voucherNo} — খেয়াল করুন`,
      bodyBn: warningMessageBn(warning),
      entityType: "transaction",
      entityId: options.transactionId,
      // The reason travels with the row, so a later reader can render it in
      // their own language instead of the one the writer happened to be in.
      metadata: { ...warning.reason, ...(warning.details ?? {}) },
    })),
  );
}
