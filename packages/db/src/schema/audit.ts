import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, nullableAt, primaryId } from "./columns";
import {
  auditActionEnum,
  deliveryChannelEnum,
  deliveryStatusEnum,
  notificationSeverityEnum,
} from "./enums";
import { companies, profiles } from "./tenancy";

/**
 * Append-only. Answers spec §18 — কে তৈরি করেছে, কখন, কী বদলেছে — for anything
 * that touches money, including the things that never reach the journal such
 * as an edited credit limit.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.id),
    action: auditActionEnum("action").notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: uuid("entity_id"),
    /** Human-readable summary in Bengali, so the log is readable without joins. */
    summaryBn: text("summary_bn"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipAddress: varchar("ip_address", { length: 60 }),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_company_idx").on(table.companyId, table.createdAt),
    index("audit_logs_entity_idx").on(table.companyId, table.entityType, table.entityId),
  ],
);

/** Deliberately sparse — spec §20 asks for useful alerts, not a feed. */
export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Null means everyone in the company sees it. */
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 60 }).notNull(),
    severity: notificationSeverityEnum("severity").notNull().default("info"),
    titleBn: varchar("title_bn", { length: 200 }).notNull(),
    bodyBn: text("body_bn"),
    entityType: varchar("entity_type", { length: 60 }),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    readAt: nullableAt("read_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("notifications_company_idx").on(table.companyId, table.createdAt),
    index("notifications_unread_idx").on(table.companyId, table.userId, table.readAt),
  ],
);

/**
 * Spec R4.6 — every WhatsApp message this app tried to send, and what came of
 * it.
 *
 * A queue and a log in one table, which is the right shape here: the volume is
 * a handful of rows per entry, the retry needs the attempt count anyway, and a
 * separate log would only ever be joined back to the queue row it came from.
 *
 * Rows are written **inside** the posting transaction and sent **after** it
 * commits. Both halves of that matter and they pull in opposite directions:
 * queueing inside means an entry that rolls back leaves no message claiming it
 * happened, and sending outside means Meta being down cannot roll back a sale.
 */
export const messageDeliveries = pgTable(
  "message_deliveries",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    channel: deliveryChannelEnum("channel").notNull().default("whatsapp"),
    /** The template key, which maps to a name registered with Meta. */
    template: varchar("template", { length: 60 }).notNull(),
    /** Which language variant of that template to ask Meta for. */
    locale: varchar("locale", { length: 5 }).notNull().default("bn"),
    /** E.164 without the plus, which is what the Cloud API takes. */
    recipient: varchar("recipient", { length: 20 }).notNull(),
    /** The positional `{{n}}` parameters, already formatted. */
    params: jsonb("params").notNull().default(sql`'[]'::jsonb`),
    /** The rendered sentence, so the log is readable without the template. */
    preview: text("preview"),
    status: deliveryStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Meta's own id for the message, once they have accepted it. */
    providerMessageId: varchar("provider_message_id", { length: 120 }),
    entityType: varchar("entity_type", { length: 60 }),
    entityId: uuid("entity_id"),
    createdAt: createdAt(),
    sentAt: nullableAt("sent_at"),
  },
  (table) => [
    // The sender's only query: what is still owed a send, oldest first.
    index("message_deliveries_pending_idx").on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    index("message_deliveries_entity_idx").on(
      table.companyId,
      table.entityType,
      table.entityId,
    ),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type MessageDelivery = typeof messageDeliveries.$inferSelect;
