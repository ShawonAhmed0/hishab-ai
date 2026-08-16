/**
 * Integration tests against a real Postgres.
 *
 * These are the two claims that cannot be proven with a mock: that row-level
 * security actually isolates companies, and that a posted entry moves every
 * balance the spec says it should. Both run against the live schema, triggers
 * and policies.
 *
 * Skipped automatically when DATABASE_URL is unset, so `npm test` still works
 * on a machine with no database.
 */
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDb,
  financialAccounts,
  getDb,
  parties,
  products,
  tenantQuery,
  token,
  units,
  withTenant,
  withUser,
} from "@hishabai/db";
import { money, moneyToDb, subMoney } from "@hishabai/shared";
import { cancelTransaction, createTransaction, listTransactions } from "./transactions";
import { createFinancialAccount } from "./companies";
import { getDashboard } from "./dashboard";
import { getProductDetail } from "./inventory";
import { getParties, getPartyLedger } from "./party-ledger";
import { search } from "./search";
import {
  getCashBook,
  getDueAging,
  getProfitLoss,
  getRegister,
  getStockReport,
} from "./reports";
import {
  createParty,
  createProduct,
  listParties,
  listProducts,
  loadEntryFormData,
} from "./master-data";
import { createRecipe } from "./recipes";
import { getNotifications, markAllNotificationsRead } from "./notifications";
import { getSettings } from "./settings";
import type { Session } from "./session";

const hasDatabase = Boolean(process.env["DATABASE_URL"]);
const describeDb = hasDatabase ? describe : describe.skip;

interface Tenant {
  session: Session;
  companyId: string;
  userId: string;
  cashWalletId: string;
  unitKgId: string;
}

async function makeTenant(label: string): Promise<Tenant> {
  const userId = randomUUID();

  // Both go through the SECURITY DEFINER bootstrap functions, exactly as the
  // application does — the runtime role cannot write these tables directly,
  // which is the point.
  const companyId = await withUser(userId, async (tx) => {
    await tx.execute(sql`select app.ensure_profile(${`পরীক্ষা ${label}`})`);
    const rows = await tx.execute<{ id: string }>(
      sql`select app.create_company(${`Test ${label}`}, ${`পরীক্ষা ${label}`}) as id`,
    );
    return (rows as unknown as { id: string }[])[0]!.id;
  });

  const session: Session = { userId, companyId, role: "admin" };

  const { walletId, unitId } = await withTenant(session, async (tx) => {
    const [wallet] = await tx
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(eq(financialAccounts.companyId, companyId))
      .limit(1);
    const [unit] = await tx
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.companyId, companyId), eq(units.symbol, "kg")))
      .limit(1);
    return { walletId: wallet!.id, unitId: unit!.id };
  });

  return { session, companyId, userId, cashWalletId: walletId, unitKgId: unitId };
}

async function dropTenant(tenant: Tenant | undefined): Promise<void> {
  if (!tenant) return;
  await withTenant(tenant.session, async (tx) => {
    await tx.execute(sql`delete from companies where id = ${tenant.companyId}`);
  });
  await withUser(tenant.userId, async (tx) => {
    await tx.execute(sql`delete from profiles where id = ${tenant.userId}`);
  });
}

async function seedParty(
  tenant: Tenant,
  name: string,
  type: "customer" | "vendor" = "customer",
): Promise<string> {
  return withTenant(tenant.session, async (tx) => {
    const [row] = await tx
      .insert(parties)
      .values({ companyId: tenant.companyId, name, type })
      .returning({ id: parties.id });
    return row!.id;
  });
}

/** A product with opening stock, so a sale has something to cost against. */
async function seedProduct(
  tenant: Tenant,
  name: string,
  quantity: string,
  avgCost: string,
): Promise<string> {
  return withTenant(tenant.session, async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        companyId: tenant.companyId,
        nameBn: name,
        kind: "finished_good",
        unitId: tenant.unitKgId,
        salePrice: "160",
        purchasePrice: avgCost,
      })
      .returning({ id: products.id });

    const value = (BigInt(quantity) * BigInt(avgCost)).toString();
    await tx.execute(sql`
      insert into product_stock (company_id, product_id, quantity, value, avg_cost)
      values (${tenant.companyId}::uuid, ${row!.id}::uuid, ${quantity}, ${value}, ${avgCost})
    `);
    return row!.id;
  });
}

