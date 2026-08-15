import { relations } from "drizzle-orm";
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
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
  occurredAt,
  primaryId,
  qtyColumn,
  updatedAt,
} from "./columns";
import {
  transactionSourceEnum,
  transactionStatusEnum,
  transactionTypeEnum,
} from "./enums";
import { accounts, financialAccounts } from "./ledger";
import { products, units } from "./inventory";
import { parties } from "./parties";
import { companies, profiles } from "./tenancy";

/**
 * One row per thing the user entered. Everything downstream — journal lines,
 * stock movements, payment records — hangs off this and is generated, never
 * typed.
 *
 * Rows are not deleted (spec §18). Cancelling sets `status = 'cancelled'` and
 * writes a reversing transaction that points back through `reversalOfId`.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    voucherNo: varchar("voucher_no", { length: 40 }).notNull(),
    type: transactionTypeEnum("type").notNull(),
    status: transactionStatusEnum("status").notNull().default("posted"),
    source: transactionSourceEnum("source").notNull().default("manual"),
    date: date("date").notNull(),
    partyId: uuid("party_id").references(() => parties.id),
    /** The খাত for আয় / ব্যয়. */
    categoryAccountId: uuid("category_account_id").references(() => accounts.id),
    memoNo: varchar("memo_no", { length: 60 }),
    description: text("description"),

    subtotal: moneyColumn("subtotal").notNull().default(ZERO_NUMERIC),
    transportCost: moneyColumn("transport_cost").notNull().default(ZERO_NUMERIC),
    laborCost: moneyColumn("labor_cost").notNull().default(ZERO_NUMERIC),
    otherCost: moneyColumn("other_cost").notNull().default(ZERO_NUMERIC),
    discount: moneyColumn("discount").notNull().default(ZERO_NUMERIC),
    total: moneyColumn("total").notNull().default(ZERO_NUMERIC),
    paidAmount: moneyColumn("paid_amount").notNull().default(ZERO_NUMERIC),
    dueAmount: moneyColumn("due_amount").notNull().default(ZERO_NUMERIC),

    /** Party due before this entry, frozen for the printed statement (spec §13). */
    previousDue: moneyColumn("previous_due").notNull().default(ZERO_NUMERIC),

    /** Set on the cancelling entry; points at what it undoes. */
    reversalOfId: uuid("reversal_of_id"),
    /** Set on the cancelled entry; points at the undo. */
    reversedById: uuid("reversed_by_id"),

    /** Raw voice/scan payload kept for auditing what the AI proposed. */
    aiMetadata: jsonb("ai_metadata"),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: createdAt(),
    updatedBy: uuid("updated_by").references(() => profiles.id),
    updatedAt: updatedAt(),
    cancelledBy: uuid("cancelled_by").references(() => profiles.id),
    cancelledAt: nullableAt("cancelled_at"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("transactions_company_voucher_idx").on(table.companyId, table.voucherNo),
    index("transactions_company_date_idx").on(table.companyId, table.date, table.status),
    index("transactions_company_type_idx").on(table.companyId, table.type, table.date),
    index("transactions_party_idx").on(table.companyId, table.partyId, table.date),
    index("transactions_memo_idx").on(table.companyId, table.memoNo),
  ],
);

export const transactionLines = pgTable(
  "transaction_lines",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    unitId: uuid("unit_id").references(() => units.id),
    description: text("description"),
    quantity: qtyColumn("quantity").notNull().default(ZERO_NUMERIC),
    /** পিস kept alongside weight — 12 rolls that together weigh 500 KG. */
    pieces: qtyColumn("pieces"),
    rate: moneyColumn("rate").notNull().default(ZERO_NUMERIC),
    amount: moneyColumn("amount").notNull().default(ZERO_NUMERIC),
    /** Landed cost after charges were spread over the lines. */
    allocatedCost: moneyColumn("allocated_cost").notNull().default(ZERO_NUMERIC),
    /** Which side of a production run this line belongs to. */
    role: varchar("role", { length: 20 }).notNull().default("item"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("transaction_lines_transaction_idx").on(table.transactionId),
    index("transaction_lines_product_idx").on(table.companyId, table.productId),
  ],
);

/** Answers spec §14: কে, কখন, কত টাকা, কোন মাধ্যমে, কোন লেনদেন থেকে. */
export const transactionPayments = pgTable(
  "transaction_payments",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    financialAccountId: uuid("financial_account_id")
      .notNull()
      .references(() => financialAccounts.id),
    amount: moneyColumn("amount").notNull(),
    /** 'in' money received, 'out' money paid. */
    direction: varchar("direction", { length: 3 }).notNull(),
    handledByUserId: uuid("handled_by_user_id").references(() => profiles.id),
    /** Free text for staff who do not have a login. */
    handledByName: varchar("handled_by_name", { length: 120 }),
    reference: varchar("reference", { length: 120 }),
    paidAt: occurredAt("paid_at"),
  },
  (table) => [
    index("transaction_payments_transaction_idx").on(table.transactionId),
    index("transaction_payments_account_idx").on(
      table.companyId,
      table.financialAccountId,
      table.paidAt,
    ),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    narration: text("narration"),
    /** Sequence within the company, for a stable ledger ordering. */
    sequence: bigint("sequence", { mode: "number" }),
    createdAt: createdAt(),
  },
  (table) => [index("journal_entries_company_date_idx").on(table.companyId, table.date)],
);

/**
 * The double-entry rows.
 *
 * A deferred constraint trigger checks that each entry's debits equal its
 * credits at commit time — the application already refuses to produce an
 * unbalanced entry, and this is the second lock on the same door.
 */
export const journalLines = pgTable(
  "journal_lines",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    partyId: uuid("party_id").references(() => parties.id),
    debit: moneyColumn("debit").notNull().default(ZERO_NUMERIC),
    credit: moneyColumn("credit").notNull().default(ZERO_NUMERIC),
    narration: text("narration"),
    date: date("date").notNull(),
  },
  (table) => [
    index("journal_lines_entry_idx").on(table.journalEntryId),
    index("journal_lines_account_idx").on(table.companyId, table.accountId, table.date),
    index("journal_lines_party_idx").on(table.companyId, table.partyId, table.date),
  ],
);

/** The original memo photo stays attached to the entry permanently (spec §16). */
export const attachments = pgTable(
  "attachments",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "cascade",
    }),
    storagePath: text("storage_path").notNull(),
    fileName: varchar("file_name", { length: 260 }),
    mimeType: varchar("mime_type", { length: 120 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    /** Populated by OCR; also feeds global search. */
    ocrText: text("ocr_text"),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("attachments_transaction_idx").on(table.transactionId),
    index("attachments_company_idx").on(table.companyId),
  ],
);

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  company: one(companies, {
    fields: [transactions.companyId],
    references: [companies.id],
  }),
  party: one(parties, {
    fields: [transactions.partyId],
    references: [parties.id],
  }),
  lines: many(transactionLines),
  payments: many(transactionPayments),
  journalLines: many(journalLines),
  attachments: many(attachments),
}));

export const transactionLinesRelations = relations(transactionLines, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionLines.transactionId],
    references: [transactions.id],
  }),
  product: one(products, {
    fields: [transactionLines.productId],
    references: [products.id],
  }),
}));

export type Transaction = typeof transactions.$inferSelect;
export type TransactionLine = typeof transactionLines.$inferSelect;
export type TransactionPayment = typeof transactionPayments.$inferSelect;
export type JournalLine = typeof journalLines.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;

