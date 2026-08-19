/**
 * Loads exactly what the engine needs, and nothing else.
 *
 * The engine is pure by design, so somebody has to do the reading. Doing it
 * here — in one place, from the input's own references — keeps the query count
 * fixed regardless of how many lines the entry has.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  accounts,
  companies,
  financialAccounts,
  parties,
  partyBalances,
  productStock,
  products,
  units,
  type Transaction as Tx,
} from "@hishabai/db";
import {
  ZERO,
  ZERO_QTY,
  creditPolicyFrom,
  moneyFromDb,
  qtyFromDb,
  type AccountType,
  type CreditPolicy,
  type Money,
  type TransactionInput,
} from "@hishabai/shared";
import { loadAgeing } from "./ageing";
import type {
  AgeingBand,
  ControlAccounts,
  FinancialAccountRef,
  PartyState,
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

/**
 * Chart-of-accounts ids the input names directly.
 *
 * Every other account the engine touches is a control account it looked up
 * itself; these two are chosen by the client, so they are the two that have to
 * be proved to belong here.
 */
export function collectAccountIds(input: TransactionInput): string[] {
  const ids = new Set<string>();
  if ("categoryAccountId" in input && input.categoryAccountId) {
    ids.add(input.categoryAccountId);
  }
  // R3.4 / X.2: a third id the client chooses, so a third one to prove.
  if ("otherCostAccountId" in input && input.otherCostAccountId) {
    ids.add(input.otherCostAccountId);
  }
  if (input.type === "other") for (const entry of input.entries) ids.add(entry.accountId);
  return [...ids];
}

export function collectPartyIds(input: TransactionInput): string[] {
  const ids = new Set<string>();
  if ("partyId" in input && input.partyId) ids.add(input.partyId);
  if (input.type === "other") {
    for (const entry of input.entries) if (entry.partyId) ids.add(entry.partyId);
  }
  return [...ids];
}

/**
 * A foreign id would otherwise post.
 *
 * RLS stops the *rows* leaving the company, but a foreign key is enforced by a
 * trigger that runs as the table owner, and that bypasses RLS entirely — so
 * `journal_lines.account_id` pointing at another company's account satisfies
 * both the constraint and the insert policy, since the policy only checks the
 * new row's own `company_id`. The reference has to be checked here, against a
 * company-scoped read, before the engine ever sees it.
 */
async function assertReferencesAreOurs(
  tx: Tx,
  companyId: string,
  input: TransactionInput,
): Promise<void> {
  const accountIds = collectAccountIds(input);
  const partyIds = collectPartyIds(input);

  const [ourAccounts, ourParties] = await Promise.all([
    accountIds.length === 0
      ? Promise.resolve([])
      : tx
          .select({ id: accounts.id, isActive: accounts.isActive })
          .from(accounts)
          .where(and(eq(accounts.companyId, companyId), inArray(accounts.id, accountIds))),
    partyIds.length === 0
      ? Promise.resolve([])
      : tx
          .select({ id: parties.id })
          .from(parties)
          .where(and(eq(parties.companyId, companyId), inArray(parties.id, partyIds))),
  ]);

  const found = new Set(ourAccounts.map((row) => row.id));
  const strayAccount = accountIds.find((id) => !found.has(id));
  if (strayAccount) {
    throw new MissingSetupError(
      "নির্বাচিত হিসাবের খাতটি এই কোম্পানির নয়।",
      `Account ${strayAccount} does not belong to company ${companyId}`,
    );
  }

  const inactive = ourAccounts.find((row) => !row.isActive);
  if (inactive) {
    throw new MissingSetupError(
      "নির্বাচিত হিসাবের খাতটি বন্ধ করা আছে।",
      `Account ${inactive.id} is inactive`,
    );
  }

  const knownParties = new Set(ourParties.map((row) => row.id));
  const strayParty = partyIds.find((id) => !knownParties.has(id));
  if (strayParty) {
    throw new MissingSetupError(
      "নির্বাচিত পক্ষটি এই কোম্পানির নয়।",
      `Party ${strayParty} does not belong to company ${companyId}`,
    );
  }
}

interface Chart {
  control: ControlAccounts;
  /** Every account in the company, by type — spec R3.3 needs all of them. */
  types: Map<string, AccountType>;
  /** Net equity before this entry: equity + income − expenses. */
  equity: Money;
}

/**
 * The whole chart of accounts, plus what the business is currently worth.
 *
 * The chart is read in full rather than filtered to the control accounts,
 * because R3.3 has to be able to classify *every* line the engine emits — an
 * account missing from the map is a line that silently does not count towards
 * equity, which is the kind of wrong that balances.
 *
 * A chart is a few dozen rows, and the equity sum rides along as an
 * uncorrelated subquery, so this is still one round trip.
 */
