/**
 * Customers, vendors, products, units and খাত — the lists the entry form picks
 * from, and the CRUD behind them.
 */
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import {
  accounts,
  financialAccounts,
  parties,
  partyBalances,
  productCategories,
  productStock,
  products,
  units,
  withTenant,
} from "@hishabai/db";
import {
  money,
  moneyToDb,
  multiplyRate,
  partyInputSchema,
  productInputSchema,
  qty,
  qtyToDb,
} from "@hishabai/shared";
import { requirePermission, type Session } from "./session";
import { writeAudit } from "./transactions";

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
        createdBy: session.userId,
      })
      .returning({ id: parties.id });

    // An opening balance is a real balance, so it seeds the party ledger.
    const opening = money(input.openingBalance);
    if (opening !== 0n) {
      await tx.insert(partyBalances).values({
        companyId: session.companyId,
        partyId: created!.id,
        receivable: input.type === "vendor" ? "0" : moneyToDb(opening),
        payable: input.type === "vendor" ? moneyToDb(opening) : "0",
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
      const openingRate = money(input.openingRate);
      await tx.insert(productStock).values({
        companyId: session.companyId,
        productId: created!.id,
        quantity: qtyToDb(openingQty),
        value: moneyToDb(multiplyRate(openingQty, openingRate)),
        avgCost: moneyToDb(openingRate),
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
 * Everything নতুন এন্ট্রি needs, in one transaction.
 *
 * Calling the six list functions in parallel opens six connections, and a
 * Supavisor pool in session mode runs out at fifteen — one page load from two
 * users was enough to exhaust it. They also belong on one snapshot: the form
 * should not show a product that a concurrent write removed halfway through
 * loading the units.
 */
export async function loadEntryFormData(session: Session) {
  return withTenant(session, async (tx) => {
    const partyRows = await tx
      .select({
        id: parties.id,
        name: parties.name,
        type: parties.type,
        receivable: partyBalances.receivable,
        payable: partyBalances.payable,
      })
      .from(parties)
      .leftJoin(
        partyBalances,
        and(
          eq(partyBalances.partyId, parties.id),
          eq(partyBalances.companyId, parties.companyId),
        ),
      )
      .where(and(eq(parties.companyId, session.companyId), eq(parties.isActive, true)))
      .orderBy(asc(parties.name));

    const productRows = await tx
      .select({
        id: products.id,
        nameBn: products.nameBn,
        kind: products.kind,
        unitId: products.unitId,
        unitSymbol: units.symbol,
        salePrice: products.salePrice,
        purchasePrice: products.purchasePrice,
        quantity: productStock.quantity,
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
      .where(and(eq(products.companyId, session.companyId), eq(products.isActive, true)))
      .orderBy(asc(products.nameBn));

    const unitRows = await tx
      .select({ id: units.id, nameBn: units.nameBn, symbol: units.symbol })
      .from(units)
      .where(and(eq(units.companyId, session.companyId), eq(units.isActive, true)))
      .orderBy(asc(units.nameBn));

    const walletRows = await tx
      .select({
        id: financialAccounts.id,
        nameBn: financialAccounts.nameBn,
        kind: financialAccounts.kind,
        isDefault: financialAccounts.isDefault,
      })
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.companyId, session.companyId),
          eq(financialAccounts.isActive, true),
        ),
      )
      .orderBy(asc(financialAccounts.kind), asc(financialAccounts.nameBn));

    const categoryRows = await tx
      .select({
        id: accounts.id,
        nameBn: accounts.nameBn,
        code: accounts.code,
        type: accounts.type,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.companyId, session.companyId),
          eq(accounts.isCategory, true),
          eq(accounts.isActive, true),
        ),
      )
      .orderBy(asc(accounts.code));

    return {
      parties: partyRows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        receivable: row.receivable ?? "0",
        payable: row.payable ?? "0",
      })),
      products: productRows.map((row) => ({ ...row, quantity: row.quantity ?? "0" })),
      units: unitRows,
      wallets: walletRows,
      incomeCategories: categoryRows.filter((row) => row.type === "income"),
      expenseCategories: categoryRows.filter((row) => row.type === "expense"),
    };
  });
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
