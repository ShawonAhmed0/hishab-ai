/**
 * Loads exactly what the engine needs, and nothing else.
 *
 * The engine is pure by design, so somebody has to do the reading. Doing it
 * here — in one place, from the input's own references — keeps the query count
 * fixed regardless of how many lines the entry has.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  accounts,
  financialAccounts,
  productStock,
  products,
  type Transaction as Tx,
} from "@hishabai/db";
import {
  ZERO,
  ZERO_QTY,
  moneyFromDb,
  qtyFromDb,
  type TransactionInput,
} from "@hishabai/shared";
import type {
  ControlAccounts,
  FinancialAccountRef,
  PostingContext,
  ProductState,
} from "@hishabai/accounting";

const CONTROL_SUBTYPES = [
  "receivable",
  "payable",
  "inventory",
  "sales",
  "sales_return",
  "other_income",
  "cogs",
  "wastage",
  "stock_adjustment",
] as const;

export class MissingSetupError extends Error {
  readonly messageBn: string;
  constructor(messageBn: string, messageEn: string) {
    super(messageEn);
    this.name = "MissingSetupError";
    this.messageBn = messageBn;
  }
}

/** Every product the entry touches, whichever shape the entry takes. */
export function collectProductIds(input: TransactionInput): string[] {
  const ids = new Set<string>();
  switch (input.type) {
    case "sale":
    case "purchase":
    case "sale_return":
    case "purchase_return":
      for (const line of input.lines) ids.add(line.productId);
      break;
    case "production":
      for (const line of input.inputs) ids.add(line.productId);
      for (const line of input.outputs) ids.add(line.productId);
      for (const line of input.wastage) ids.add(line.productId);
      break;
    case "stock_adjustment":
      for (const line of input.adjustments) ids.add(line.productId);
      break;
    default:
      break;
  }
  return [...ids];
}

export function collectFinancialAccountIds(input: TransactionInput): string[] {
  if (!("payments" in input)) return [];
  return [...new Set(input.payments.map((p) => p.financialAccountId))];
}

async function loadControlAccounts(tx: Tx, companyId: string): Promise<ControlAccounts> {
  const rows = await tx
    .select({ id: accounts.id, subtype: accounts.subtype })
    .from(accounts)
    .where(
      and(
        eq(accounts.companyId, companyId),
        eq(accounts.isSystem, true),
        inArray(accounts.subtype, [...CONTROL_SUBTYPES]),
      ),
    );

  const found = new Map(rows.map((r) => [r.subtype, r.id]));
  const missing = CONTROL_SUBTYPES.filter((s) => !found.has(s));
  if (missing.length > 0) {
    throw new MissingSetupError(
      "কোম্পানির হিসাবের খাতা সম্পূর্ণ নয়। সেটিংস থেকে পুনরায় সেটআপ করুন।",
      `Company is missing system accounts: ${missing.join(", ")}`,
    );
  }

  return Object.fromEntries(
    CONTROL_SUBTYPES.map((s) => [s, found.get(s)!]),
  ) as ControlAccounts;
}

async function loadWallets(
  tx: Tx,
  companyId: string,
  ids: readonly string[],
): Promise<Map<string, FinancialAccountRef>> {
  if (ids.length === 0) return new Map();

  const rows = await tx
    .select({
      id: financialAccounts.id,
      accountId: financialAccounts.accountId,
      kind: financialAccounts.kind,
      nameBn: financialAccounts.nameBn,
      isActive: financialAccounts.isActive,
    })
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.companyId, companyId),
        inArray(financialAccounts.id, [...ids]),
      ),
    );

  const inactive = rows.filter((r) => !r.isActive);
  if (inactive.length > 0) {
    throw new MissingSetupError(
      `"${inactive[0]!.nameBn}" পেমেন্ট মাধ্যমটি বন্ধ করা আছে।`,
      `Financial account ${inactive[0]!.id} is inactive`,
    );
  }

  return new Map(
    rows.map((r) => [
      r.id,
      { id: r.id, accountId: r.accountId, kind: r.kind, nameBn: r.nameBn },
    ]),
  );
}

export async function loadProductStates(
  tx: Tx,
  companyId: string,
  ids: readonly string[],
): Promise<Map<string, ProductState>> {
  if (ids.length === 0) return new Map();

  // Left join: a product that has never moved has no stock row yet, and that
  // is a zero balance, not an error.
  const rows = await tx
    .select({
      id: products.id,
      nameBn: products.nameBn,
      kind: products.kind,
      minStockLevel: products.minStockLevel,
      quantity: productStock.quantity,
      value: productStock.value,
      avgCost: productStock.avgCost,
    })
    .from(products)
    .leftJoin(
      productStock,
      and(
        eq(productStock.productId, products.id),
        eq(productStock.companyId, products.companyId),
      ),
    )
    .where(and(eq(products.companyId, companyId), inArray(products.id, [...ids])));

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        nameBn: row.nameBn,
        kind: row.kind,
        quantity: row.quantity ? qtyFromDb(row.quantity) : ZERO_QTY,
        value: row.value ? moneyFromDb(row.value) : ZERO,
        avgCost: row.avgCost ? moneyFromDb(row.avgCost) : ZERO,
        minStockLevel: qtyFromDb(row.minStockLevel),
      } satisfies ProductState,
    ]),
  );
}

export async function loadPostingContext(
  tx: Tx,
  options: {
    companyId: string;
    transactionId: string;
    date: string;
    input: TransactionInput;
    allowNegativeStock?: boolean;
  },
): Promise<PostingContext> {
  const [controlAccounts, wallets, productStates] = await Promise.all([
    loadControlAccounts(tx, options.companyId),
    loadWallets(tx, options.companyId, collectFinancialAccountIds(options.input)),
    loadProductStates(tx, options.companyId, collectProductIds(options.input)),
  ]);

  return {
    companyId: options.companyId,
    transactionId: options.transactionId,
    date: options.date,
    accounts: controlAccounts,
    financialAccounts: wallets,
    products: productStates,
    allowNegativeStock: options.allowNegativeStock ?? true,
  };
}
