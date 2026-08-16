/**
 * Validation shared by the browser form and the server.
 *
 * The discriminated union is how spec §7's "required fields must depend
 * intelligently on transaction type" is actually enforced: a sale without
 * lines, or an expense without a খাত, cannot be represented at all — not on
 * the client, and more importantly not at the server boundary either.
 */
import { z } from "zod";
import { parseFixed } from "./decimal";
import { TRANSACTION_SOURCES } from "./types";

const uuid = z.string().uuid();

/** ISO calendar date, no time — a ledger date is a day, not an instant. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "তারিখ সঠিক নয়")
  .refine((v) => !Number.isNaN(Date.parse(v)), "তারিখ সঠিক নয়");

/**
 * Amounts stay strings all the way to the engine. Parsing to a number here
 * would defeat the whole point of the fixed-point layer.
 */
function decimalString(options: { min?: "positive" | "nonNegative"; scale: number }) {
  return z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .superRefine((value, ctx) => {
      let parsed: bigint;
      try {
        parsed = parseFixed(value, options.scale);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "সংখ্যাটি সঠিক নয়" });
        return;
      }
      if (options.min === "positive" && parsed <= 0n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "শূন্যের চেয়ে বড় সংখ্যা দিন",
        });
      }
      if (options.min === "nonNegative" && parsed < 0n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ঋণাত্মক হতে পারে না" });
      }
    });
}

export const moneyString = decimalString({ min: "nonNegative", scale: 4 });
export const positiveMoneyString = decimalString({ min: "positive", scale: 4 });
export const signedMoneyString = decimalString({ scale: 4 });
export const qtyString = decimalString({ min: "nonNegative", scale: 6 });
export const positiveQtyString = decimalString({ min: "positive", scale: 6 });
export const signedQtyString = decimalString({ scale: 6 });

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

