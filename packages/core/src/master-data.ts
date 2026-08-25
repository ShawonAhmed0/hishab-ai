/**
 * Customers, vendors, products, units and খাত — the lists the entry form picks
 * from, and the CRUD behind them.
 */
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import {
  accounts,
  companyMembers,
  financialAccounts,
  parties,
  partyBalances,
  productCategories,
  productStock,
  products,
  stockMovements,
  units,
  tenantQuery,
  tenantRead,
  withTenant,
  type Transaction as Tx,
} from "@hishabai/db";
import {
  ZERO,
  absMoney,
  money,
  moneyToDb,
  multiplyRate,
  partyInputSchema,
  productInputSchema,
  qty,
  qtyToDb,
  type AccountSubtype,
  type Money,
  type Qty,
} from "@hishabai/shared";
import { requirePermission, type Session, type TenantScope } from "./session";
import { postOpeningBalance, systemAccountId } from "./opening-balance";
import { writeAudit } from "./audit";

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

export async function listParties(
  session: Session,
  options: { type?: "customer" | "vendor"; search?: string; limit?: number } = {},
) {
  return withTenant(session, async (tx) => {
    const filters = [
      eq(parties.companyId, session.companyId),
      eq(parties.isActive, true),
    ];

    // A party marked 'both' belongs in either list.
    if (options.type) {
      filters.push(or(eq(parties.type, options.type), eq(parties.type, "both"))!);
    }
    if (options.search) {
      filters.push(
        or(
          ilike(parties.name, `%${options.search}%`),
          ilike(parties.phone, `%${options.search}%`),
        )!,
      );
    }

    return tx
      .select({
        id: parties.id,
        name: parties.name,
        type: parties.type,
        phone: parties.phone,
        address: parties.address,
        creditLimit: parties.creditLimit,
        receivable: partyBalances.receivable,
        payable: partyBalances.payable,
        totalSales: partyBalances.totalSales,
        lastTransactionAt: partyBalances.lastTransactionAt,
      })
      .from(parties)
      .leftJoin(
        partyBalances,
        and(
          eq(partyBalances.partyId, parties.id),
          eq(partyBalances.companyId, parties.companyId),
        ),
      )
      .where(and(...filters))
      .orderBy(asc(parties.name))
      .limit(options.limit ?? 200);
  });
}

/**
 * The sales person a party is assigned to, proved to be one of ours — X.2.
 *
 * A foreign key is enforced by a trigger that runs as the table owner, and that
 * bypasses RLS entirely: a crafted `assignedTo` naming somebody in another
 * company would satisfy the constraint and land in this company's row. So the
 * id is checked against a company-scoped read before it is used, the same way
 * `posting-context.ts` checks the ids the client picks on an entry.
 *
 * Returns null for an empty selection, which is the ordinary case.
 */
async function resolveAssignee(
  tx: Tx,
  companyId: string,
  assignedTo: string | undefined,
): Promise<string | null> {
  if (!assignedTo) return null;

  const [member] = await tx
    .select({ userId: companyMembers.userId })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.userId, assignedTo),
        eq(companyMembers.isActive, true),
      ),
    )
    .limit(1);

  if (!member) throw new Error("এই ব্যবহারকারী এই কোম্পানির সদস্য নন");
  return member.userId;
}

export async function createParty(session: Session, rawInput: unknown): Promise<string> {
  requirePermission(session, "party.manage");
  const input = partyInputSchema.parse(rawInput);

  return withTenant(session, async (tx) => {
    const [created] = await tx
      .insert(parties)
      .values({
        companyId: session.companyId,
        name: input.name,
        type: input.type,
        phone: input.phone || null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        openingBalance: moneyToDb(money(input.openingBalance)),
        creditLimit: input.creditLimit ? moneyToDb(money(input.creditLimit)) : null,
        assignedTo: await resolveAssignee(tx, session.companyId, input.assignedTo),
        createdBy: session.userId,
      })
      .returning({ id: parties.id });

    // A party who already owes you — or whom you already owe — is an opening
    // balance like any other, and it goes through the journal. Writing
    // `party_balances` here instead is how the customer list came to show
    // ৳50,000 outstanding while the aging report, which reads the journal,
    // showed nothing.
    const opening = money(input.openingBalance);
    if (opening !== ZERO) {
      // A vendor balance is normally money you owe; a negative one is an
      // advance you have already paid, which sits on the other side. Same for
      // a customer in reverse, so the two questions collapse into one.
      const isPayable = (input.type === "vendor") === (opening > ZERO);
      const subtype: AccountSubtype = isPayable ? "payable" : "receivable";

      await postOpeningBalance(tx, session, {
        accountId: await systemAccountId(tx, session.companyId, subtype),
        side: isPayable ? "credit" : "debit",
        amount: absMoney(opening),
        partyId: created!.id,
        description: `${input.name} — প্রারম্ভিক বকেয়া`,
      });
    }

    await writeAudit(tx, session, {
      action: "create",
      entityType: "party",
      entityId: created!.id,
      summaryBn: `${input.name} যোগ করা হয়েছে`,
    });

    return created!.id;
  });
}

