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

/**
 * How a discount was expressed — spec R3.4.
 *
 * A percentage is stored as what the user chose, not as the taka it worked out
 * to, so a reprinted invoice still says "10%" rather than a figure nobody
 * recognises. The taka is derived from the subtotal by the server.
 */
export const DISCOUNT_TYPES = ["amount", "percent"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

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
    }
  /**
   * Not the engine's — `packages/core/src/duplicates.ts` raises this. It lives
   * in the same union because it is the same kind of thing to the person
   * reading it: the entry was refused, and here is why.
   */
  | { rule: "duplicateMemo"; memoNo: string; voucher: string }
  /** The same, lost to a race — the unique index caught it, so there is no
   * voucher number to name: the transaction that would have told us is the
   * one that just aborted. */
  | { rule: "duplicateMemoNumber"; memoNo: string }
  /** R3.1 — the wallet does not hold what the entry proposes to pay out. */
  | { rule: "insufficientFunds"; wallet: string; available: string; requested: string }
  /** R3.2 — the sale takes the party past the limit their shopkeeper set. */
  | { rule: "overCreditLimit"; party: string; limit: string; projected: string }
  /** R3.2 — a party whose oldest unpaid bill is in the red band. */
  | { rule: "riskyParty"; party: string }
  /** R3.3 — the entry would leave the business worth less than nothing. */
  | { rule: "negativeCapital"; available: string; requested: string }
  /** R4.1 — the entry is dated in a period the company has closed. */
  | { rule: "periodLocked"; date: string; lockedBefore: string };

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
export const OVERRIDABLE_RULES = [
  "negativeStock",
  "insufficientFunds",
  "overCreditLimit",
  "riskyParty",
  "negativeCapital",
  "periodLocked",
] as const;
export type OverridableRule = (typeof OVERRIDABLE_RULES)[number];

export function isOverridable(rule: BlockedRule): rule is OverridableRule {
  return (OVERRIDABLE_RULES as readonly string[]).includes(rule);
}

// ---------------------------------------------------------------------------
// Credit policy
// ---------------------------------------------------------------------------

/**
 * When a party's unpaid bill stops being ordinary — spec R5.2.
 *
 * Per company, in `companies.settings`, because "30 days" is a trading
 * convention rather than a fact: a mill selling to wholesalers and a shop
 * selling over a counter do not mean the same thing by it.
 *
 * `creditPeriodDays` defaults to 0, so out of the box "overdue" means
 * "outstanding" and the bands fire at 30 and 60 days from the bill itself —
 * which is what those numbers read as to a shopkeeper. A business that
 * actually grants terms sets it, and everything shifts by that much.
 */
export interface CreditPolicy {
  creditPeriodDays: number;
  slowPayerDays: number;
  riskyDays: number;
}

/**
 * When the books close behind you — spec R4.1.
 *
 * Both default to *off*, and that is deliberate. Turning either on refuses
 * entries that are ordinary practice — a shopkeeper entering last week's
 * চালান on Monday morning — so it is a decision the company makes once it has
 * a month it considers finished, not something that starts refusing on the
 * day the feature ships.
 */
export interface PeriodLock {
  /** Nothing may be dated before this. ISO date, or null for no floor. */
  lockedBefore: string | null;
  /** Close each month as it ends: nothing dated before the 1st of this one. */
  lockPriorMonths: boolean;
}

/**
 * The typo guard — spec R4.2.
 *
 * Two triggers, because neither works alone. An absolute figure catches
 * ৳1,00,000 typed where ৳10,000 was meant on a brand-new customer nobody has
 * any history for; a multiple of what *this* party usually spends catches the
 * same slip at a business where ৳1,00,000 is an ordinary Tuesday. Either may
 * be set to 0 to turn it off.
 *
 * `confirmEveryEntry` is the spec's "final confirmation before posting", and
 * it is off by default: a second tap on every entry, all day, is a cost paid
 * by the person who makes no mistakes as well as the one who does.
 */
export interface ConfirmPolicy {
  largeAmount: number;
  largeMultiple: number;
  confirmEveryEntry: boolean;
}

export const DEFAULT_CONFIRM_POLICY: ConfirmPolicy = {
  /** Whole taka, not scaled — this is a setting, not an amount in the books. */
  largeAmount: 100000,
  largeMultiple: 5,
  confirmEveryEntry: false,
};

export function confirmPolicyFrom(settings: unknown): ConfirmPolicy {
  const raw = (settings ?? {}) as Record<string, unknown>;
  const read = (key: "largeAmount" | "largeMultiple"): number => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e12
      ? value
      : DEFAULT_CONFIRM_POLICY[key];
  };
  return {
    largeAmount: read("largeAmount"),
    largeMultiple: read("largeMultiple"),
    confirmEveryEntry: raw["confirmEveryEntry"] === true,
  };
}

export const DEFAULT_PERIOD_LOCK: PeriodLock = {
  lockedBefore: null,
  lockPriorMonths: false,
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Same total reading as `creditPolicyFrom`: a bad blob must not stop the app. */
export function periodLockFrom(settings: unknown): PeriodLock {
  const raw = (settings ?? {}) as Record<string, unknown>;
  const lockedBefore = raw["lockedBefore"];
  return {
    lockedBefore:
      typeof lockedBefore === "string" && ISO_DATE_PATTERN.test(lockedBefore)
        ? lockedBefore
        : null,
    lockPriorMonths: raw["lockPriorMonths"] === true,
  };
}

/**
 * The earliest date an entry may carry, or null when nothing is closed.
 *
 * The later of the two rules wins: a company that closed March explicitly and
 * also closes each month as it ends is asking for whichever is stricter.
 */
export function lockedBefore(lock: PeriodLock, today: string): string | null {
  const monthStart = lock.lockPriorMonths ? `${today.slice(0, 7)}-01` : null;
  if (!lock.lockedBefore) return monthStart;
  if (!monthStart) return lock.lockedBefore;
  return lock.lockedBefore > monthStart ? lock.lockedBefore : monthStart;
}

export const DEFAULT_CREDIT_POLICY: CreditPolicy = {
  creditPeriodDays: 0,
  slowPayerDays: 30,
  riskyDays: 60,
};

/**
 * Reads the policy out of whatever is in the settings column.
 *
 * Total: the column is jsonb and nothing constrains its shape, so anything
 * unrecognised falls back to the default rather than throwing. A malformed
 * settings blob must not be able to stop every entry in the company.
 */
export function creditPolicyFrom(settings: unknown): CreditPolicy {
  const raw = (settings ?? {}) as Record<string, unknown>;
  const read = (key: keyof CreditPolicy): number => {
    const value = raw[key];
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3650
      ? value
      : DEFAULT_CREDIT_POLICY[key];
  };
  return {
    creditPeriodDays: read("creditPeriodDays"),
    slowPayerDays: read("slowPayerDays"),
    riskyDays: read("riskyDays"),
  };
}
