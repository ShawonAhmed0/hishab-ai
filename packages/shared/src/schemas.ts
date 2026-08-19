/**
 * Validation shared by the browser form and the server.
 *
 * The discriminated union is how spec §7's "required fields must depend
 * intelligently on transaction type" is actually enforced: a sale without
 * lines, or an expense without a খাত, cannot be represented at all — not on
 * the client, and more importantly not at the server boundary either.
 */
import { z } from "zod";
import { normalizeDigits, parseFixed } from "./decimal";
import { DISCOUNT_TYPES, TRANSACTION_SOURCES } from "./types";

/**
 * Validation messages are *keys*, not sentences — spec R4.5.
 *
 * These schemas are module-scope constants, so a resolved sentence here would
 * freeze whichever language served the process's first request into every
 * later one. That is the `NAV_ITEMS` mistake, and CLAUDE.md names zod schemas
 * as the place it comes back. `validationMessage` resolves a key against the
 * dictionary the request is actually being served in.
 */
const V = {
  addProduct: "validation.addProduct",
  addMaterial: "validation.addMaterial",
  addOneMaterial: "validation.addOneMaterial",
  addOutput: "validation.addOutput",
  choosePaymentMethod: "validation.choosePaymentMethod",
  chooseOne: "validation.chooseOne",
  twoAccounts: "validation.twoAccounts",
  nameRequired: "validation.nameRequired",
  companyNameRequired: "validation.companyNameRequired",
  productNameRequired: "validation.productNameRequired",
  categoryNameRequired: "validation.categoryNameRequired",
  unitNameRequired: "validation.unitNameRequired",
  abbreviationRequired: "validation.abbreviationRequired",
  dateInvalid: "validation.dateInvalid",
  numberInvalid: "validation.numberInvalid",
  mustBePositive: "validation.mustBePositive",
  notNegative: "validation.notNegative",
  phoneInvalid: "validation.phoneInvalid",
  pinInvalid: "validation.pinInvalid",
  required: "validation.required",
} as const;

/**
 * zod's own messages are English, and the user may not be reading English.
 *
 * "Required" is by far the most common of them — every missing dropdown and
 * empty date produces one — so it is mapped to a key like everything else.
 * Anything rarer falls through to zod's default, which is a developer-facing
 * case rather than something a shopkeeper is meant to act on.
 *
 * Global because zod's error map is: the alternative is threading an
 * `errorMap` through every `.parse` call in the codebase, and forgetting one
 * is invisible until a user sees the wrong language.
 */
z.setErrorMap((issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type && issue.received === "undefined") {
    return { message: V.required };
  }
  return { message: ctx.defaultError };
});

/**
 * Every id the client sends is a uuid it picked from a dropdown, so the only
 * way this fails is an empty selection — and zod's own "Invalid uuid" is not
 * something to show a shopkeeper reading an all-Bengali screen.
 */
const uuid = z.string().uuid(V.chooseOne);

/** ISO calendar date, no time — a ledger date is a day, not an instant. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, V.dateInvalid)
  .refine((v) => !Number.isNaN(Date.parse(v)), V.dateInvalid);

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
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: V.numberInvalid });
        return;
      }
      if (options.min === "positive" && parsed <= 0n) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: V.mustBePositive,
        });
      }
      if (options.min === "nonNegative" && parsed < 0n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: V.notNegative });
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
  /**
   * Spec R3.4. What the "other cost" actually was, chosen from the chart of
   * accounts, and it *posts* there rather than decorating the entry:
   *
   *   - on a purchase it is expensed to this account instead of being
   *     capitalised into the goods, because "other" is by definition the
   *     bucket that is neither freight nor labour, and burying an unnamed lump
   *     in stock valuation is how stock value drifts from reality;
   *   - on a sale it is the income account the charge is billed to, instead of
   *     the generic অন্যান্য আয়.
   *
   * Left unset, both behave exactly as they did before — freight and labour
   * are untouched either way, since those are textbook product costs.
   */
  otherCostAccountId: uuid.optional(),
  /**
   * Spec R3.4. `discountType` says what `discount` means — a flat ৳ figure, or
   * a percentage of the subtotal that the *server* resolves. The client never
   * sends the resolved figure: a browser that computed 10% of the wrong
   * subtotal would otherwise have its answer believed.
   */
  discountType: z.enum(DISCOUNT_TYPES).default("amount"),
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
  lines: z.array(lineInputSchema).min(1, V.addProduct),
  payments: z.array(paymentInputSchema).default([]),
});

const purchaseSchema = z.object({
  ...baseFields,
  ...tradeCosts,
  type: z.literal("purchase"),
  partyId: uuid,
  lines: z.array(lineInputSchema).min(1, V.addProduct),
  payments: z.array(paymentInputSchema).default([]),
});

const incomeSchema = z.object({
  ...baseFields,
  type: z.literal("income"),
  /** খাত — an income account from the company's chart. */
  categoryAccountId: uuid,
  partyId: uuid.optional(),
  payments: z.array(paymentInputSchema).min(1, V.choosePaymentMethod),
});

const expenseSchema = z.object({
  ...baseFields,
  type: z.literal("expense"),
  categoryAccountId: uuid,
  partyId: uuid.optional(),
  payments: z.array(paymentInputSchema).min(1, V.choosePaymentMethod),
});

