/**
 * Everything the engine is allowed to know.
 *
 * The engine never queries. The caller loads current balances, average costs
 * and account ids, hands them over, and gets back drafts to persist. That is
 * what makes every rule in here reproducible from a fixture in a test file.
 */
import type {
  AccountSubtype,
  FinancialAccountKind,
  Money,
  ProductKind,
  Qty,
  StockDirection,
  StockMovementType,
  TransactionType,
} from "@hishabai/shared";

/** Control accounts the engine addresses by role, never by name or code. */
export type ControlAccounts = Record<
  Extract<
    AccountSubtype,
    | "receivable"
    | "payable"
    | "inventory"
    | "sales"
    | "sales_return"
    | "other_income"
    | "cogs"
    | "wastage"
    | "stock_adjustment"
  >,
  string
>;

export interface FinancialAccountRef {
  id: string;
  /** The general-ledger account this wallet posts to. */
  accountId: string;
  kind: FinancialAccountKind;
  nameBn: string;
}

export interface ProductState {
  id: string;
  kind: ProductKind;
  nameBn: string;
  /** Stock on hand before this transaction. */
  quantity: Qty;
  /** Total stock value on hand before this transaction. */
  value: Money;
  /** Weighted average unit cost before this transaction. */
  avgCost: Money;
  minStockLevel?: Qty;
}

/**
 * The party's standing before this entry, so the engine can say when a sale
 * takes them past the limit their own shopkeeper set.
 *
 * `creditLimit` is null when no limit was set, which is not the same as a
 * limit of zero — the second would mean "no credit at all".
 */
export interface PartyState {
  id: string;
  name: string;
  /** Outstanding before this transaction. */
  receivable: Money;
  creditLimit: Money | null;
}

export interface PostingContext {
  companyId: string;
  transactionId: string;
  /** ISO date the entry is recorded against. */
  date: string;
  accounts: ControlAccounts;
  financialAccounts: ReadonlyMap<string, FinancialAccountRef>;
  products: ReadonlyMap<string, ProductState>;
  /** The party the entry names, when it names one. */
  party?: PartyState;
  /**
   * Recording a sale before the matching purchase entry is normal practice in
   * a Bangladeshi trading business, so negative stock is permitted by default
   * and reported as a warning rather than refused.
   */
  allowNegativeStock?: boolean;
}

export interface JournalLineDraft {
  accountId: string;
  partyId?: string;
  debit: Money;
  credit: Money;
  narration?: string;
}

export interface StockMovementDraft {
  productId: string;
  direction: StockDirection;
  movementType: StockMovementType;
  /** Always positive; `direction` carries the sign. */
  quantity: Qty;
  /** Unit rate actually applied, derived from `value`. */
  rate: Money;
  value: Money;
  quantityAfter: Qty;
  avgCostAfter: Money;
  stockValueAfter: Money;
}

export interface PaymentDraft {
  financialAccountId: string;
  accountId: string;
  amount: Money;
  direction: "in" | "out";
  handledByUserId?: string;
  handledByName?: string;
  reference?: string;
}

export interface PostingTotals {
  /** Sum of the line amounts before charges and discount. */
  subtotal: Money;
  /** পরিবহন + লেবার + অন্যান্য খরচ. */
  additionalCosts: Money;
  discount: Money;
  /** What the invoice comes to — the number the user recognises. */
  total: Money;
  paid: Money;
  due: Money;
}

export interface PartyBalanceDelta {
  partyId: string;
  /** Positive increases what the customer owes us. */
  receivable: Money;
  /** Positive increases what we owe the vendor. */
  payable: Money;
}

export interface PostingResult {
  type: TransactionType;
  journalLines: JournalLineDraft[];
  stockMovements: StockMovementDraft[];
  payments: PaymentDraft[];
  totals: PostingTotals;
  partyDelta?: PartyBalanceDelta;
  warnings: PostingWarningList;
}

export type PostingWarningList = import("./errors.js").PostingWarning[];
