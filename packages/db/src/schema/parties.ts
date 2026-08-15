import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  ZERO_NUMERIC,
  createdAt,
  moneyColumn,
  nullableAt,
  primaryId,
  updatedAt,
} from "./columns";
import { partyTypeEnum } from "./enums";
import { companies, profiles } from "./tenancy";

/**
 * Customers and vendors in one table.
 *
 * In a Bangladeshi trading business the same mill regularly sells you jumbo
 * rolls and buys back finished stock. Two tables would mean two ledgers for
 * one relationship and a netting problem at statement time.
 */
export const parties = pgTable(
  "parties",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: partyTypeEnum("type").notNull().default("customer"),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 30 }),
    address: text("address"),
    notes: text("notes"),
    /** Positive means they owed us from before HishabAI. */
    openingBalance: moneyColumn("opening_balance").notNull().default(ZERO_NUMERIC),
    creditLimit: moneyColumn("credit_limit"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("parties_company_type_idx").on(table.companyId, table.type, table.isActive),
    index("parties_company_name_idx").on(table.companyId, table.name),
    index("parties_phone_idx").on(table.companyId, table.phone),
  ],
);

/**
 * Running receivable and payable per party, maintained by trigger alongside
 * the journal so the বকেয়া tiles and the customer list never aggregate.
 */
export const partyBalances = pgTable(
  "party_balances",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    /** What the customer owes us. */
    receivable: moneyColumn("receivable").notNull().default(ZERO_NUMERIC),
    /** What we owe the vendor. */
    payable: moneyColumn("payable").notNull().default(ZERO_NUMERIC),
    totalSales: moneyColumn("total_sales").notNull().default(ZERO_NUMERIC),
    totalPurchases: moneyColumn("total_purchases").notNull().default(ZERO_NUMERIC),
    totalReceived: moneyColumn("total_received").notNull().default(ZERO_NUMERIC),
    totalPaid: moneyColumn("total_paid").notNull().default(ZERO_NUMERIC),
    lastTransactionAt: nullableAt("last_transaction_at"),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("party_balances_pk").on(table.companyId, table.partyId),
    index("party_balances_receivable_idx").on(table.companyId, table.receivable),
  ],
);

export const partiesRelations = relations(parties, ({ one }) => ({
  company: one(companies, {
    fields: [parties.companyId],
    references: [companies.id],
  }),
  balance: one(partyBalances, {
    fields: [parties.id],
    references: [partyBalances.partyId],
  }),
}));

export type Party = typeof parties.$inferSelect;
export type PartyBalance = typeof partyBalances.$inferSelect;