export async function getPartyStatement(session: Session, partyId: string) {
  return withTenant(session, async (tx) => {
    const [party] = await tx
      .select()
      .from(parties)
      .where(and(eq(parties.id, partyId), eq(parties.companyId, session.companyId)))
      .limit(1);

    if (!party) return null;

    const [balance] = await tx
      .select()
      .from(partyBalances)
      .where(
        and(
          eq(partyBalances.partyId, partyId),
          eq(partyBalances.companyId, session.companyId),
        ),
      )
      .limit(1);

    return { party, balance: balance ?? null };
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function listProducts(
  session: Session,
  options: { search?: string; kind?: "raw_material" | "finished_good" | "service" } = {},
) {
  return withTenant(session, async (tx) => {
    const filters = [
      eq(products.companyId, session.companyId),
      eq(products.isActive, true),
    ];
    if (options.kind) filters.push(eq(products.kind, options.kind));
    if (options.search) {
      filters.push(
        or(
          ilike(products.nameBn, `%${options.search}%`),
          ilike(products.nameEn, `%${options.search}%`),
          ilike(products.sku, `%${options.search}%`),
        )!,
      );
    }

    return tx
      .select({
        id: products.id,
        nameBn: products.nameBn,
        nameEn: products.nameEn,
        sku: products.sku,
        kind: products.kind,
        unitId: products.unitId,
        unitSymbol: units.symbol,
        unitNameBn: units.nameBn,
        purchasePrice: products.purchasePrice,
        salePrice: products.salePrice,
        minStockLevel: products.minStockLevel,
        quantity: productStock.quantity,
        stockValue: productStock.value,
        avgCost: productStock.avgCost,
      })
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(
        productStock,
        and(
          eq(productStock.productId, products.id),
          eq(productStock.companyId, products.companyId),
        ),
      )
      .where(and(...filters))
      .orderBy(asc(products.nameBn));
  });
}

export async function createProduct(session: Session, rawInput: unknown): Promise<string> {
  requirePermission(session, "product.manage");
  const input = productInputSchema.parse(rawInput);

  return withTenant(session, async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        companyId: session.companyId,
        nameBn: input.nameBn,
        nameEn: input.nameEn ?? null,
        sku: input.sku || null,
        kind: input.kind,
        categoryId: input.categoryId ?? null,
        unitId: input.unitId,
        purchasePrice: moneyToDb(money(input.purchasePrice)),
        salePrice: moneyToDb(money(input.salePrice)),
        minStockLevel: qtyToDb(qty(input.minStockLevel)),
        createdBy: session.userId,
      })
      .returning({ id: products.id });

    const openingQty = qty(input.openingQuantity);
    if (openingQty !== 0n) {
      await recordOpeningStock(tx, session, created!.id, input.nameBn, openingQty, {
        rate: money(input.openingRate),
      });
    }

    await writeAudit(tx, session, {
      action: "create",
      entityType: "product",
      entityId: created!.id,
      summaryBn: `${input.nameBn} যোগ করা হয়েছে`,
    });

    return created!.id;
  });
}

/** Products at or below their reorder point — spec §9's low-stock alert. */
export async function lowStockProducts(session: Session) {
  return withTenant(session, async (tx) =>
    tx
      .select({
        id: products.id,
        nameBn: products.nameBn,
        quantity: productStock.quantity,
        minStockLevel: products.minStockLevel,
        unitSymbol: units.symbol,
      })
      .from(products)
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(
        productStock,
        and(
          eq(productStock.productId, products.id),
          eq(productStock.companyId, products.companyId),
        ),
      )
      .where(
        and(
          eq(products.companyId, session.companyId),
          eq(products.isActive, true),
          sql`${products.minStockLevel} > 0`,
          sql`coalesce(${productStock.quantity}, 0) <= ${products.minStockLevel}`,
        ),
      )
      .orderBy(asc(products.nameBn))
      .limit(20),
  );
}

// ---------------------------------------------------------------------------
// Reference lists
// ---------------------------------------------------------------------------

export async function listUnits(session: Session) {
  return withTenant(session, async (tx) =>
    tx
      .select()
      .from(units)
      .where(and(eq(units.companyId, session.companyId), eq(units.isActive, true)))
      .orderBy(asc(units.nameBn)),
  );
}