describeDb("company isolation is enforced by the database", () => {
  let alpha: Tenant;
  let beta: Tenant;

  beforeAll(async () => {
    alpha = await makeTenant("Alpha");
    beta = await makeTenant("Beta");
    await seedParty(alpha, "আলফা কাস্টমার");
    await seedParty(beta, "বিটা কাস্টমার");
  }, 60_000);

  afterAll(async () => {
    await dropTenant(alpha);
    await dropTenant(beta);
    await closeDb();
  }, 60_000);

  it("shows each company only its own parties", async () => {
    const alphaParties = await listParties(alpha.session);
    const betaParties = await listParties(beta.session);

    expect(alphaParties.map((p) => p.name)).toEqual(["আলফা কাস্টমার"]);
    expect(betaParties.map((p) => p.name)).toEqual(["বিটা কাস্টমার"]);
  });

  it("returns nothing when a session asks for another company's rows by id", async () => {
    // Beta's user, scoped to Beta, asking for a row that belongs to Alpha.
    const leaked = await withTenant(beta.session, async (tx) =>
      tx.execute<{ count: string }>(sql`
        select count(*)::text as count from parties
         where company_id = ${alpha.companyId}::uuid
      `),
    );
    expect((leaked as unknown as { count: string }[])[0]!.count).toBe("0");
  });

  it("refuses a session that claims a company the user does not belong to", async () => {
    const impostor: Session = { ...beta.session, companyId: alpha.companyId };
    const rows = await listParties(impostor);
    // Membership fails, so the policy denies every row rather than erroring.
    expect(rows).toEqual([]);
  });

  it("keeps every tenant table closed, not just the ones we remembered", async () => {
    const tables = [
      "accounts",
      "financial_accounts",
      "units",
      "product_categories",
      "transactions",
      "journal_lines",
      "audit_logs",
    ];

    for (const table of tables) {
      const rows = await withTenant(beta.session, async (tx) =>
        tx.execute<{ count: string }>(
          sql.raw(
            `select count(*)::text as count from ${table} where company_id = '${alpha.companyId}'`,
          ),
        ),
      );
      expect(
        (rows as unknown as { count: string }[])[0]!.count,
        `${table} leaked rows across companies`,
      ).toBe("0");
    }
  });

  // ---- the one-round-trip read path ----
  //
  // tenantRead sends the context and the query as a single simple-protocol
  // batch instead of a transaction. That is a second way into the same data,
  // so it gets the same isolation tests rather than inheriting trust from
  // withTenant.

  it("denies the one-trip read the same rows it denies a transaction", async () => {
    const impostor = { userId: beta.session.userId, companyId: alpha.companyId };

    expect(await listTransactions(impostor)).toEqual([]);
    expect(await loadEntryFormData(impostor)).toMatchObject({
      parties: [],
      products: [],
      units: [],
    });

    const dashboard = await getDashboard(impostor);
    expect(dashboard.recent).toEqual([]);
    expect(dashboard.tiles.stockValue).toBe(0n);
  });

  it("keeps global search inside the company that asked", async () => {
    // Search is the one read that takes arbitrary user text, so it runs through
    // withTenant with bound parameters rather than the one-trip path. A second
    // way into the data gets its own isolation test.
    const alphaHits = await search(alpha.session, "কাস্টমার");
    const betaHits = await search(beta.session, "কাস্টমার");

    expect(alphaHits.parties.map((p) => p.name)).toEqual(["আলফা কাস্টমার"]);
    expect(betaHits.parties.map((p) => p.name)).toEqual(["বিটা কাস্টমার"]);

    const impostor: Session = { ...beta.session, companyId: alpha.companyId };
    expect((await search(impostor, "কাস্টমার")).total).toBe(0);
  });

  it("leaves no tenant context behind on the pooled connection", async () => {
    // If set_config outlived the batch, a later query that sets no context
    // would inherit the last one — turning a fail-closed boundary into a
    // fail-open one.
    await listTransactions(alpha.session);

    const rows = (await getDb().execute<{ company: string | null; user: string | null }>(sql`
      select current_setting('app.company_id', true) as company,
             current_setting('app.user_id', true) as user
    `)) as unknown as { company: string | null; user: string | null }[];

    expect(rows[0]!.company ?? "").toBe("");
    expect(rows[0]!.user ?? "").toBe("");
  });

  it("refuses to interpolate anything that is not a uuid, date or integer", async () => {
    await expect(
      listTransactions({ userId: alpha.session.userId, companyId: "'; drop table parties --" }),
    ).rejects.toThrow(/must be UUIDs/);

    expect(() => tenantQuery`select ${"drop table parties"}`).toThrow(/only UUIDs/);
    expect(() => tenantQuery`select ${1.5}`).toThrow(/not an integer/);
    expect(() => token("parties; drop table parties")).toThrow(/not a bare token/);

    // The filters the হিসাব list actually passes are still accepted.
    expect(tenantQuery`${"2026-08-16"} ${42} ${token("sale")}`).toBe("'2026-08-16' 42 'sale'");
  });
});

