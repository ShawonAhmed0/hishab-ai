/**
 * Deterministic fixtures for the engine tests.
 *
 * Modelled on the paper trading business in the spec — জাম্বু পেপার as raw
 * material, finished rolls as output — so the worked example in §8 can be
 * asserted literally rather than paraphrased.
 */
import {
  ZERO,
  ZERO_QTY,
  money,
  multiplyRate,
  qty,
  type Money,
  type Qty,
} from "@hishabai/shared";
import type { AccountType } from "@hishabai/shared";
import type {
  ControlAccounts,
  FinancialAccountRef,
  PostingContext,
  ProductState,
} from "../context";

const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ID = {
  company: id(1),
  transaction: id(2),

  // Control accounts
  receivable: id(10),
  payable: id(11),
  inventory: id(12),
  sales: id(13),
  salesReturn: id(14),
  otherIncome: id(15),
  cogs: id(16),
  wastage: id(17),
  stockAdjustment: id(18),

  // General-ledger accounts behind the wallets
  cashGl: id(20),
  bankGl: id(21),
  bkashGl: id(22),

  // Wallets the user actually picks
  cashWallet: id(30),
  bankWallet: id(31),
  bkashWallet: id(32),

  // Category accounts
  rentExpense: id(40),
  serviceIncome: id(41),

  // Master data
  customer: id(50),
  vendor: id(51),
  unitKg: id(60),
  unitRoll: id(61),
  paper: id(70),
  jumbo: id(71),
  finishedRoll: id(72),
  user: id(80),
} as const;

export const CONTROL_ACCOUNTS: ControlAccounts = {
  receivable: ID.receivable,
  payable: ID.payable,
  inventory: ID.inventory,
  sales: ID.sales,
  sales_return: ID.salesReturn,
  other_income: ID.otherIncome,
  cogs: ID.cogs,
  wastage: ID.wastage,
  stock_adjustment: ID.stockAdjustment,
};

/** Funded, so a test has to opt into being short rather than opt out. */
export const WALLETS: ReadonlyMap<string, FinancialAccountRef> = new Map([
  [
    ID.cashWallet,
    { id: ID.cashWallet, accountId: ID.cashGl, kind: "cash", nameBn: "নগদ", balance: money("1000000") },
  ],
  [
    ID.bankWallet,
    { id: ID.bankWallet, accountId: ID.bankGl, kind: "bank", nameBn: "ব্যাংক", balance: money("1000000") },
  ],
  [
    ID.bkashWallet,
    { id: ID.bkashWallet, accountId: ID.bkashGl, kind: "mfs", nameBn: "বিকাশ", balance: money("1000000") },
  ],
]);

/** A wallet with a stated balance, for the R3.1 cases. */
export function wallet(id: string, balance: Money): FinancialAccountRef {
  const base = WALLETS.get(id);
  if (!base) throw new Error(`unknown wallet fixture ${id}`);
  return { ...base, balance };
}

/**
 * Every account the engine can post to, by type — spec R3.3.
 *
 * The control accounts are fixed; a test that names its own খাত adds it.
 */
export const ACCOUNT_TYPES: ReadonlyMap<string, AccountType> = new Map([
  [ID.receivable, "asset"],
  [ID.payable, "liability"],
  [ID.inventory, "asset"],
  [ID.cashGl, "asset"],
  [ID.bankGl, "asset"],
  [ID.bkashGl, "asset"],
  [ID.sales, "income"],
  [ID.salesReturn, "income"],
  [ID.otherIncome, "income"],
  [ID.cogs, "expense"],
  [ID.wastage, "expense"],
  [ID.stockAdjustment, "expense"],
  [ID.rentExpense, "expense"],
  [ID.serviceIncome, "income"],
]);

export interface ProductSeed {
  id: string;
  nameBn: string;
  kind?: ProductState["kind"];
  quantity: Qty;
  avgCost: Money;
  unitSymbol?: string;
  minStockLevel?: Qty;
}

/** Stock value is always derived, never stated, so seeds cannot contradict. */
export function product(seed: ProductSeed): ProductState {
  const state: ProductState = {
    id: seed.id,
    nameBn: seed.nameBn,
    kind: seed.kind ?? "finished_good",
    quantity: seed.quantity,
    avgCost: seed.avgCost,
    unitSymbol: seed.unitSymbol ?? "কেজি",
    value: multiplyRate(seed.quantity, seed.avgCost),
  };
  if (seed.minStockLevel !== undefined) state.minStockLevel = seed.minStockLevel;
  return state;
}

export const DEFAULT_PRODUCTS: ProductState[] = [
  product({
    id: ID.paper,
    nameBn: "অফসেট পেপার",
    quantity: qty("1000"),
    avgCost: money("120"),
    minStockLevel: qty("100"),
  }),
  product({
    id: ID.jumbo,
    nameBn: "জাম্বু পেপার",
    kind: "raw_material",
    quantity: qty("2000"),
    avgCost: money("100"),
  }),
  product({
    id: ID.finishedRoll,
    nameBn: "ফিনিশড পেপার রোল",
    quantity: ZERO_QTY,
    avgCost: ZERO,
  }),
];

/**
 * Each call gets its own copies. The engine treats product state as read-only,
 * but a test that shares mutable seeds across cases will eventually lie.
 */
export function makeContext(
  overrides: Partial<Omit<PostingContext, "products">> & {
    products?: readonly ProductState[];
  } = {},
): PostingContext {
  const { products: seeds, ...rest } = overrides;
  const products = new Map<string, ProductState>();
  for (const p of seeds ?? DEFAULT_PRODUCTS) products.set(p.id, { ...p });

  return {
    companyId: ID.company,
    transactionId: ID.transaction,
    date: "2026-08-16",
    accounts: CONTROL_ACCOUNTS,
    financialAccounts: WALLETS,
    accountTypes: ACCOUNT_TYPES,
    // Solvent by default, so a test has to opt into being broke.
    equity: money("1000000"),
    allowNegativeStock: false,
    ...rest,
    products,
  };
}

/** Sum one side of a posting — used constantly in assertions. */
export function totalOf(
  lines: readonly { debit: Money; credit: Money }[],
  side: "debit" | "credit",
): Money {
  let total = 0n;
  for (const line of lines) total += side === "debit" ? line.debit : line.credit;
  return total as Money;
}

/** Net movement on one account: debits minus credits. */
export function netOn(
  lines: readonly { accountId: string; debit: Money; credit: Money }[],
  accountId: string,
): Money {
  let net = 0n;
  for (const line of lines) {
    if (line.accountId === accountId) net += line.debit - line.credit;
  }
  return net as Money;
}

export { qty, money };