export async function listCategories(session: Session) {
  return withTenant(session, async (tx) =>
    tx
      .select()
      .from(productCategories)
      .where(
        and(
          eq(productCategories.companyId, session.companyId),
          eq(productCategories.isActive, true),
        ),
      )
      .orderBy(asc(productCategories.nameBn)),
  );
}

/**
 * Everything নতুন এন্ট্রি needs, in one round trip.
 *
 * Six separate list calls opened six connections and exhausted the pool; five
 * sequential queries in one transaction then cost five round trips. A pooled
 * connection serialises statements regardless, so the only real fix is to ask
 * once. It also puts the whole form on a single snapshot — no showing a product
 * that a concurrent write removed while the units were still loading.
 */
export interface EntryFormData {
  parties: { id: string; name: string; type: string; receivable: string; payable: string }[];
  products: {
    id: string; nameBn: string; kind: string; unitId: string; unitSymbol: string;
    salePrice: string; purchasePrice: string; quantity: string;
  }[];
  units: { id: string; nameBn: string; symbol: string }[];
  wallets: { id: string; nameBn: string; kind: string; isDefault: boolean }[];
  incomeCategories: { id: string; nameBn: string; code: string }[];
  expenseCategories: { id: string; nameBn: string; code: string }[];
  /** অন্যান্য picks freely from the chart, so it needs the whole chart. */
  postingAccounts: { id: string; nameBn: string; code: string; type: string }[];
  /** For the "নতুন পণ্য" panel the form can open without navigating away. */
  productCategories: { id: string; nameBn: string }[];
  recipes: {
    id: string;
    nameBn: string | null;
    outputProductId: string;
    expectedYieldPercent: string | null;
    inputs: { productId: string; unitId: string; quantityPerUnit: string }[];
  }[];
}

export async function loadEntryFormData(session: TenantScope): Promise<EntryFormData> {
  // One statement, one round trip. The company is never named — it comes from
  // the session context, which RLS checks membership against.
  const rows = await tenantRead<{
    parties: EntryFormData["parties"] | null;
    products: EntryFormData["products"] | null;
    units: EntryFormData["units"] | null;
    wallets: EntryFormData["wallets"] | null;
    income_categories: EntryFormData["incomeCategories"] | null;
    expense_categories: EntryFormData["expenseCategories"] | null;
    posting_accounts: EntryFormData["postingAccounts"] | null;
    product_categories: EntryFormData["productCategories"] | null;
    recipes: EntryFormData["recipes"] | null;
  }>(
    session,
    tenantQuery`
      select
        (select coalesce(json_agg(json_build_object(
                  'id', t.id, 'name', t.name, 'type', t.type,
                  'receivable', t.receivable, 'payable', t.payable) order by t.name), '[]'::json)
           from (
             select p.id, p.name, p.type::text,
                    coalesce(pb.receivable, 0)::text as receivable,
                    coalesce(pb.payable, 0)::text as payable
               from parties p
               left join party_balances pb
                 on pb.party_id = p.id and pb.company_id = p.company_id
              where p.company_id = app.current_company_id() and p.is_active
           ) t) as parties,

        (select coalesce(json_agg(json_build_object(
                  'id', t.id, 'nameBn', t.name_bn, 'kind', t.kind, 'unitId', t.unit_id,
                  'unitSymbol', t.unit_symbol, 'salePrice', t.sale_price,
                  'purchasePrice', t.purchase_price, 'quantity', t.quantity)
                  order by t.name_bn), '[]'::json)
           from (
             select pr.id, pr.name_bn, pr.kind::text, pr.unit_id, u.symbol as unit_symbol,
                    pr.sale_price::text, pr.purchase_price::text,
                    coalesce(ps.quantity, 0)::text as quantity
               from products pr
               join units u on u.id = pr.unit_id
               left join product_stock ps
                 on ps.product_id = pr.id and ps.company_id = pr.company_id
              where pr.company_id = app.current_company_id() and pr.is_active
           ) t) as products,

        (select coalesce(json_agg(json_build_object(
                  'id', id, 'nameBn', name_bn, 'symbol', symbol) order by name_bn), '[]'::json)
           from units where company_id = app.current_company_id() and is_active) as units,

        (select coalesce(json_agg(json_build_object(
                  'id', id, 'nameBn', name_bn, 'kind', kind::text, 'isDefault', is_default)
                  order by kind::text, name_bn), '[]'::json)
           from financial_accounts
          where company_id = app.current_company_id() and is_active) as wallets,

        (select coalesce(json_agg(json_build_object(
                  'id', id, 'nameBn', name_bn, 'code', code) order by code), '[]'::json)
           from accounts
          where company_id = app.current_company_id() and is_category and is_active
            and type = 'income') as income_categories,

        (select coalesce(json_agg(json_build_object(
                  'id', id, 'nameBn', name_bn, 'code', code) order by code), '[]'::json)
           from accounts
          where company_id = app.current_company_id() and is_category and is_active
            and type = 'expense') as expense_categories,

        (select coalesce(json_agg(json_build_object(
                  'id', id, 'nameBn', name_bn, 'code', code, 'type', type::text)
                  order by code), '[]'::json)
           from accounts
          where company_id = app.current_company_id() and is_active) as posting_accounts,

        (select coalesce(json_agg(json_build_object(
                  'id', id, 'nameBn', name_bn) order by name_bn), '[]'::json)
           from product_categories
          where company_id = app.current_company_id() and is_active) as product_categories,

        (select coalesce(json_agg(json_build_object(
                  'id', t.id, 'nameBn', t.name_bn, 'outputProductId', t.output_product_id,
                  'expectedYieldPercent', t.expected_yield_percent,
                  'inputs', t.inputs) order by t.name_bn), '[]'::json)
           from (
             select r.id, r.name_bn, r.output_product_id,
                    r.expected_yield_percent::text,
                    coalesce((
                      select json_agg(json_build_object(
                               'productId', ri.product_id,
                               'unitId', p.unit_id,
                               'quantityPerUnit', ri.quantity_per_unit::text))
                        from production_recipe_inputs ri
                        join products p on p.id = ri.product_id
                       where ri.recipe_id = r.id
                    ), '[]'::json) as inputs
               from production_recipes r
              where r.company_id = app.current_company_id() and r.is_active
           ) t) as recipes
    `,
  );

  const raw = rows[0]!;
  return {
    parties: raw.parties ?? [],
    products: raw.products ?? [],
    units: raw.units ?? [],
    wallets: raw.wallets ?? [],
    incomeCategories: raw.income_categories ?? [],
    expenseCategories: raw.expense_categories ?? [],
    postingAccounts: raw.posting_accounts ?? [],
    productCategories: raw.product_categories ?? [],
    recipes: raw.recipes ?? [],
  };
}

