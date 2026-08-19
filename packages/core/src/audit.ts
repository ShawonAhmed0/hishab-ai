/**
 * The append-only record of who did what.
 *
 * Its own module rather than a function inside `transactions.ts`, because
 * everything writes one — recipes, settings, members, overrides — and the
 * override path is called *from* the posting path, which would otherwise be a
 * cycle between the two files.
 *
 * Always takes the caller's transaction: an audit row for an entry that rolls
 * back is a record of something that never happened.
 */
import { auditLogs, type Transaction as Tx } from "@hishabai/db";
import type { AuditAction } from "@hishabai/shared";
import type { Session } from "./session";

export async function writeAudit(
  tx: Tx,
  session: Session,
  entry: {
    action: AuditAction;
    entityType: string;
    entityId?: string;
    summaryBn?: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await tx.insert(auditLogs).values({
    companyId: session.companyId,
    userId: session.userId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summaryBn: entry.summaryBn ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
  });
}
