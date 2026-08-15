import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { ZERO_NUMERIC, createdAt, moneyColumn, primaryId, updatedAt } from "./columns";
import {
  accountSubtypeEnum,
  accountTypeEnum,
  financialAccountKindEnum,
  mfsProviderEnum,
} from "./enums";
import { companies } from "./tenancy";

/**
 * The chart of accounts. Seeded automatically per company and almost never
 * shown to the user — spec §26 is explicit that nobody should need to
 * understand accounting to use this product. The engine addresses rows by
 * `subtype`, so a company can rename or add accounts freely.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 20 }).notNull(),
    nameBn: varchar("name_bn", { length: 160 }).notNull(),
    nameEn: varchar("name_en", { length: 160 }),
    type: accountTypeEnum("type").notNull(),
    subtype: accountSubtypeEnum("subtype").notNull(),
    parentId: uuid("parent_id"),
    /** System accounts back the posting rules and cannot be deleted. */
    isSystem: boolean("is_system").notNull().default(false),
    /** Selectable as a খাত on নতুন এন্ট্রি. */
    isCategory: boolean("is_category").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("accounts_company_code_idx").on(table.companyId, table.code),
    index("accounts_company_subtype_idx").on(table.companyId, table.subtype),
    index("accounts_category_idx").on(table.companyId, table.isCategory),
  ],
);

/**
 * The user-facing পেমেন্ট মাধ্যম: নগদ, a named bank account, a bKash wallet.
 * Each one has its own running balance and its own general-ledger account, so
 * "which drawer did this come out of" is answerable without a report.
 */
export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    kind: financialAccountKindEnum("kind").notNull(),
    nameBn: varchar("name_bn", { length: 120 }).notNull(),
    bankName: varchar("bank_name", { length: 120 }),
    accountNumber: varchar("account_number", { length: 60 }),
    mfsProvider: mfsProviderEnum("mfs_provider"),
    openingBalance: moneyColumn("opening_balance").notNull().default(ZERO_NUMERIC),
    /** Maintained by trigger inside the posting transaction. */
    balance: moneyColumn("balance").notNull().default(ZERO_NUMERIC),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: varchar("sort_order", { length: 10 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("financial_accounts_company_idx").on(table.companyId, table.isActive),
  ],
);

/**
 * Running balance per account, kept current by trigger rather than computed on
 * read. The dashboard has nine tiles on it; none of them should be aggregating
 * the whole journal to render.
 */
export const accountBalances = pgTable(
  "account_balances",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    debitTotal: moneyColumn("debit_total").notNull().default(ZERO_NUMERIC),
    creditTotal: moneyColumn("credit_total").notNull().default(ZERO_NUMERIC),
    /** Signed by the account's normal balance, so it reads the way people expect. */
    balance: moneyColumn("balance").notNull().default(ZERO_NUMERIC),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("account_balances_pk").on(table.companyId, table.accountId),
  ],
);

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  company: one(companies, {
    fields: [accounts.companyId],
    references: [companies.id],
  }),
  children: many(accounts),
}));

export type Account = typeof accounts.$inferSelect;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type AccountBalance = typeof accountBalances.$inferSelect;