/** The খাত dropdown: income categories for আয়, expense categories for ব্যয়. */
export async function listCategoryAccounts(
  session: Session,
  type: "income" | "expense",
) {
  return withTenant(session, async (tx) =>
    tx
      .select({
        id: accounts.id,
        nameBn: accounts.nameBn,
        code: accounts.code,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.companyId, session.companyId),
          eq(accounts.type, type),
          eq(accounts.isCategory, true),
          eq(accounts.isActive, true),
        ),
      )
      .orderBy(asc(accounts.code)),
  );
}

// ---------------------------------------------------------------------------
// Opening stock
// ---------------------------------------------------------------------------

/**
 * Opening stock, recorded as a real event rather than a number written into a
 * cache table.
 *
 * It used to insert `product_stock` and nothing else. The stock screens agreed
 * with each other — they all read that table — but the ledger never learned the
 * business owned the goods, so the inventory control account sat at minus the
 * cost of everything ever sold. On the demo data: `product_stock` said
 * ৳60,000 and the control account said −৳60,000, a ৳120,000 hole exactly equal
 * to the opening balance. Nothing surfaced it until the inventory screen put
 * the two numbers within reach of each other, and a balance sheet would have
 * been wrong from the first day.
 *
 * So it now writes all three: the movement, so the audit trail starts at the
 * beginning rather than mid-story; the journal entry, via the shared opening
 * posting; and the cache the screens read.
 */
async function recordOpeningStock(
  tx: Tx,
  session: Session,
  productId: string,
  productName: string,
  quantity: Qty,
  options: { rate: Money },
): Promise<void> {
  const value = multiplyRate(quantity, options.rate);
  const companyId = session.companyId;

  await tx.insert(productStock).values({
    companyId,
    productId,
    quantity: qtyToDb(quantity),
    value: moneyToDb(value),
    avgCost: moneyToDb(options.rate),
  });

  const description = `${productName} — প্রারম্ভিক স্টক`;
  const entry = await postOpeningBalance(tx, session, {
    accountId: await systemAccountId(tx, companyId, "inventory"),
    amount: value,
    description,
  });

  // Zero-value stock posts no journal line, but the movement still belongs in
  // the history or the running balance starts from a quantity it cannot explain.
  await tx.insert(stockMovements).values({
    companyId,
    productId,
    transactionId: entry.transactionId,
    direction: "in",
    movementType: "opening",
    quantity: qtyToDb(quantity),
    rate: moneyToDb(options.rate),
    value: moneyToDb(value),
    quantityAfter: qtyToDb(quantity),
    avgCostAfter: moneyToDb(options.rate),
    stockValueAfter: moneyToDb(value),
  });
}