async function loadChart(tx: Tx, companyId: string): Promise<Chart> {
  const rows = (await tx.execute<{
    id: string;
    type: AccountType;
    subtype: string;
    is_system: boolean;
    equity: string;
  }>(sql`
    select a.id,
           a.type::text    as type,
           a.subtype::text as subtype,
           a.is_system,
           (select coalesce(sum(jl.credit - jl.debit), 0)::text
              from journal_lines jl
              join accounts src on src.id = jl.account_id
             where jl.company_id = ${companyId}::uuid
               and src.type in ('equity', 'income', 'expense')) as equity
      from accounts a
     where a.company_id = ${companyId}::uuid
  `)) as unknown as {
    id: string;
    type: AccountType;
    subtype: string;
    is_system: boolean;
    equity: string;
  }[];

  const control = new Map<string, string>();
  const types = new Map<string, AccountType>();
  for (const row of rows) {
    types.set(row.id, row.type);
    if (row.is_system && (CONTROL_SUBTYPES as readonly string[]).includes(row.subtype)) {
      control.set(row.subtype, row.id);
    }
  }

  const missing = CONTROL_SUBTYPES.filter((s) => !control.has(s));
  if (missing.length > 0) {
    throw new MissingSetupError(
      "কোম্পানির হিসাবের খাতা সম্পূর্ণ নয়। সেটিংস থেকে পুনরায় সেটআপ করুন।",
      `Company is missing system accounts: ${missing.join(", ")}`,
    );
  }

  return {
    control: Object.fromEntries(
      CONTROL_SUBTYPES.map((s) => [s, control.get(s)!]),
    ) as ControlAccounts,
    types,
    equity: rows[0] ? moneyFromDb(rows[0].equity) : ZERO,
  };
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
      balance: financialAccounts.balance,
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
      {
        id: r.id,
        accountId: r.accountId,
        kind: r.kind,
        nameBn: r.nameBn,
        // Trigger-maintained from journal_lines. Read, never assigned.
        balance: moneyFromDb(r.balance),
      },
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
      unitSymbol: units.symbol,
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
    // The unit rides along because a refusal has to say "১০০ কেজি", not
    // "১০০" — see `blocked.negativeStock`. Same row, no extra round trip.
    .leftJoin(
      units,
      and(eq(units.id, products.unitId), eq(units.companyId, products.companyId)),
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
        unitSymbol: row.unitSymbol ?? "",
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
    /**
     * Off by default since spec R1.1 — a sale of stock the books have never
     * received is refused. Set only by a cancellation, which must always be
     * postable, and by an entry an admin has authorised with their PIN.
     */
    allowNegativeStock?: boolean;
    /** R3.1 / R3.2 / R3.3 — each set only by an authorised override. */
    allowOverdraft?: boolean;
    allowOverCredit?: boolean;
    allowNegativeCapital?: boolean;
  },
): Promise<PostingContext> {
  const [chart, wallets, productStates, , party] = await Promise.all([
    loadChart(tx, options.companyId),
    loadWallets(tx, options.companyId, collectFinancialAccountIds(options.input)),
    loadProductStates(tx, options.companyId, collectProductIds(options.input)),
    assertReferencesAreOurs(tx, options.companyId, options.input),
    loadPartyState(tx, options.companyId, options.input),
  ]);

  return {
    companyId: options.companyId,
    transactionId: options.transactionId,
    date: options.date,
    accounts: chart.control,
    accountTypes: chart.types,
    equity: chart.equity,
    financialAccounts: wallets,
    products: productStates,
    ...(party ? { party } : {}),
    allowNegativeStock: options.allowNegativeStock ?? false,
    allowOverdraft: options.allowOverdraft ?? false,
    allowOverCredit: options.allowOverCredit ?? false,
    allowNegativeCapital: options.allowNegativeCapital ?? false,
  };
}

/**
 * The named party's standing, for R3.2.
 *
 * Only fetched when the entry names one; a stock adjustment does not pay for
 * a round trip it has no use for. The ageing band comes with it, because a
 * party in the red band takes no new credit regardless of their limit.
 */
async function loadPartyState(
  tx: Tx,
  companyId: string,
  input: TransactionInput,
): Promise<PartyState | undefined> {
  const partyId = "partyId" in input ? input.partyId : undefined;
  if (!partyId) return undefined;

  const [row] = await tx
    .select({
      id: parties.id,
      name: parties.name,
      creditLimit: parties.creditLimit,
      receivable: partyBalances.receivable,
    })
    .from(parties)
    .leftJoin(
      partyBalances,
      and(
        eq(partyBalances.partyId, parties.id),
        eq(partyBalances.companyId, parties.companyId),
      ),
    )
    .where(and(eq(parties.companyId, companyId), eq(parties.id, partyId)))
    .limit(1);

  if (!row) return undefined;

  const policy = await loadCreditPolicy(tx, companyId);
  const ageing = await loadAgeing(tx, companyId, [partyId], policy);

  return {
    id: row.id,
    name: row.name,
    receivable: row.receivable ? moneyFromDb(row.receivable) : ZERO,
    creditLimit: row.creditLimit === null ? null : moneyFromDb(row.creditLimit),
    ageing: ageing.get(partyId)?.band ?? ("healthy" satisfies AgeingBand),
  };
}

/**
 * The company's own idea of when a bill is late.
 *
 * Lives in `companies.settings`, and anything unrecognised there falls back to
 * the default rather than throwing — a malformed settings blob must not be
 * able to stop every entry in the company.
 */
export async function loadCreditPolicy(tx: Tx, companyId: string): Promise<CreditPolicy> {
  const [row] = await tx
    .select({ settings: companies.settings })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return creditPolicyFrom(row?.settings);
}
