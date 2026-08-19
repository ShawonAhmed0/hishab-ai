/**
 * Everything the engine is allowed to know.
 *
 * The engine never queries. The caller loads current balances, average costs
 * and account ids, hands them over, and gets back drafts to persist. That is
 * what makes every rule in here reproducible from a fixture in a test file.
 */
import type {
  AccountSubtype,
  AccountType,
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
  /**
   * What is in the wallet before this entry — spec R3.1.
   *
   * Read from `financial_accounts.balance`, which is trigger-maintained from
   * `journal_lines`. Never assigned; see CLAUDE.md.
   */
  balance: Money;
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
  /** কেজি, পিস — data from the unit row, shown beside every quantity. */
  unitSymbol: string;
  minStockLevel?: Qty;
}

/**
 * The party's standing before this entry, so the engine can say when a sale
 * takes them past the limit their own shopkeeper set.
 *
 * `creditLimit` is null when no limit was set, which is not the same as a
 * limit of zero — the second would mean "no credit at all".
 */
/**
 * How long this party's oldest unpaid charge has been sitting — spec R5.2.
 *
 * Derived on read from `journal_lines`, never stored: a band held in a column
 * is stale the morning after it is written, which is the cache mistake in a
 * new place.
 */
export type AgeingBand = "healthy" | "slow" | "risky";

export interface PartyState {
  id: string;
  name: string;
  /** Outstanding before this transaction. */
  receivable: Money;
  creditLimit: Money | null;
  /** R3.2: a party in the red band takes no new credit at all. */
  ageing: AgeingBand;
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
   * The type of every account this entry could touch, so the engine can tell
   * which of its own lines move equity — spec R3.3. Control accounts and the
   * খাত the client chose; everything else the engine does not post to.
   */
  accountTypes: ReadonlyMap<string, AccountType>;
  /**
   * Net equity before this entry: equity + income − expenses, summed from
   * `journal_lines`. Never a cached balance column.
   */
  equity: Money;
  /**
   * Selling stock the books have never received is refused (spec R1.1/R1.3),
   * so this defaults to false. It is set true in exactly two places: a
   * cancellation, which must always be postable no matter what stock has done
   * since, and an entry an admin has authorised with their override PIN.
   */
  allowNegativeStock?: boolean;
  /** R3.1 — an admin authorised paying out of a wallet that cannot cover it. */
  allowOverdraft?: boolean;
  /** R3.2 — an admin authorised a sale past the limit, or to a risky party. */
  allowOverCredit?: boolean;
  /** R3.3 — an admin authorised an entry that drives capital negative. */
  allowNegativeCapital?: boolean;
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