describeDb("the ৳80,000 sale, end to end", () => {
  let tenant: Tenant;
  let partyId: string;
  let productId: string;
  let transactionId: string;

  beforeAll(async () => {
    tenant = await makeTenant("Paper Star");
    partyId = await seedParty(tenant, "মায়ের দোয়া ট্রেডার্স");
    productId = await seedProduct(tenant, "অফসেট পেপার", "1000", "120");
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  it("posts 500 KG × ৳160 with ৳50,000 received", async () => {
    const result = await createTransaction(tenant.session, {
      type: "sale",
      date: "2026-08-16",
      source: "manual",
      partyId,
      memoNo: "125",
      lines: [
        { productId, unitId: tenant.unitKgId, quantity: "500", rate: "160" },
      ],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "50000" }],
    });

    transactionId = result.transactionId;

    expect(moneyToDb(result.totals.total)).toBe("80000.0000");
    expect(moneyToDb(result.totals.paid)).toBe("50000.0000");
    expect(moneyToDb(result.totals.due)).toBe("30000.0000");
    expect(result.voucherNo).toMatch(/^SALE-\d{6}$/);
  });

  it("moves নগদ, বকেয়া and স্টক the way the spec says", async () => {
    const dashboard = await getDashboard(tenant.session);

    expect(moneyToDb(dashboard.tiles.cash)).toBe("50000.0000");
    expect(moneyToDb(dashboard.tiles.customerDue)).toBe("30000.0000");
    // 1000 KG opening at ৳120, less 500 KG sold.
    expect(moneyToDb(dashboard.tiles.stockValue)).toBe("60000.0000");

    const [product] = await listProducts(tenant.session);
    expect(Number(product!.quantity)).toBe(500);
  });

  it("records the sale as income for the month", async () => {
    const dashboard = await getDashboard(tenant.session, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(moneyToDb(dashboard.tiles.monthIncome)).toBe("80000.0000");
    // Cost of goods sold: 500 KG at the ৳120 running average.
    expect(moneyToDb(dashboard.tiles.monthExpense)).toBe("60000.0000");
    expect(moneyToDb(dashboard.tiles.netProfit)).toBe("20000.0000");
  });

  it("returns every balance to where it started when cancelled", async () => {
    const cancellation = await cancelTransaction(
      tenant.session,
      transactionId,
      "পরীক্ষার জন্য",
    );
    expect(cancellation.reversalVoucherNo).toMatch(/^CNCL-\d{6}$/);

    const dashboard = await getDashboard(tenant.session);
    expect(moneyToDb(dashboard.tiles.cash)).toBe("0.0000");
    expect(moneyToDb(dashboard.tiles.customerDue)).toBe("0.0000");
    expect(moneyToDb(dashboard.tiles.stockValue)).toBe("120000.0000");

    const [product] = await listProducts(tenant.session);
    expect(Number(product!.quantity)).toBe(1000);
  });

  it("keeps the original entry rather than deleting it", async () => {
    const rows = await withTenant(tenant.session, async (tx) =>
      tx.execute<{ status: string; cancel_reason: string }>(sql`
        select status::text, cancel_reason from transactions where id = ${transactionId}::uuid
      `),
    );
    const row = (rows as unknown as { status: string; cancel_reason: string }[])[0];
    expect(row?.status).toBe("cancelled");
    expect(row?.cancel_reason).toBe("পরীক্ষার জন্য");
  });

  it("refuses an unbalanced journal even when the application is bypassed", async () => {
    // The engine cannot produce this; the constraint trigger is the second lock.
    await expect(
      withTenant(tenant.session, async (tx) => {
        const [entry] = await tx.execute<{ id: string }>(sql`
          insert into journal_entries (company_id, transaction_id, date)
          values (${tenant.companyId}::uuid, ${transactionId}::uuid, '2026-08-16')
          returning id
        `) as unknown as { id: string }[];

        await tx.execute(sql`
          insert into journal_lines (company_id, journal_entry_id, transaction_id, account_id, debit, credit, date)
          select ${tenant.companyId}::uuid, ${entry!.id}::uuid, ${transactionId}::uuid, id, 100, 0, '2026-08-16'
            from accounts where company_id = ${tenant.companyId}::uuid limit 1
        `);
      }),
    ).rejects.toThrow(/হিসাব মেলেনি|unbalanced/i);
  });

  it("blocks an operator from cancelling", async () => {
    const operator: Session = { ...tenant.session, role: "operator" };
    await expect(
      cancelTransaction(operator, transactionId, "চেষ্টা"),
    ).rejects.toThrow(/permission/i);
  });

  it("puts opening stock in the ledger, not just the stock table", async () => {
    // Opening stock used to be written straight into product_stock, so the
    // three places that describe inventory disagreed: the cache said the goods
    // existed, the control account had never heard of them, and the movement
    // history began mid-story. A balance sheet built on that would understate
    // assets by the whole opening balance.
    const productId = await createProduct(tenant.session, {
      nameBn: "প্রারম্ভিক পরীক্ষা",
      kind: "raw_material",
      unitId: tenant.unitKgId,
      purchasePrice: "50",
      salePrice: "70",
      minStockLevel: "0",
      openingQuantity: "200",
      openingRate: "50",
    });

    const detail = await getProductDetail(tenant.session, productId);
    expect(detail?.movements.map((m) => m.movementType)).toEqual(["opening"]);
    expect(detail?.movements[0]?.quantityAfter).toBe("200.000000");

    const [totals] = (await withTenant(tenant.session, async (tx) =>
      tx.execute(sql`
        select
          (select coalesce(sum(value), 0)::text from product_stock
            where company_id = ${tenant.companyId}::uuid and product_id = ${productId}::uuid) as cached,
          (select coalesce(sum(jl.debit - jl.credit), 0)::text from journal_lines jl
             join accounts a on a.id = jl.account_id
            where jl.company_id = ${tenant.companyId}::uuid
              and a.subtype = 'inventory'
              and jl.transaction_id in (
                select transaction_id from stock_movements
                 where company_id = ${tenant.companyId}::uuid and product_id = ${productId}::uuid)) as posted
      `),
    )) as unknown as { cached: string; posted: string }[];

    // 200 × ৳50 — the same number in the cache and in the control account.
    expect(totals!.cached).toBe("10000.0000");
    expect(totals!.posted).toBe("10000.0000");
  });

});

describeDb("the party statement", () => {
  let tenant: Tenant;
  let customerId: string;
  let vendorId: string;

  beforeAll(async () => {
    tenant = await makeTenant("Statement Co");
    customerId = await seedParty(tenant, "মায়ের দোয়া ট্রেডার্স");
    vendorId = await seedParty(tenant, "রহমান পেপার মিলস", "vendor");
    const productId = await seedProduct(tenant, "অফসেট পেপার", "1000", "120");

    // Both sides on the same date, each half paid — which is exactly the case
    // where the ordering and the sign have to be right.
    await createTransaction(tenant.session, {
      type: "sale",
      date: "2026-08-16",
      source: "manual",
      partyId: customerId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "500", rate: "160" }],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "50000" }],
    });

    await createTransaction(tenant.session, {
      type: "purchase",
      date: "2026-08-16",
      source: "manual",
      partyId: vendorId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "100", rate: "100" }],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "4000" }],
    });
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  it("lists the bill before the payment that settles it", async () => {
    // Both lines carry the same date and the same created_at, so before the
    // sort key learned about subtype the fall-through was jl.id — a random
    // uuid, which put the receipt first about half the time and opened the
    // statement at −৳50,000 against a bill that had not appeared yet.
    const view = await getPartyLedger(tenant.session, customerId, "receivable");

    expect(view!.entries.map((e) => Number(e.debit))).toEqual([80000, 0]);
    expect(view!.entries.map((e) => Number(e.credit))).toEqual([0, 50000]);
    expect(view!.entries.map((e) => Number(e.balance))).toEqual([80000, 30000]);
  });

  it("closes at the balance the ledger maintains separately", async () => {
    const view = await getPartyLedger(tenant.session, customerId, "receivable");
    const last = view!.entries.at(-1)!;

    // The statement adds the journal up itself; party_balances is maintained by
    // trigger. They are two readings of the same postings and must agree.
    expect(Number(last.balance)).toBe(Number(view!.party.receivable));
  });

  it("counts a vendor's bill up, not down", async () => {
    // A vendor's bill is a credit to payable, so the raw debit − credit running
    // total would descend into negative numbers and print as ৳-6,000 owed.
    const view = await getPartyLedger(tenant.session, vendorId, "payable");

    expect(view!.entries.map((e) => Number(e.credit))).toEqual([10000, 0]);
    expect(view!.entries.map((e) => Number(e.debit))).toEqual([0, 4000]);
    expect(view!.entries.map((e) => Number(e.balance))).toEqual([10000, 6000]);
    expect(Number(view!.party.payable)).toBe(6000);
  });

  it("keeps the two sides on their own lists", async () => {
    const customers = await getParties(tenant.session, { type: "customer" });
    const vendors = await getParties(tenant.session, { type: "vendor" });

    expect(customers.parties.map((p) => p.name)).toEqual(["মায়ের দোয়া ট্রেডার্স"]);
    expect(vendors.parties.map((p) => p.name)).toEqual(["রহমান পেপার মিলস"]);
    expect(Number(customers.summary.totalReceivable)).toBe(30000);
    expect(Number(vendors.summary.totalPayable)).toBe(6000);
  });

  it("derives lifetime totals from the journal, not the unwritten columns", async () => {
    // party_balances has total_sales / total_purchases / total_received /
    // total_paid, and apply_journal_line never writes any of them. Reading them
    // would show a permanent ৳0 next to মোট বিক্রয় on every profile.
    const { parties: list } = await getParties(tenant.session, { type: "vendor" });
    const vendor = list[0]!;

    expect(Number(vendor.totalPurchases)).toBe(10000);
    expect(Number(vendor.totalPaid)).toBe(4000);
  });

  it("finds the same numbers through search as through the list", async () => {
    // Two query paths — one interpolated, one bound — and a profile that
    // disagrees with itself depending on how you got there is the failure.
    const listed = await getParties(tenant.session, { type: "vendor" });
    const found = await getParties(tenant.session, { type: "vendor", search: "রহমান" });

    expect(found.parties).toEqual(listed.parties);
    expect(found.summary).toEqual(listed.summary);
  });
});