const customerPaymentSchema = z.object({
  ...baseFields,
  type: z.literal("customer_payment"),
  partyId: uuid,
  payments: z.array(paymentInputSchema).min(1, V.choosePaymentMethod),
});

const vendorPaymentSchema = z.object({
  ...baseFields,
  type: z.literal("vendor_payment"),
  partyId: uuid,
  payments: z.array(paymentInputSchema).min(1, V.choosePaymentMethod),
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
  inputs: z.array(lineInputSchema.omit({ rate: true })).min(1, V.addMaterial),
  outputs: z.array(productionOutputSchema).min(1, V.addOutput),
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
  adjustments: z.array(stockAdjustmentLineSchema).min(1, V.addProduct),
});

const saleReturnSchema = z.object({
  ...baseFields,
  type: z.literal("sale_return"),
  partyId: uuid,
  lines: z.array(lineInputSchema).min(1, V.addProduct),
  /** Cash refunded now; anything else reduces the customer's due. */
  payments: z.array(paymentInputSchema).default([]),
  originalTransactionId: uuid.optional(),
});

const purchaseReturnSchema = z.object({
  ...baseFields,
  type: z.literal("purchase_return"),
  partyId: uuid,
  lines: z.array(lineInputSchema).min(1, V.addProduct),
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
  entries: z.array(journalLineInputSchema).min(2, V.twoAccounts),
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
  name: z.string().trim().min(1, V.nameRequired).max(160),
  type: z.enum(["customer", "vendor", "both"]),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?880|0)1[3-9]\d{8}$/, V.phoneInvalid)
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(400).optional(),
  openingBalance: signedMoneyString.default("0"),
  creditLimit: moneyString.optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type PartyInput = z.infer<typeof partyInputSchema>;

export const productInputSchema = z.object({
  nameBn: z.string().trim().min(1, V.productNameRequired).max(160),
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
  name: z.string().trim().min(1, V.companyNameRequired).max(160),
  nameBn: z.string().trim().max(160).optional(),
  businessType: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(400).optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(7),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const financialAccountInputSchema = z.object({
  kind: z.enum(["cash", "bank", "mfs"]),
  nameBn: z.string().trim().min(1, V.nameRequired).max(120),
  bankName: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().max(60).optional(),
  mfsProvider: z.enum(["bkash", "nagad", "rocket", "upay", "other"]).optional(),
  openingBalance: moneyString.default("0"),
});
export type FinancialAccountInput = z.infer<typeof financialAccountInputSchema>;

export const unitInputSchema = z.object({
  nameBn: z.string().trim().min(1, V.unitNameRequired).max(60),
  symbol: z.string().trim().min(1, V.abbreviationRequired).max(20),
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
  nameBn: z.string().trim().min(1, V.categoryNameRequired).max(160),
});
export type CategoryAccountInput = z.infer<typeof categoryAccountInputSchema>;

export const productCategoryInputSchema = z.object({
  nameBn: z.string().trim().min(1, V.nameRequired).max(120),
});
export type ProductCategoryInput = z.infer<typeof productCategoryInputSchema>;

/**
 * A standing recipe: what one batch of a product takes to make.
 *
 * It carries no prices. Cost is whatever the raw materials happen to be worth
 * on the day the batch runs, which only the ledger knows — a recipe that
 * remembered a rate would be quoting a stale one within a week.
 */
export const recipeInputSchema = z.object({
  outputProductId: uuid,
  nameBn: z.string().trim().max(160).optional(),
  /** 90 for the 450-out-of-500 case. Advisory: nothing enforces the yield. */
  expectedYieldPercent: moneyString.optional(),
  notes: z.string().trim().max(1000).optional(),
  inputs: z
    .array(
      z.object({
        productId: uuid,
        quantityPerUnit: positiveQtyString,
      }),
    )
    .min(1, V.addOneMaterial),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

/**
 * The override PIN — spec R1.2.
 *
 * Digits only, and Bengali numerals are normalised first: the shopkeeper who
 * set "১২৩৪" on a Bengali keyboard and types "1234" on an English one is the
 * same person with the same PIN.
 *
 * Four is the shortest that is worth anything and twelve is longer than anyone
 * will type at a counter. There is no message about *which* rule it failed —
 * the field never says more than V.pinInvalid, on purpose.
 */
export const overridePinSchema = z
  .string()
  .transform((value) => normalizeDigits(value.trim()))
  .refine((value) => /^\d{4,12}$/.test(value), V.pinInvalid);

export const overrideRequestSchema = z.object({ pin: overridePinSchema });
export type OverrideRequestInput = z.infer<typeof overrideRequestSchema>;

/**
 * The company's own rules — spec R4.1 and R5.2.
 *
 * Kept in `companies.settings` rather than in columns: these are knobs a
 * business turns once, not facts about it, and every one of them has a working
 * default. Anything absent stays at that default rather than being cleared.
 */
export const companyPolicySchema = z.object({
  lockedBefore: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, V.dateInvalid)
    .optional()
    .or(z.literal("")),
  lockPriorMonths: z.boolean().default(false),
  creditPeriodDays: z.number().int().min(0).max(3650).default(0),
  slowPayerDays: z.number().int().min(1).max(3650).default(30),
  riskyDays: z.number().int().min(1).max(3650).default(60),
});
export type CompanyPolicyInput = z.infer<typeof companyPolicySchema>;
