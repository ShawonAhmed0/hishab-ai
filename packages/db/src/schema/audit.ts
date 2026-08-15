import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, nullableAt, primaryId } from "./columns";
import { auditActionEnum, notificationSeverityEnum } from "./enums";
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

export type AuditLog = typeof auditLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
