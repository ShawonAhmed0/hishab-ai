import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAt, primaryId, updatedAt } from "./columns";
import { roleEnum } from "./enums";

/**
 * Mirrors `auth.users`. Supabase owns identity; this row owns everything the
 * application needs to show about a person.
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  avatarUrl: text("avatar_url"),
  /** Last company the user looked at, so a return visit lands where they left. */
  lastCompanyId: uuid("last_company_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const companies = pgTable(
  "companies",
  {
    id: primaryId(),
    name: varchar("name", { length: 160 }).notNull(),
    nameBn: varchar("name_bn", { length: 160 }),
    businessType: varchar("business_type", { length: 80 }),
    phone: varchar("phone", { length: 30 }),
    address: text("address"),
    logoUrl: text("logo_url"),
    currency: varchar("currency", { length: 3 }).notNull().default("BDT"),
    /** July by default — the Bangladeshi fiscal year runs July–June. */
    fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(7),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("companies_active_idx").on(table.isActive)],
);

/**
 * The membership table is the whole access-control story: RLS derives every
 * company_id a session may touch from here, so a user with no row for a
 * company cannot see it by any route, API or SQL.
 */
export const companyMembers = pgTable(
  "company_members",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("operator"),
    /** Per-user overrides on top of the role's defaults. */
    permissions: jsonb("permissions").notNull().default(sql`'{}'::jsonb`),
    invitedBy: uuid("invited_by").references(() => profiles.id),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.companyId, table.userId] }),
    index("company_members_user_idx").on(table.userId),
  ],
);

/**
 * Voucher numbering. A dedicated row per (company, key) taken with
 * `FOR UPDATE` gives gap-free sequences per company — a real sequence would be
 * shared across tenants and leak volume between them.
 */
export const counters = pgTable(
  "counters",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 40 }).notNull(),
    value: integer("value").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.key] })],
);

export const companiesRelations = relations(companies, ({ many }) => ({
  members: many(companyMembers),
}));

export const companyMembersRelations = relations(companyMembers, ({ one }) => ({
  company: one(companies, {
    fields: [companyMembers.companyId],
    references: [companies.id],
  }),
  user: one(profiles, {
    fields: [companyMembers.userId],
    references: [profiles.id],
  }),
}));

export type Company = typeof companies.$inferSelect;
export type CompanyMember = typeof companyMembers.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
