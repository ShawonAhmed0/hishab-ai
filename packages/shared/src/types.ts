/** Domain vocabulary shared by the engine, the database and the UI. */

export const ROLES = ["admin", "manager", "operator"] as const;
export type Role = (typeof ROLES)[number];

/**
 * What the user picks on নতুন এন্ট্রি.
 *
 * `রিটার্ন` is one choice in the UI but two here: a returned sale and a
 * returned purchase post to opposite sides, and the engine is not allowed to
 * guess which one was meant.
 */
export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "sale",
  "purchase",
  "customer_payment",
  "vendor_payment",
  "production",
  "stock_adjustment",
  "sale_return",
  "purchase_return",
  "other",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["posted", "cancelled"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** How the entry reached us — drives the audit trail and the review gate. */
export const TRANSACTION_SOURCES = ["manual", "voice", "scan", "import"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

// ---------------------------------------------------------------------------
// Chart of accounts
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * The engine addresses accounts by subtype, never by name or code, so a
 * company can rename its ledger without breaking posting rules.
 */
export const ACCOUNT_SUBTYPES = [
  "cash",
  "bank",
  "mfs",
  "receivable",
  "payable",
  "inventory",
  "fixed_asset",
  "accumulated_depreciation",
  "sales",
  "sales_return",
  "other_income",
  "cogs",
  "wastage",
  "operating_expense",
  "stock_adjustment",
  "capital",
  "drawings",
  "opening_balance_equity",
] as const;
export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[number];

export const NORMAL_BALANCE: Record<AccountType, "debit" | "credit"> = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  equity: "credit",
  income: "credit",
};

export const SUBTYPE_TO_TYPE: Record<AccountSubtype, AccountType> = {
  cash: "asset",
  bank: "asset",
  mfs: "asset",
  receivable: "asset",
  payable: "liability",
  inventory: "asset",
  fixed_asset: "asset",
  accumulated_depreciation: "asset",
  sales: "income",
  sales_return: "income",
  other_income: "income",
  cogs: "expense",
  wastage: "expense",
  operating_expense: "expense",
  stock_adjustment: "expense",
  capital: "equity",
  drawings: "equity",
  opening_balance_equity: "equity",
};

// ---------------------------------------------------------------------------
// Money movement
// ---------------------------------------------------------------------------

/** The user-facing পেমেন্ট মাধ্যম kinds. */
export const FINANCIAL_ACCOUNT_KINDS = ["cash", "bank", "mfs"] as const;
export type FinancialAccountKind = (typeof FINANCIAL_ACCOUNT_KINDS)[number];

export const MFS_PROVIDERS = ["bkash", "nagad", "rocket", "upay", "other"] as const;
export type MfsProvider = (typeof MFS_PROVIDERS)[number];

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

/** One table: in practice a mill is often both a supplier and a buyer. */
export const PARTY_TYPES = ["customer", "vendor", "both"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const PRODUCT_KINDS = ["raw_material", "finished_good", "service"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const STOCK_DIRECTIONS = ["in", "out"] as const;
export type StockDirection = (typeof STOCK_DIRECTIONS)[number];

export const STOCK_MOVEMENT_TYPES = [
  "opening",
  "purchase",
  "sale",
  "production_input",
  "production_output",
  "wastage",
  "adjustment",
  "sale_return",
  "purchase_return",
  "reversal",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/**
 * What a voucher line is *for*.
 *
 * A production voucher lists raw materials and finished goods in the same
 * table; `transaction_lines.role` is what tells them apart. It was a bare
 * `varchar` with a `Record<string, string>` label map, so the dictionary could
 * not be checked for completeness against it.
 */
export const TRANSACTION_LINE_ROLES = [
  "item",
  "input",
  "output",
  "wastage",
  "adjustment",
] as const;
export type TransactionLineRole = (typeof TRANSACTION_LINE_ROLES)[number];

/** The column is a `varchar`, so rows read back from it are only `string`. */
export function isTransactionLineRole(value: string): value is TransactionLineRole {
  return (TRANSACTION_LINE_ROLES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "cancel",
  "delete",
  "login",
  "export",
  /** An admin pushed a posting past a rule that had blocked it — spec R1.2. */
  "override",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const NOTIFICATION_SEVERITIES = ["info", "warning", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * Why a posting was refused, in a form either language can render.
 *
 * The engine is pure: it cannot reach the dictionary, and a resolved Bengali
 * sentence baked into it would be the frozen-label mistake in a new place. So
 * it names the rule and hands over the numbers already formatted — the number
 * format is identical in both locales, only the sentence around it differs —
 * and `blockedMessage` builds the sentence from whichever dictionary the
 * request is being served in.
 *
 * Product, party and wallet names travel through here as data, exactly as
 * they came out of their `nameBn` column.
 */
export type BlockedReason =
  | { rule: "emptyTransaction" }
  | { rule: "unbalancedEntry" }
  | { rule: "negativeJournalAmount" }
  | { rule: "missingProduct" }
  | { rule: "missingFinancialAccount" }
  | { rule: "paymentExceedsTotal"; paid: string; total: string }
  | { rule: "discountExceedsTotal"; discount: string; total: string }
  | { rule: "productionCostUnpaid"; cost: string; paid: string }
  | { rule: "wastageNotAnInput"; product: string }
  | { rule: "wastageExceedsInputs" }
  | {
      rule: "negativeStock";
      productId: string;
      product: string;
      available: string;
      requested: string;
    };

export type BlockedRule = BlockedReason["rule"];

/**
 * The same shape for the things that post anyway but are worth saying out
 * loud. A warning is read by the person at the counter in whichever language
 * they chose, so it cannot be a Bengali sentence either.
 */
export type WarnedReason =
  | { rule: "stockWentNegative"; product: string }
  | { rule: "zeroCostReturn"; product: string }
  | { rule: "zeroCostSurplus"; product: string }
  | { rule: "overCreditLimit"; party: string; limit: string; projected: string };

/**
 * The rules an admin may push past, per spec R1.2.
 *
 * Everything absent from this list is a refusal no PIN can lift: an unbalanced
 * journal or a product that does not exist is a bug or a typo, not a business
 * judgement the shopkeeper is entitled to make.
 */
export const OVERRIDABLE_RULES = ["negativeStock"] as const;
export type OverridableRule = (typeof OVERRIDABLE_RULES)[number];

export function isOverridable(rule: BlockedRule): rule is OverridableRule {
  return (OVERRIDABLE_RULES as readonly string[]).includes(rule);
}