export const paymentInputSchema = z.object({
  financialAccountId: uuid,
  amount: positiveMoneyString,
  /** কে টাকা গ্রহণ করেছে / প্রদান করেছে — spec §14. */
  handledByUserId: uuid.optional(),
  handledByName: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const lineInputSchema = z.object({
  productId: uuid,
  unitId: uuid,
  quantity: positiveQtyString,
  rate: moneyString,
  /** পিস — a secondary count kept alongside weight, e.g. 12 rolls of 500 KG. */
  pieces: qtyString.optional(),
  description: z.string().trim().max(300).optional(),
});
export type LineInput = z.infer<typeof lineInputSchema>;

const baseFields = {
  date: isoDate,
  memoNo: z.string().trim().max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  attachmentIds: z.array(uuid).max(10).default([]),
  source: z.enum(TRANSACTION_SOURCES).default("manual"),
};

const tradeCosts = {
  transportCost: moneyString.default("0"),
  laborCost: moneyString.default("0"),
  otherCost: moneyString.default("0"),
  discount: moneyString.default("0"),
};

// ---------------------------------------------------------------------------
// One variant per transaction type
// ---------------------------------------------------------------------------

const saleSchema = z.object({
  ...baseFields,
  ...tradeCosts,
  type: z.literal("sale"),
  partyId: uuid,
  lines: z.array(lineInputSchema).min(1, "অন্তত একটি পণ্য যোগ করুন"),
  payments: z.array(paymentInputSchema).default([]),
});

const purchaseSchema = z.object({
  ...baseFields,
  ...tradeCosts,
  type: z.literal("purchase"),
  partyId: uuid,
  lines: z.array(lineInputSchema).min(1, "অন্তত একটি পণ্য যোগ করুন"),
  payments: z.array(paymentInputSchema).default([]),
});

const incomeSchema = z.object({
  ...baseFields,
  type: z.literal("income"),
  /** খাত — an income account from the company's chart. */
  categoryAccountId: uuid,
  partyId: uuid.optional(),
  payments: z.array(paymentInputSchema).min(1, "পেমেন্ট মাধ্যম নির্বাচন করুন"),
});

const expenseSchema = z.object({
  ...baseFields,
  type: z.literal("expense"),
  categoryAccountId: uuid,
  partyId: uuid.optional(),
  payments: z.array(paymentInputSchema).min(1, "পেমেন্ট মাধ্যম নির্বাচন করুন"),
});

const customerPaymentSchema = z.object({
  ...baseFields,
  type: z.literal("customer_payment"),
  partyId: uuid,
  payments: z.array(paymentInputSchema).min(1, "পেমেন্ট মাধ্যম নির্বাচন করুন"),
});

const vendorPaymentSchema = z.object({
  ...baseFields,
  type: z.literal("vendor_payment"),
  partyId: uuid,
  payments: z.array(paymentInputSchema).min(1, "পেমেন্ট মাধ্যম নির্বাচন করুন"),
});

export const productionOutputSchema = z.object({
  productId: uuid,
  unitId: uuid,
  quantity: positiveQtyString,
  description: z.string().trim().max(300).optional(),
});

export const productionWastageSchema = z.object({
  productId: uuid,
  unitId: uuid,
  quantity: positiveQtyString,
  reason: z.string().trim().max(300).optional(),
});

const productionSchema = z.object({
  ...baseFields,
  type: z.literal("production"),
  inputs: z.array(lineInputSchema.omit({ rate: true })).min(1, "কাঁচামাল যোগ করুন"),
  outputs: z.array(productionOutputSchema).min(1, "উৎপাদিত পণ্য যোগ করুন"),
  wastage: z.array(productionWastageSchema).default([]),
  /** Conversion costs to capitalise into the finished goods. */
  laborCost: moneyString.default("0"),
  otherCost: moneyString.default("0"),
  payments: z.array(paymentInputSchema).default([]),
});

export const stockAdjustmentLineSchema = z.object({
  productId: uuid,
  unitId: uuid,
  /** Counted quantity. The engine derives the delta from current stock. */
  countedQuantity: qtyString,
  reason: z.string().trim().max(300).optional(),
});

const stockAdjustmentSchema = z.object({
  ...baseFields,
  type: z.literal("stock_adjustment"),
  adjustments: z.array(stockAdjustmentLineSchema).min(1, "অন্তত একটি পণ্য যোগ করুন"),
});

const saleReturnSchema = z.object({
  ...baseFields,
  type: z.literal("sale_return"),
  partyId: uuid,
  lines: z.array(lineInputSchema).min(1, "অন্তত একটি পণ্য যোগ করুন"),
  /** Cash refunded now; anything else reduces the customer's due. */
  payments: z.array(paymentInputSchema).default([]),
  originalTransactionId: uuid.optional(),
});

const purchaseReturnSchema = z.object({
  ...baseFields,
  type: z.literal("purchase_return"),
  partyId: uuid,
  lines: z.array(lineInputSchema).min(1, "অন্তত একটি পণ্য যোগ করুন"),
  payments: z.array(paymentInputSchema).default([]),
  originalTransactionId: uuid.optional(),
});

export const journalLineInputSchema = z.object({
  accountId: uuid,
  partyId: uuid.optional(),
  debit: moneyString.default("0"),
  credit: moneyString.default("0"),
  narration: z.string().trim().max(300).optional(),
});

/**
 * অন্যান্য is the escape hatch. It is still double-entry — the UI walks the
 * user through "কোথা থেকে" and "কোথায়" rather than showing Dr/Cr.
 */
const otherSchema = z.object({
  ...baseFields,
  type: z.literal("other"),
  partyId: uuid.optional(),
  entries: z.array(journalLineInputSchema).min(2, "অন্তত দুটি হিসাব লাগবে"),
});

export const transactionInputSchema = z.discriminatedUnion("type", [
  saleSchema,
  purchaseSchema,
  incomeSchema,
  expenseSchema,
  customerPaymentSchema,
  vendorPaymentSchema,
  productionSchema,
  stockAdjustmentSchema,
  saleReturnSchema,
  purchaseReturnSchema,
  otherSchema,
]);

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type SaleInput = z.infer<typeof saleSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type IncomeInput = z.infer<typeof incomeSchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;
export type VendorPaymentInput = z.infer<typeof vendorPaymentSchema>;
export type ProductionInput = z.infer<typeof productionSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;
export type OtherInput = z.infer<typeof otherSchema>;

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export const partyInputSchema = z.object({
  name: z.string().trim().min(1, "নাম দিন").max(160),
  type: z.enum(["customer", "vendor", "both"]),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?880|0)1[3-9]\d{8}$/, "মোবাইল নম্বর সঠিক নয়")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(400).optional(),
  openingBalance: signedMoneyString.default("0"),
  creditLimit: moneyString.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type PartyInput = z.infer<typeof partyInputSchema>;

export const productInputSchema = z.object({
  nameBn: z.string().trim().min(1, "পণ্যের নাম দিন").max(160),
  nameEn: z.string().trim().max(160).optional(),
  sku: z.string().trim().max(60).optional(),
  kind: z.enum(["raw_material", "finished_good", "service"]),
  categoryId: uuid.optional(),
  unitId: uuid,
  purchasePrice: moneyString.default("0"),
  salePrice: moneyString.default("0"),
  openingQuantity: qtyString.default("0"),
  openingRate: moneyString.default("0"),
  minStockLevel: qtyString.default("0"),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const companyInputSchema = z.object({
  name: z.string().trim().min(1, "কোম্পানির নাম দিন").max(160),
  nameBn: z.string().trim().max(160).optional(),
  businessType: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(400).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(7),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const financialAccountInputSchema = z.object({
  kind: z.enum(["cash", "bank", "mfs"]),
  nameBn: z.string().trim().min(1, "নাম দিন").max(120),
  bankName: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().max(60).optional(),
  mfsProvider: z.enum(["bkash", "nagad", "rocket", "upay", "other"]).optional(),
  openingBalance: moneyString.default("0"),
});
export type FinancialAccountInput = z.infer<typeof financialAccountInputSchema>;

export const unitInputSchema = z.object({
  nameBn: z.string().trim().min(1, "এককের নাম দিন").max(60),
  symbol: z.string().trim().min(1, "সংক্ষিপ্ত রূপ দিন").max(20),
  /** 3 suits কেজি; পিস should be 0 or the entry form offers decimals nobody wants. */
  decimalPlaces: z.coerce.number().int().min(0).max(6).default(3),
});
export type UnitInput = z.infer<typeof unitInputSchema>;

/**
 * A user-defined খাত. The subtype is fixed per side rather than offered:
 * choosing where an expense sits in the chart of accounts is exactly the
 * accounting knowledge spec §26 says nobody should need.
 */
export const categoryAccountInputSchema = z.object({
  type: z.enum(["income", "expense"]),
  nameBn: z.string().trim().min(1, "খাতের নাম দিন").max(160),
});
export type CategoryAccountInput = z.infer<typeof categoryAccountInputSchema>;

export const productCategoryInputSchema = z.object({
  nameBn: z.string().trim().min(1, "নাম দিন").max(120),
});
export type ProductCategoryInput = z.infer<typeof productCategoryInputSchema>;