describeDb("the report suite", () => {
  let tenant: Tenant;
  let customerId: string;
  let vendorId: string;
  const period = { from: "2026-08-01", to: "2026-08-31" };

  beforeAll(async () => {
    tenant = await makeTenant("Report Co");
    customerId = await seedParty(tenant, "মায়ের দোয়া ট্রেডার্স");
    vendorId = await seedParty(tenant, "রহমান পেপার মিলস", "vendor");

    // 1,000 kg opening at ৳120 through createProduct, so the opening entry is
    // in the ledger and the reports have a starting balance to disagree about.
    const productId = await createProduct(tenant.session, {
      nameBn: "অফসেট পেপার",
      kind: "finished_good",
      unitId: tenant.unitKgId,
      purchasePrice: "120",
      salePrice: "160",
      minStockLevel: "100",
      openingQuantity: "1000",
      openingRate: "120",
    });

    await createTransaction(tenant.session, {
      type: "sale",
      date: "2026-08-16",
      source: "manual",
      partyId: customerId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "500", rate: "160" }],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "50000" }],
    });

    await createTransaction(tenant.session, {
      type: "purchase",
      date: "2026-08-16",
      source: "manual",
      partyId: vendorId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "400", rate: "125" }],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "20000" }],
    });
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  it("reports the profit the sale actually made", async () => {
    const pl = await getProfitLoss(tenant.session, period);

    // 500 kg out at ৳160 against ৳120 average cost.
    expect(moneyToDb(pl.totals.sales)).toBe("80000.0000");
    expect(moneyToDb(pl.totals.cogs)).toBe("60000.0000");
    expect(moneyToDb(pl.totals.grossProfit)).toBe("20000.0000");
    expect(moneyToDb(pl.totals.netProfit)).toBe("20000.0000");
  });

  it("leaves a cancelled voucher out of the profit", async () => {
    // Posted into its own month so the ledger the other tests assert on stays
    // untouched — the reversal carries the original's date, so both halves land
    // together here rather than smearing across two periods.
    const september = { from: "2026-09-01", to: "2026-09-30" };
    const extra = await createTransaction(tenant.session, {
      type: "income",
      date: "2026-09-05",
      source: "manual",
      categoryAccountId: await otherIncomeAccount(tenant),
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "5000" }],
    });

    const before = await getProfitLoss(tenant.session, september);
    expect(moneyToDb(before.totals.income)).toBe("5000.0000");

    await cancelTransaction(tenant.session, extra.transactionId, "ভুল এন্ট্রি");

    // Cancellation posts a mirror entry rather than deleting anything, so the
    // two lines net to zero and the `having` clause drops the account entirely
    // — no phantom ৳0 row on a report nobody wants explained.
    const after = await getProfitLoss(tenant.session, september);
    expect(moneyToDb(after.totals.income)).toBe("0.0000");
    expect(after.income).toEqual([]);
  });

  it("ages the outstanding money by the bill it belongs to", async () => {
    const aging = await getDueAging(tenant.session, { asOf: "2026-08-31", side: "receivable" });

    expect(aging.rows).toHaveLength(1);
    expect(moneyToDb(aging.rows[0]!.total)).toBe("30000.0000");
    // The bill is 15 days old on the as-of date, so all of it is in the first
    // bucket — and none of it anywhere else.
    expect(moneyToDb(aging.totals["0-30"])).toBe("30000.0000");
    expect(moneyToDb(aging.totals["31-60"])).toBe("0.0000");
    expect(aging.rows[0]!.oldestDays).toBe(15);
  });

  it("does not age money that has already been paid", async () => {
    // ৳50,000 of the ৳80,000 bill was settled on the spot. Reading
    // transactions.due_amount would age the whole bill for ever, because that
    // column is written once at posting and never revisited.
    const aging = await getDueAging(tenant.session, { asOf: "2026-08-31", side: "receivable" });
    expect(moneyToDb(aging.totals.all)).toBe("30000.0000");
  });

  it("registers the sale and the purchase on their own sides", async () => {
    const sales = await getRegister(tenant.session, { ...period, type: "sale" });
    const purchases = await getRegister(tenant.session, { ...period, type: "purchase" });

    expect(sales.totals.count).toBe(1);
    expect(moneyToDb(sales.totals.total)).toBe("80000.0000");
    expect(moneyToDb(sales.totals.due)).toBe("30000.0000");
    expect(sales.byProduct[0]?.quantity).toBe("500.000000");

    expect(purchases.totals.count).toBe(1);
    expect(moneyToDb(purchases.totals.total)).toBe("50000.0000");
    expect(purchases.byProduct[0]?.quantity).toBe("400.000000");
  });

  it("moves stock from opening to closing without losing any", async () => {
    const stock = await getStockReport(tenant.session, period);
    const paper = stock.rows.find((row) => row.name === "অফসেট পেপার")!;

    // Nothing existed before this month, so opening is zero and the 1,000 kg
    // of opening stock arrives as a movement inside the period.
    expect(Number(paper.openingQty)).toBe(0);
    expect(Number(paper.inQty)).toBe(1400);
    expect(Number(paper.outQty)).toBe(500);
    expect(Number(paper.closingQty)).toBe(900);
    // 1,000 at ৳120 plus 400 at ৳125, weighted.
    expect(moneyToDb(stock.totals.closingValue)).toBe("110000.0000");
  });

  it("ties the cash book to the wallet balance the trigger maintains", async () => {
    const book = await getCashBook(tenant.session, period);

    expect(moneyToDb(book.opening)).toBe("0.0000");
    expect(moneyToDb(book.totals.received)).toBe("50000.0000");
    expect(moneyToDb(book.totals.paid)).toBe("20000.0000");
    expect(moneyToDb(book.closing)).toBe("30000.0000");

    // The report adds the journal up; the wallet is maintained by trigger from
    // those same lines. Two readings of one truth.
    const cash = book.wallets.find((w) => w.kind === "cash")!;
    expect(moneyToDb(cash.balance)).toBe(moneyToDb(book.closing));
  });

  it("posts a wallet's opening balance instead of assigning it", async () => {
    // The old version set financial_accounts.balance directly, so the row
    // carried the opening amount plus every journal delta while the account's
    // ledger balance carried only the deltas. Both look plausible alone; they
    // disagree by exactly the opening figure.
    const bankId = await createFinancialAccount(tenant.session, {
      kind: "bank",
      nameBn: "ইসলামী ব্যাংক",
      bankName: "Islami Bank",
      accountNumber: "20501234567890",
      openingBalance: "25000",
    });

    const [row] = (await withTenant(tenant.session, async (tx) =>
      tx.execute(sql`
        select fa.balance::text as wallet, ab.balance::text as ledger
          from financial_accounts fa
          join account_balances ab on ab.account_id = fa.account_id
                                  and ab.company_id = fa.company_id
         where fa.id = ${bankId}::uuid
      `),
    )) as unknown as { wallet: string; ledger: string }[];

    expect(row!.wallet).toBe("25000.0000");
    // The bank's ledger account is shared with any other bank wallet, but this
    // company has only one, so the two figures are the same posting.
    expect(row!.ledger).toBe("25000.0000");
  });

  it("finds a voucher by the amount somebody half remembers", async () => {
    // "80000" is how a shopkeeper looks for the ৳80,000 sale — not by voucher
    // number, which they never read.
    const byAmount = await search(tenant.session, "80000");
    expect(byAmount.transactions.map((t) => t.voucherNo)).toContain("SALE-000001");

    // And the same box has to answer a phone number and a name.
    const byPhone = await search(tenant.session, "রহমান");
    expect(byPhone.parties.map((p) => p.name)).toEqual(["রহমান পেপার মিলস"]);

    // One character would match most of the database and help nobody.
    expect((await search(tenant.session, "র")).total).toBe(0);
  });

  it("refuses a range that runs backwards", async () => {
    await expect(
      getProfitLoss(tenant.session, { from: "2026-08-31", to: "2026-08-01" }),
    ).rejects.toThrow(/শুরুর তারিখ/);
  });
});

/** The seeded chart of accounts always has one; the income entry needs a খাত. */
async function otherIncomeAccount(tenant: Tenant): Promise<string> {
  const rows = (await withTenant(tenant.session, async (tx) =>
    tx.execute(sql`
      select id from accounts
       where company_id = ${tenant.companyId}::uuid
         and subtype = 'other_income'
       limit 1
    `),
  )) as unknown as { id: string }[];
  return rows[0]!.id;
}

/** Any account in the company's chart, chosen by what it is for. */
async function accountBySubtype(tenant: Tenant, subtype: string): Promise<string> {
  const rows = (await withTenant(tenant.session, async (tx) =>
    tx.execute(sql`
      select id from accounts
       where company_id = ${tenant.companyId}::uuid
         and subtype = ${subtype}
       limit 1
    `),
  )) as unknown as { id: string }[];
  return rows[0]!.id;
}

/**
 * The three entries the picker offered but the form could never send.
 *
 * উৎপাদন, স্টক সমন্বয় and অন্যান্য were posted by the engine and named in the
 * schema from the beginning, but `buildPayload` had no case for them, so every
 * one of them left the browser as `{ date, type }` and died in validation. The
 * shapes below are what the form now sends.
 */
describeDb("উৎপাদন, স্টক সমন্বয় and অন্যান্য", () => {
  let tenant: Tenant;
  let rival: Tenant;
  let flourId: string;
  let breadId: string;

  beforeAll(async () => {
    tenant = await makeTenant("Bakery");
    rival = await makeTenant("Rival Bakery");

    // Opening stock through the posting path, so the ledger and the cache
    // start out agreeing and can be compared again at the end.
    flourId = await createProduct(tenant.session, {
      nameBn: "ময়দা",
      kind: "raw_material",
      unitId: tenant.unitKgId,
      purchasePrice: "100",
      salePrice: "0",
      minStockLevel: "0",
      openingQuantity: "500",
      openingRate: "100",
    });
    breadId = await createProduct(tenant.session, {
      nameBn: "পাউরুটি",
      kind: "finished_good",
      unitId: tenant.unitKgId,
      purchasePrice: "0",
      salePrice: "200",
      minStockLevel: "0",
      openingQuantity: "0",
      openingRate: "0",
    });
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await dropTenant(rival);
    await closeDb();
  }, 60_000);

  it("turns 500 KG of ময়দা into 450 KG of পাউরুটি", async () => {
    const result = await createTransaction(tenant.session, {
      type: "production",
      date: "2026-08-16",
      source: "manual",
      inputs: [{ productId: flourId, unitId: tenant.unitKgId, quantity: "500" }],
      outputs: [{ productId: breadId, unitId: tenant.unitKgId, quantity: "450" }],
      wastage: [
        {
          productId: flourId,
          unitId: tenant.unitKgId,
          quantity: "50",
          reason: "পুড়ে গেছে",
        },
      ],
      laborCost: "0",
      otherCost: "0",
      payments: [],
    });

    expect(result.voucherNo).toMatch(/^PROD-\d{6}$/);
    // ৳50,000 of flour in, ৳5,000 of it wasted, so ৳45,000 follows the bread.
    const detail = await getProductDetail(tenant.session, breadId);
    expect(detail?.product.quantity).toBe("450.000000");
    expect(detail?.product.value).toBe("45000.0000");
    expect(detail?.product.avgCost).toBe("100.0000");

    const flour = await getProductDetail(tenant.session, flourId);
    expect(flour?.product.quantity).toBe("0.000000");
  });

  it("refuses conversion cost that no wallet actually paid", async () => {
    // Accruing labour against nobody would invent a liability the vendor
    // report has never heard of, so the engine insists on a real payment.
    await expect(
      createTransaction(tenant.session, {
        type: "production",
        date: "2026-08-16",
        source: "manual",
        inputs: [{ productId: flourId, unitId: tenant.unitKgId, quantity: "1" }],
        outputs: [{ productId: breadId, unitId: tenant.unitKgId, quantity: "1" }],
        wastage: [],
        laborCost: "5000",
        otherCost: "0",
        payments: [],
      }),
      // `message` carries the English for the log; the shopkeeper reads
      // `messageBn`, so that is the one worth asserting on.
    ).rejects.toMatchObject({ messageBn: expect.stringContaining("লেবার") });
  });

  it("writes down what the physical count could not find", async () => {
    const result = await createTransaction(tenant.session, {
      type: "stock_adjustment",
      date: "2026-08-17",
      source: "manual",
      adjustments: [
        {
          productId: breadId,
          unitId: tenant.unitKgId,
          countedQuantity: "440",
          reason: "গুনে কম পাওয়া গেছে",
        },
      ],
    });

    expect(result.voucherNo).toMatch(/^ADJ-\d{6}$/);
    // The user said 440; nobody typed the 10 that went missing, or its value.
    const detail = await getProductDetail(tenant.session, breadId);
    expect(detail?.product.quantity).toBe("440.000000");
    expect(detail?.product.value).toBe("44000.0000");
  });

  it("posts অন্যান্য from two plain lists rather than Dr and Cr", async () => {
    const expenseAccountId = await accountBySubtype(tenant, "operating_expense");
    const cashAccountId = await withTenant(tenant.session, async (tx) => {
      const rows = (await tx.execute(sql`
        select account_id from financial_accounts
         where id = ${tenant.cashWalletId}::uuid
      `)) as unknown as { account_id: string }[];
      return rows[0]!.account_id;
    });

    const before = await getDashboard(tenant.session);

    const result = await createTransaction(tenant.session, {
      type: "other",
      date: "2026-08-18",
      source: "manual",
      description: "দোকানের সাইনবোর্ড",
      entries: [
        { accountId: expenseAccountId, debit: "2000", credit: "0" },
        { accountId: cashAccountId, debit: "0", credit: "2000" },
      ],
    });

    expect(result.voucherNo).toMatch(/^JV-\d{6}$/);

    const after = await getDashboard(tenant.session);
    expect(moneyToDb(after.tiles.cash)).toBe(
      moneyToDb(subMoney(before.tiles.cash, money("2000"))),
    );
  });

  it("refuses an অন্যান্য entry that names another company's account", async () => {
    // The foreign key is enforced by a trigger running as the table owner, and
    // that bypasses RLS — so nothing in the database stops a crafted account_id
    // from another company landing in this company's journal. The check has to
    // happen before the engine sees it.
    const strayAccountId = await accountBySubtype(rival, "operating_expense");
    const cashAccountId = await withTenant(tenant.session, async (tx) => {
      const rows = (await tx.execute(sql`
        select account_id from financial_accounts
         where id = ${tenant.cashWalletId}::uuid
      `)) as unknown as { account_id: string }[];
      return rows[0]!.account_id;
    });

    await expect(
      createTransaction(tenant.session, {
        type: "other",
        date: "2026-08-18",
        source: "manual",
        entries: [
          { accountId: strayAccountId, debit: "100", credit: "0" },
          { accountId: cashAccountId, debit: "0", credit: "100" },
        ],
      }),
    ).rejects.toMatchObject({
      messageBn: expect.stringContaining("এই কোম্পানির নয়"),
    });
  });

  it("refuses a sale billed to another company's party", async () => {
    const strayPartyId = await seedParty(rival, "অন্য কোম্পানির কাস্টমার");

    await expect(
      createTransaction(tenant.session, {
        type: "customer_payment",
        date: "2026-08-18",
        source: "manual",
        partyId: strayPartyId,
        payments: [{ financialAccountId: tenant.cashWalletId, amount: "100" }],
      }),
    ).rejects.toMatchObject({
      messageBn: expect.stringContaining("এই কোম্পানির নয়"),
    });
  });

  it("fills a batch in from a recipe without costing it", async () => {
    // A recipe carries quantities and no prices: what the batch is worth is
    // whatever the flour happens to have cost, which only the ledger knows.
    const recipeId = await createRecipe(tenant.session, {
      outputProductId: breadId,
      nameBn: "পাউরুটি — এক ব্যাচ",
      expectedYieldPercent: "90",
      inputs: [{ productId: flourId, quantityPerUnit: "1.111111" }],
    });

    const settings = await getSettings(tenant.session);
    const recipe = settings.recipes.find((r) => r.id === recipeId);
    expect(recipe?.outputProductNameBn).toBe("পাউরুটি");
    expect(recipe?.inputs).toHaveLength(1);
    expect(recipe?.inputs[0]?.productNameBn).toBe("ময়দা");

    // And নতুন এন্ট্রি gets it in the same round trip as everything else.
    const formData = await loadEntryFormData(tenant.session);
    expect(formData.recipes.map((r) => r.id)).toContain(recipeId);
  });

  it("refuses a recipe built from another company's product", async () => {
    const strayProductId = await createProduct(rival.session, {
      nameBn: "অন্য কোম্পানির ময়দা",
      kind: "raw_material",
      unitId: rival.unitKgId,
      purchasePrice: "0",
      salePrice: "0",
      minStockLevel: "0",
      openingQuantity: "0",
      openingRate: "0",
    });

    await expect(
      createRecipe(tenant.session, {
        outputProductId: breadId,
        inputs: [{ productId: strayProductId, quantityPerUnit: "1" }],
      }),
    ).rejects.toThrow(/এই কোম্পানির নয়/);
  });

  it("keeps the engine's warning instead of showing it once and losing it", async () => {
    // A product with no cost history: issuing it is costed at zero, which the
    // engine flags. That flag is the only record that this voucher's cost of
    // goods is a guess, so it outlives the toast that showed it.
    const ghostId = await createProduct(tenant.session, {
      nameBn: "বিনা দামের পণ্য",
      kind: "finished_good",
      unitId: tenant.unitKgId,
      purchasePrice: "0",
      salePrice: "0",
      minStockLevel: "0",
      openingQuantity: "0",
      openingRate: "0",
    });

    // Counted alongside a product that does have a cost — an adjustment of
    // nothing but zero-valued rows moves no money and the engine rejects it
    // outright, which is a different lesson.
    const result = await createTransaction(tenant.session, {
      type: "stock_adjustment",
      date: "2026-08-19",
      source: "manual",
      adjustments: [
        { productId: breadId, unitId: tenant.unitKgId, countedQuantity: "445" },
        { productId: ghostId, unitId: tenant.unitKgId, countedQuantity: "5" },
      ],
    });
    expect(result.warnings.map((w) => w.code)).toContain("ZERO_COST_ISSUE");

    const view = await getNotifications(tenant.session);
    const kept = view.notifications.find((n) => n.entityId === result.transactionId);
    expect(kept?.type).toBe("ZERO_COST_ISSUE");
    expect(kept?.isRead).toBe(false);

    await markAllNotificationsRead(tenant.session);
    const after = await getNotifications(tenant.session);
    expect(after.notifications.find((n) => n.id === kept!.id)?.isRead).toBe(true);
  });

  it("derives the low-stock alert rather than storing one that goes stale", async () => {
    // Nothing writes this row: it is true while the stock is low and stops
    // being true when a purchase lands, with no record to go out of date.
    const scarceId = await createProduct(tenant.session, {
      nameBn: "চিনি",
      kind: "raw_material",
      unitId: tenant.unitKgId,
      purchasePrice: "80",
      salePrice: "0",
      minStockLevel: "50",
      openingQuantity: "10",
      openingRate: "80",
    });

    const low = await getNotifications(tenant.session);
    expect(low.alerts.some((a) => a.kind === "low_stock" && a.titleBn.includes("চিনি"))).toBe(
      true,
    );

    await createTransaction(tenant.session, {
      type: "purchase",
      date: "2026-08-20",
      source: "manual",
      partyId: await seedParty(tenant, "চিনির ভেন্ডর", "vendor"),
      lines: [
        { productId: scarceId, unitId: tenant.unitKgId, quantity: "200", rate: "80" },
      ],
      payments: [],
    });

    const restocked = await getNotifications(tenant.session);
    expect(
      restocked.alerts.some((a) => a.kind === "low_stock" && a.titleBn.includes("চিনি")),
    ).toBe(false);
  });

  it("posts a party's opening due instead of assigning it", async () => {
    // The third time this shape of bug appeared. `createParty` wrote
    // `party_balances` straight, so the customer list showed the balance and
    // the aging report — which reads the journal — showed nothing at all. The
    // two now have to be the same number because only one of them is written.
    const openingCustomerId = await createParty(tenant.session, {
      name: "পুরোনো খাতার কাস্টমার",
      type: "customer",
      openingBalance: "50000",
    });

    const [row] = (await withTenant(tenant.session, async (tx) =>
      tx.execute(sql`
        select
          (select coalesce(receivable, 0)::text from party_balances
            where company_id = ${tenant.companyId}::uuid
              and party_id = ${openingCustomerId}::uuid) as cached,
          (select coalesce(sum(jl.debit - jl.credit), 0)::text from journal_lines jl
             join accounts a on a.id = jl.account_id
            where jl.company_id = ${tenant.companyId}::uuid
              and jl.party_id = ${openingCustomerId}::uuid
              and a.subtype = 'receivable') as posted
      `),
    )) as unknown as { cached: string; posted: string }[];

    expect(row!.cached).toBe("50000.0000");
    expect(row!.posted).toBe("50000.0000");

    // And it reaches the report that reads the journal.
    const aging = await getDueAging(tenant.session, { asOf: "2026-12-31" });
    const aged = aging.rows.find((r) => r.name === "পুরোনো খাতার কাস্টমার");
    expect(aged).toBeDefined();
    expect(moneyToDb(aged!.total)).toBe("50000.0000");
  });

  it("puts a vendor's opening balance on the other side", async () => {
    const vendorId = await createParty(tenant.session, {
      name: "পুরোনো খাতার ভেন্ডর",
      type: "vendor",
      openingBalance: "12000",
    });

    const [row] = (await withTenant(tenant.session, async (tx) =>
      tx.execute(sql`
        select coalesce(payable, 0)::text as payable from party_balances
         where company_id = ${tenant.companyId}::uuid
           and party_id = ${vendorId}::uuid
      `),
    )) as unknown as { payable: string }[];

    expect(row!.payable).toBe("12000.0000");
  });

  it("still agrees with the ledger after everything above", async () => {
    // The cache and the control account are two descriptions of the same
    // goods. What matters is that they say the same thing — not what that
    // thing is, which every test above this one moves.
    const [row] = (await withTenant(tenant.session, async (tx) =>
      tx.execute(sql`
        select
          (select coalesce(sum(value), 0)::text from product_stock
            where company_id = ${tenant.companyId}::uuid) as cached,
          (select coalesce(sum(jl.debit - jl.credit), 0)::text from journal_lines jl
             join accounts a on a.id = jl.account_id
            where jl.company_id = ${tenant.companyId}::uuid
              and a.subtype = 'inventory') as posted
      `),
    )) as unknown as { cached: string; posted: string }[];

    expect(row!.cached).toBe(row!.posted);
    expect(Number(row!.cached)).toBeGreaterThan(0);
  });
});
