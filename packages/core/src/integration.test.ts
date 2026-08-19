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
import { money, moneyToDb, subMoney, todayIso } from "@hishabai/shared";
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
import { overridePinIsSet, updateOverridePin } from "./overrides";
import type { DuplicateCandidate } from "./duplicates";
import { loadAgeing } from "./ageing";
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
    // The test above consumed every kilo of ময়দা, and since R1.1 an input
    // line with nothing behind it is refused before the labour rule is ever
    // reached. So this buys a kilo first: the point being tested is the
    // unpaid labour, not the empty bin.
    await createTransaction(tenant.session, {
      type: "purchase",
      date: "2026-08-16",
      source: "manual",
      partyId: await seedParty(tenant, "ময়দা সরবরাহকারী", "vendor"),
      lines: [{ productId: flourId, unitId: tenant.unitKgId, quantity: "1", rate: "100" }],
      payments: [],
    });

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

  // X.2. R3.4 adds a third id the client picks, so it gets the same proof as
  // the other two rather than inheriting their trust.
  it("refuses a purchase whose cost খাত belongs to another company", async () => {
    const strayAccountId = await accountBySubtype(rival, "operating_expense");

    await expect(
      createTransaction(tenant.session, {
        type: "purchase",
        date: "2026-08-18",
        source: "manual",
        partyId: await seedParty(tenant, "খাতের ভেন্ডর", "vendor"),
        lines: [{ productId: flourId, unitId: tenant.unitKgId, quantity: "1", rate: "100" }],
        otherCost: "50",
        otherCostAccountId: strayAccountId,
        payments: [],
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

  it("finds a voucher by the taka, without the poisha", async () => {
    // Nobody remembers ৳1,234.56 as ৳1,234.56. Exact equality meant the only
    // findable amounts were the ones that happened to be round.
    const income = await createTransaction(tenant.session, {
      type: "income",
      date: "2026-08-21",
      source: "manual",
      categoryAccountId: await accountBySubtype(tenant, "other_income"),
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "1234.56" }],
    });

    const found = await search(tenant.session, "1234");
    expect(found.transactions.map((t) => t.voucherNo)).toContain(income.voucherNo);
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

/**
 * Cancelling the three types the form could not previously send.
 *
 * `reverseTransaction` works off journal lines and stock movements rather than
 * off the transaction type, so in principle it never needed to know these
 * existed. In principle is not the same as tested — and until now nothing
 * could create one of them to cancel.
 */
describeDb("cancelling উৎপাদন, স্টক সমন্বয় and অন্যান্য", () => {
  let tenant: Tenant;
  let flourId: string;
  let breadId: string;

  beforeAll(async () => {
    tenant = await makeTenant("Reversal Bakery");
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
    await closeDb();
  }, 60_000);

  /** Cache and control account, which must always be the same number. */
  async function inventory(): Promise<{ cached: string; posted: string }> {
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
    return row!;
  }

  it("puts every gram of a cancelled production run back", async () => {
    const before = await inventory();

    const run = await createTransaction(tenant.session, {
      type: "production",
      date: "2026-08-16",
      source: "manual",
      inputs: [{ productId: flourId, unitId: tenant.unitKgId, quantity: "500" }],
      outputs: [{ productId: breadId, unitId: tenant.unitKgId, quantity: "450" }],
      wastage: [{ productId: flourId, unitId: tenant.unitKgId, quantity: "50" }],
      laborCost: "0",
      otherCost: "0",
      payments: [],
    });

    await cancelTransaction(tenant.session, run.transactionId, "ভুল ব্যাচ");

    const after = await inventory();
    expect(after.cached).toBe(before.cached);
    expect(after.posted).toBe(before.posted);

    const flour = await getProductDetail(tenant.session, flourId);
    expect(flour?.product.quantity).toBe("500.000000");
    const bread = await getProductDetail(tenant.session, breadId);
    expect(bread?.product.quantity).toBe("0.000000");

    // The wastage account has to come back to nothing too — a cancelled run
    // wasted nothing.
    const [wastage] = (await withTenant(tenant.session, async (tx) =>
      tx.execute(sql`
        select coalesce(sum(jl.debit - jl.credit), 0)::text as total
          from journal_lines jl join accounts a on a.id = jl.account_id
         where jl.company_id = ${tenant.companyId}::uuid and a.subtype = 'wastage'
      `),
    )) as unknown as { total: string }[];
    expect(wastage!.total).toBe("0.0000");
  });

  it("puts back a cancelled stock count", async () => {
    const before = await inventory();

    const count = await createTransaction(tenant.session, {
      type: "stock_adjustment",
      date: "2026-08-17",
      source: "manual",
      adjustments: [
        { productId: flourId, unitId: tenant.unitKgId, countedQuantity: "480" },
      ],
    });

    const short = await getProductDetail(tenant.session, flourId);
    expect(short?.product.quantity).toBe("480.000000");

    await cancelTransaction(tenant.session, count.transactionId, "ভুল গণনা");

    const restored = await getProductDetail(tenant.session, flourId);
    expect(restored?.product.quantity).toBe("500.000000");
    expect(await inventory()).toEqual(before);
  });

  it("puts back a cancelled অন্যান্য entry", async () => {
    const expenseAccountId = await accountBySubtype(tenant, "operating_expense");
    const cashAccountId = await withTenant(tenant.session, async (tx) => {
      const rows = (await tx.execute(sql`
        select account_id from financial_accounts where id = ${tenant.cashWalletId}::uuid
      `)) as unknown as { account_id: string }[];
      return rows[0]!.account_id;
    });

    const before = await getDashboard(tenant.session);

    const jv = await createTransaction(tenant.session, {
      type: "other",
      date: "2026-08-18",
      source: "manual",
      entries: [
        { accountId: expenseAccountId, debit: "2000", credit: "0" },
        { accountId: cashAccountId, debit: "0", credit: "2000" },
      ],
    });

    await cancelTransaction(tenant.session, jv.transactionId, "ভুল এন্ট্রি");

    const after = await getDashboard(tenant.session);
    expect(moneyToDb(after.tiles.cash)).toBe(moneyToDb(before.tiles.cash));
  });

  it("dates the mirror entry as the original, not as today", async () => {
    // Otherwise a voucher cancelled in September would leave August's
    // profit-and-loss overstated for ever.
    const jv = await createTransaction(tenant.session, {
      type: "other",
      date: "2026-07-05",
      source: "manual",
      entries: [
        { accountId: await accountBySubtype(tenant, "operating_expense"), debit: "500", credit: "0" },
        {
          accountId: await withTenant(tenant.session, async (tx) => {
            const rows = (await tx.execute(sql`
              select account_id from financial_accounts where id = ${tenant.cashWalletId}::uuid
            `)) as unknown as { account_id: string }[];
            return rows[0]!.account_id;
          }),
          debit: "0",
          credit: "500",
        },
      ],
    });

    await cancelTransaction(tenant.session, jv.transactionId, "পরীক্ষা");

    const july = await getProfitLoss(tenant.session, { from: "2026-07-01", to: "2026-07-31" });
    expect(moneyToDb(july.totals.expense)).toBe("0.0000");
  });
});

describeDb("what an operator may and may not do", () => {
  let tenant: Tenant;

  beforeAll(async () => {
    tenant = await makeTenant("Permissions");
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  it("can post an entry but cannot invent the master data it names", async () => {
    // An operator holds `transaction.create` and nothing else, so নতুন এন্ট্রি
    // now hides the inline "নতুন কাস্টমার" and "নতুন পণ্য" panels from them —
    // the server refuses either way, and a control nobody is allowed to use is
    // worse than no control.
    const operator: Session = { ...tenant.session, role: "operator" };

    await expect(
      createParty(operator, { name: "চেষ্টা", type: "customer" }),
    ).rejects.toMatchObject({ messageBn: expect.any(String) });

    await expect(
      createProduct(operator, {
        nameBn: "চেষ্টা",
        kind: "finished_good",
        unitId: tenant.unitKgId,
      }),
    ).rejects.toMatchObject({ messageBn: expect.any(String) });

    await expect(
      createRecipe(operator, {
        outputProductId: randomUUID(),
        inputs: [{ productId: randomUUID(), quantityPerUnit: "1" }],
      }),
    ).rejects.toMatchObject({ messageBn: expect.any(String) });
  });
});

describeDb("ক্রেডিট সীমা", () => {
  let tenant: Tenant;
  let productId: string;

  beforeAll(async () => {
    tenant = await makeTenant("Credit");
    productId = await createProduct(tenant.session, {
      nameBn: "চাল",
      kind: "finished_good",
      unitId: tenant.unitKgId,
      purchasePrice: "50",
      salePrice: "80",
      minStockLevel: "0",
      openingQuantity: "1000",
      openingRate: "50",
    });
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  // Spec R3.2. This reverses what Phase 1 left alone: the limit used to warn
  // and post. It now refuses, and the refusal reads off the real receivable,
  // which is derived from journal_lines by trigger.
  it("refuses the sale that takes the customer past their limit", async () => {
    const partyId = await createParty(tenant.session, {
      name: "সীমিত কাস্টমার",
      type: "customer",
      creditLimit: "10000",
    });

    const under = await createTransaction(tenant.session, {
      type: "sale",
      date: "2026-08-16",
      source: "manual",
      partyId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "100", rate: "80" }],
      payments: [],
    });
    expect(under.voucherNo).toMatch(/^SALE-\d{6}$/);

    await expect(
      createTransaction(tenant.session, {
        type: "sale",
        date: "2026-08-17",
        source: "manual",
        partyId,
        lines: [{ productId, unitId: tenant.unitKgId, quantity: "100", rate: "80" }],
        payments: [],
      }),
    ).rejects.toMatchObject({
      code: "OVER_CREDIT_LIMIT",
      reason: {
        rule: "overCreditLimit",
        party: "সীমিত কাস্টমার",
        limit: "৳ 10,000.00",
        projected: "৳ 16,000.00",
      },
    });
  });

  it("says nothing about a customer with no limit set", async () => {
    const partyId = await createParty(tenant.session, {
      name: "সীমাহীন কাস্টমার",
      type: "customer",
    });

    const sale = await createTransaction(tenant.session, {
      type: "sale",
      date: "2026-08-18",
      source: "manual",
      partyId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "500", rate: "80" }],
      payments: [],
    });
    expect(sale.warnings.map((w) => w.code)).not.toContain("OVER_CREDIT_LIMIT");
  });

  it("counts the payment, not just the bill", async () => {
    // A ৳16,000 sale against a ৳10,000 limit is fine if ৳16,000 is handed over
    // at the counter: nothing is owed, so nothing is over the limit.
    const partyId = await createParty(tenant.session, {
      name: "নগদে কেনেন যিনি",
      type: "customer",
      creditLimit: "10000",
    });

    const sale = await createTransaction(tenant.session, {
      type: "sale",
      date: "2026-08-19",
      source: "manual",
      partyId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "200", rate: "80" }],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "16000" }],
    });
    expect(sale.warnings.map((w) => w.code)).not.toContain("OVER_CREDIT_LIMIT");
  });
});

/**
 * Spec R1.1–R1.4. The rule that used to be a warning.
 *
 * These run against the real triggers because that is the only place the claim
 * can be proved: `product_stock` is maintained from `journal_lines`, so "the
 * books have not received it" means "no journal line put it there", and a test
 * against a fixture map would be testing the fixture.
 */
describeDb("স্টক না থাকলে বিক্রয় আটকে যায়", () => {
  let tenant: Tenant;
  let vendorId: string;
  let customerId: string;

  const PIN = "4821";

  beforeAll(async () => {
    tenant = await makeTenant("Block");
    vendorId = await seedParty(tenant, "ব্লক ভেন্ডর", "vendor");
    customerId = await seedParty(tenant, "ব্লক কাস্টমার", "customer");
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  /** A product the books have never received anything for. */
  async function emptyProduct(name: string): Promise<string> {
    return createProduct(tenant.session, {
      nameBn: name,
      kind: "finished_good",
      unitId: tenant.unitKgId,
      salePrice: "160",
      purchasePrice: "120",
    });
  }

  function sell(productId: string, quantity: string, date: string) {
    return createTransaction(tenant.session, {
      type: "sale",
      date,
      source: "manual",
      partyId: customerId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity, rate: "160" }],
      payments: [],
    });
  }

  async function transactionCount(): Promise<number> {
    const rows = await withTenant(tenant.session, (tx) =>
      tx.execute<{ count: string }>(
        sql`select count(*)::text as count from transactions where company_id = ${tenant.companyId}::uuid`,
      ),
    );
    return Number((rows as unknown as { count: string }[])[0]!.count);
  }

  it("refuses the sale, and rolls the whole entry back", async () => {
    const productId = await seedProduct(tenant, "কম স্টকের পণ্য", "100", "120");
    const before = await transactionCount();

    await expect(sell(productId, "150", "2026-08-20")).rejects.toThrow(/NEGATIVE_STOCK/);

    // Not "no sale row" — no rows at all. The failure has to take the journal
    // lines and the stock movement with it.
    expect(await transactionCount()).toBe(before);

    const stock = await withTenant(tenant.session, (tx) =>
      tx.execute<{ quantity: string }>(sql`
        select quantity::text as quantity from product_stock
         where company_id = ${tenant.companyId}::uuid and product_id = ${productId}::uuid
      `),
    );
    expect((stock as unknown as { quantity: string }[])[0]!.quantity).toBe("100.000000");
  });

  it("names the product and both numbers", async () => {
    const productId = await seedProduct(tenant, "নাম দেখানোর পণ্য", "40", "120");

    await expect(sell(productId, "60", "2026-08-20")).rejects.toMatchObject({
      code: "NEGATIVE_STOCK",
      reason: {
        rule: "negativeStock",
        productId,
        product: "নাম দেখানোর পণ্য",
        available: "40 kg",
        requested: "60 kg",
      },
    });
  });

  /**
   * R1.3. The point of the requirement: goods can be sitting in the godown,
   * but until the চালান is entered they are not sellable — and the moment it
   * is, they are. No parallel counter, no flag: the same derived stock either
   * covers the sale or does not.
   */
  it("makes goods sellable exactly when the purchase entry lands", async () => {
    const productId = await emptyProduct("চালান ছাড়া পণ্য");

    await expect(sell(productId, "10", "2026-08-21")).rejects.toThrow(/NEGATIVE_STOCK/);

    await createTransaction(tenant.session, {
      type: "purchase",
      date: "2026-08-21",
      source: "manual",
      partyId: vendorId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "10", rate: "120" }],
      payments: [],
    });

    const sale = await sell(productId, "10", "2026-08-21");
    expect(sale.voucherNo).toMatch(/^SALE/);
    expect(sale.overrides).toEqual([]);
  });

  /**
   * R1.4. Material consumption is not a second code path — a production run
   * takes its raw materials out through the same `StockLedger.out`, so it is
   * refused on the same terms.
   */
  it("refuses a production run that consumes more raw material than exists", async () => {
    const rawId = await createProduct(tenant.session, {
      nameBn: "কম কাঁচামাল",
      kind: "raw_material",
      unitId: tenant.unitKgId,
      purchasePrice: "100",
    });
    const outputId = await emptyProduct("উৎপাদিত পণ্য");

    await expect(
      createTransaction(tenant.session, {
        type: "production",
        date: "2026-08-22",
        source: "manual",
        inputs: [{ productId: rawId, unitId: tenant.unitKgId, quantity: "5" }],
        outputs: [{ productId: outputId, unitId: tenant.unitKgId, quantity: "5" }],
        wastage: [],
        payments: [],
      }),
    ).rejects.toThrow(/NEGATIVE_STOCK/);
  });

  it("still lets a cancellation reverse an entry whose stock has since gone", async () => {
    const productId = await seedProduct(tenant, "ফেরতযোগ্য পণ্য", "50", "120");
    const sale = await sell(productId, "50", "2026-08-23");

    // Stock is now zero. Cancelling puts it back, and must never be refused
    // for the same reason the sale would be if it were entered fresh.
    const cancelled = await cancelTransaction(tenant.session, sale.transactionId, "ভুল হয়েছে");
    expect(cancelled.reversalVoucherNo).toBeTruthy();
  });

  describe("the authorised override", () => {
    it("refuses without a PIN set, whatever the admin types", async () => {
      const productId = await seedProduct(tenant, "PIN ছাড়া পণ্য", "10", "120");

      await expect(
        createTransaction(
          tenant.session,
          {
            type: "sale",
            date: "2026-08-24",
            source: "manual",
            partyId: customerId,
            lines: [{ productId, unitId: tenant.unitKgId, quantity: "20", rate: "160" }],
            payments: [],
          },
          { override: { pin: PIN, rules: ["negativeStock"] } },
        ),
      ).rejects.toMatchObject({ name: "OverrideError", kind: "no_pin" });
    });

    it("takes a PIN, and says so without ever handing one back", async () => {
      expect(await overridePinIsSet(tenant.session)).toBe(false);
      await updateOverridePin(tenant.session, PIN);
      expect(await overridePinIsSet(tenant.session)).toBe(true);
    });

    it("refuses the wrong PIN, and saves nothing", async () => {
      const productId = await seedProduct(tenant, "ভুল PIN পণ্য", "10", "120");
      const before = await transactionCount();

      await expect(
        createTransaction(
          tenant.session,
          {
            type: "sale",
            date: "2026-08-24",
            source: "manual",
            partyId: customerId,
            lines: [{ productId, unitId: tenant.unitKgId, quantity: "20", rate: "160" }],
            payments: [],
          },
          { override: { pin: "9999", rules: ["negativeStock"] } },
        ),
      ).rejects.toMatchObject({ name: "OverrideError", kind: "wrong_pin" });

      expect(await transactionCount()).toBe(before);
    });

    it("refuses a manager holding the right PIN", async () => {
      const productId = await seedProduct(tenant, "ম্যানেজারের পণ্য", "10", "120");

      await expect(
        createTransaction(
          { ...tenant.session, role: "manager" },
          {
            type: "sale",
            date: "2026-08-24",
            source: "manual",
            partyId: customerId,
            lines: [{ productId, unitId: tenant.unitKgId, quantity: "20", rate: "160" }],
            payments: [],
          },
          { override: { pin: PIN, rules: ["negativeStock"] } },
        ),
      ).rejects.toMatchObject({ name: "OverrideError", kind: "not_admin" });
    });

    it("lets the admin through, and writes what they overrode to the audit log", async () => {
      const productId = await seedProduct(tenant, "ওভাররাইড পণ্য", "10", "120");

      const sale = await createTransaction(
        tenant.session,
        {
          type: "sale",
          date: "2026-08-25",
          source: "manual",
          partyId: customerId,
          lines: [{ productId, unitId: tenant.unitKgId, quantity: "25", rate: "160" }],
          payments: [],
        },
        { override: { pin: PIN, rules: ["negativeStock"] } },
      );

      expect(sale.overrides).toEqual([
        {
          rule: "negativeStock",
          productId,
          product: "ওভাররাইড পণ্য",
          available: "10 kg",
          requested: "25 kg",
        },
      ]);
      // The entry posts and the warning survives, so the shopkeeper is still
      // told the stock went negative.
      expect(sale.warnings.map((w) => w.code)).toContain("NEGATIVE_STOCK");

      const rows = await withTenant(tenant.session, (tx) =>
        tx.execute<{ user_id: string; after: unknown; summary_bn: string }>(sql`
          select user_id, after, summary_bn from audit_logs
           where company_id = ${tenant.companyId}::uuid
             and action = 'override'
             and entity_id = ${sale.transactionId}::uuid
        `),
      );
      const audit = (rows as unknown as { user_id: string; after: Record<string, string>; summary_bn: string }[]);
      expect(audit).toHaveLength(1);
      expect(audit[0]!.user_id).toBe(tenant.userId);
      expect(audit[0]!.after["rule"]).toBe("negativeStock");
      expect(audit[0]!.after["requested"]).toBe("25 kg");
      expect(audit[0]!.summary_bn).toContain("পর্যাপ্ত স্টক নেই");
    });

    it("accepts the same PIN typed in Bengali numerals", async () => {
      const productId = await seedProduct(tenant, "বাংলা অঙ্কের পণ্য", "10", "120");

      const sale = await createTransaction(
        tenant.session,
        {
          type: "sale",
          date: "2026-08-25",
          source: "manual",
          partyId: customerId,
          lines: [{ productId, unitId: tenant.unitKgId, quantity: "15", rate: "160" }],
          payments: [],
        },
        { override: { pin: "৪৮২১", rules: ["negativeStock"] } },
      );
      expect(sale.overrides).toHaveLength(1);
    });
  });

  /** X.1 — a new read path is a new way in, and gets its own isolation test. */
  it("hides one admin's PIN hash from every other session", async () => {
    const other = await makeTenant("Peeper");
    try {
      const rows = await withTenant(other.session, (tx) =>
        tx.execute<{ count: string }>(
          sql`select count(*)::text as count from override_credentials`,
        ),
      );
      expect((rows as unknown as { count: string }[])[0]!.count).toBe("0");

      // And the same question asked about our row by id, explicitly.
      const targeted = await withTenant(other.session, (tx) =>
        tx.execute<{ count: string }>(sql`
          select count(*)::text as count from override_credentials
           where user_id = ${tenant.userId}::uuid
        `),
      );
      expect((targeted as unknown as { count: string }[])[0]!.count).toBe("0");
    } finally {
      await dropTenant(other);
    }
  }, 60_000);
});

/**
 * Spec R2.1 and R2.2. The two ways the same entry gets saved twice.
 */
describeDb("একই এন্ট্রি দুবার", () => {
  let tenant: Tenant;
  let vendorA: string;
  let vendorB: string;
  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    tenant = await makeTenant("Twice");
    vendorA = await seedParty(tenant, "প্রথম ভেন্ডর", "vendor");
    vendorB = await seedParty(tenant, "দ্বিতীয় ভেন্ডর", "vendor");
    customerId = await seedParty(tenant, "দুবার কাস্টমার", "customer");
    productId = await seedProduct(tenant, "দুবারের পণ্য", "100000", "100");
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  function buy(partyId: string, memoNo: string, date: string, quantity = "10") {
    return createTransaction(tenant.session, {
      type: "purchase",
      date,
      source: "manual",
      partyId,
      memoNo,
      lines: [{ productId, unitId: tenant.unitKgId, quantity, rate: "100" }],
      payments: [],
    });
  }

  it("refuses the same চালান number from the same vendor", async () => {
    await buy(vendorA, "125", "2026-09-01");

    await expect(buy(vendorA, "125", "2026-09-02")).rejects.toMatchObject({
      name: "DuplicateMemoError",
      reason: { rule: "duplicateMemo", memoNo: "125" },
    });
  });

  /**
   * The requirement says "per company", and per company alone this would be
   * refused. It should not be: on a purchase the number is the *vendor's*, and
   * two vendors both numbering their চালান from 1 is not a mistake.
   */
  it("allows the same number from a different vendor", async () => {
    const second = await buy(vendorB, "125", "2026-09-01");
    expect(second.voucherNo).toMatch(/^PURC/);
  });

  /**
   * The trap: cancelling copies `memo_no` onto the mirror entry. A unique
   * index that did not exclude reversals would make every cancellation of a
   * numbered entry fail.
   */
  it("cancels a numbered entry, and frees the number again", async () => {
    const original = await buy(vendorA, "900", "2026-09-03");
    await expect(buy(vendorA, "900", "2026-09-04")).rejects.toThrow(/already exists/);

    const cancelled = await cancelTransaction(
      tenant.session,
      original.transactionId,
      "ভুল চালান নম্বর",
    );
    expect(cancelled.reversalVoucherNo).toBeTruthy();

    // Re-entered after the mistake was undone — which is exactly what the
    // shopkeeper does next.
    const again = await buy(vendorA, "900", "2026-09-04");
    expect(again.voucherNo).toMatch(/^PURC/);
  });

  it("keeps the database as the authority, not the application check", async () => {
    const rows = await withTenant(tenant.session, (tx) =>
      tx.execute<{ indexdef: string }>(sql`
        select indexdef from pg_indexes
         where tablename = 'transactions' and indexname = 'transactions_memo_unique_idx'
      `),
    );
    const found = rows as unknown as { indexdef: string }[];
    expect(found).toHaveLength(1);
    expect(found[0]!.indexdef).toContain("UNIQUE");
    expect(found[0]!.indexdef).toContain("reversal_of_id IS NULL");
  });

  describe("the probable duplicate", () => {
    const sale = (date: string, quantity: string, memoNo?: string) =>
      createTransaction(
        tenant.session,
        {
          type: "sale",
          date,
          source: "manual",
          partyId: customerId,
          ...(memoNo ? { memoNo } : {}),
          lines: [{ productId, unitId: tenant.unitKgId, quantity, rate: "160" }],
          payments: [],
        },
        {},
      );

    it("asks before saving the same party, day, products and total twice", async () => {
      const first = await sale("2026-09-10", "5");

      await expect(sale("2026-09-10", "5")).rejects.toMatchObject({
        name: "ProbableDuplicateError",
        candidate: { voucherNo: first.voucherNo },
      });
    });

    it("hands back enough to link to the entry it found", async () => {
      try {
        await sale("2026-09-10", "5");
        expect.unreachable();
      } catch (error) {
        const { candidate } = error as { candidate: DuplicateCandidate };
        expect(candidate.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(candidate.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
        expect(candidate.total).toBe("800.0000");
      }
    });

    it("saves it once the user has said so — a repeat order is legitimate", async () => {
      const again = await createTransaction(
        tenant.session,
        {
          type: "sale",
          date: "2026-09-10",
          source: "manual",
          partyId: customerId,
          lines: [{ productId, unitId: tenant.unitKgId, quantity: "5", rate: "160" }],
          payments: [],
        },
        { confirmDuplicate: true },
      );
      expect(again.voucherNo).toMatch(/^SALE/);
    });

    it("says nothing when the total differs", async () => {
      const different = await sale("2026-09-10", "6");
      expect(different.voucherNo).toMatch(/^SALE/);
    });

    it("still refuses a repeated চালান number, confirmed or not", async () => {
      await sale("2026-09-11", "5", "777");

      await expect(
        createTransaction(
          tenant.session,
          {
            type: "sale",
            date: "2026-09-12",
            source: "manual",
            partyId: customerId,
            memoNo: "777",
            lines: [{ productId, unitId: tenant.unitKgId, quantity: "9", rate: "160" }],
            payments: [],
          },
          { confirmDuplicate: true },
        ),
      ).rejects.toMatchObject({ name: "DuplicateMemoError" });
    });
  });
});

/**
 * Spec R3.1, R3.2 and R3.3. All three read numbers the database derives —
 * `financial_accounts.balance` and the equity sum over `journal_lines` — so
 * they can only be proven against the real triggers.
 */
describeDb("টাকার হিসাবের বাধা", () => {
  let tenant: Tenant;
  let customerId: string;
  let productId: string;

  const PIN = "7788";

  beforeAll(async () => {
    tenant = await makeTenant("Funds");
    customerId = await seedParty(tenant, "টাকার কাস্টমার", "customer");
    productId = await createProduct(tenant.session, {
      nameBn: "টাকার পণ্য",
      kind: "finished_good",
      unitId: tenant.unitKgId,
      purchasePrice: "50",
      salePrice: "80",
      openingQuantity: "10000",
      openingRate: "50",
    });
    await updateOverridePin(tenant.session, PIN);
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  async function walletBalance(): Promise<string> {
    const rows = await withTenant(tenant.session, (tx) =>
      tx.execute<{ balance: string }>(sql`
        select balance::text as balance from financial_accounts
         where id = ${tenant.cashWalletId}::uuid
      `),
    );
    return (rows as unknown as { balance: string }[])[0]!.balance;
  }

  function spend(amount: string, date: string, categoryAccountId: string) {
    return createTransaction(tenant.session, {
      type: "expense",
      date,
      source: "manual",
      categoryAccountId,
      payments: [{ financialAccountId: tenant.cashWalletId, amount }],
    });
  }

  async function expenseAccount(): Promise<string> {
    const rows = await withTenant(tenant.session, (tx) =>
      tx.execute<{ id: string }>(sql`
        select id from accounts
         where company_id = ${tenant.companyId}::uuid
           and type = 'expense' and is_category = true
         limit 1
      `),
    );
    return (rows as unknown as { id: string }[])[0]!.id;
  }

  it("refuses to pay out of a wallet that does not hold it", async () => {
    // The wallet starts empty, and the balance it reads is the one the
    // trigger maintains — nothing here assigns it.
    expect(await walletBalance()).toBe("0.0000");

    await expect(spend("5000", "2026-08-16", await expenseAccount())).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
      reason: { rule: "insufficientFunds", available: "৳ 0.00", requested: "৳ 5,000.00" },
    });
  });

  it("lets the same payment through once the money is actually there", async () => {
    // Cash sale: ৳80,000 in, through the journal like everything else.
    await createTransaction(tenant.session, {
      type: "sale",
      date: "2026-08-16",
      source: "manual",
      partyId: customerId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "1000", rate: "80" }],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "80000" }],
    });
    expect(await walletBalance()).toBe("80000.0000");

    const paid = await spend("5000", "2026-08-17", await expenseAccount());
    expect(paid.voucherNo).toMatch(/^EXP/);
    expect(await walletBalance()).toBe("75000.0000");
  });

  it("takes an admin's PIN to overdraw, and records it", async () => {
    const category = await expenseAccount();

    const overdrawn = await createTransaction(
      tenant.session,
      {
        type: "expense",
        date: "2026-08-18",
        source: "manual",
        categoryAccountId: category,
        // Overdraws the ৳75,000 in the wallet without touching the capital
        // guard — one override authorises one rule, and this test is about that one.
        payments: [{ financialAccountId: tenant.cashWalletId, amount: "100000" }],
      },
      { override: { pin: PIN, rules: ["insufficientFunds"] } },
    );

    expect(overdrawn.overrides.map((o) => o.rule)).toEqual(["insufficientFunds"]);

    const rows = await withTenant(tenant.session, (tx) =>
      tx.execute<{ after: Record<string, string> }>(sql`
        select after from audit_logs
         where company_id = ${tenant.companyId}::uuid
           and action = 'override'
           and entity_id = ${overdrawn.transactionId}::uuid
      `),
    );
    const audit = rows as unknown as { after: Record<string, string> }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]!.after["rule"]).toBe("insufficientFunds");
  });

  /**
   * R3.3. One override authorises one rule: the entry above was allowed to
   * overdraw, and that says nothing about whether it may also bankrupt the
   * company — so this one has to be refused on its own terms first.
   */
  it("refuses the expense that drives capital negative", async () => {
    const category = await expenseAccount();

    await expect(spend("99999999", "2026-08-19", category)).rejects.toMatchObject({
      code: "INSUFFICIENT_FUNDS",
    });

    // Funded, so the only thing left to refuse it is the capital guard.
    await expect(
      createTransaction(
        tenant.session,
        {
          type: "expense",
          date: "2026-08-19",
          source: "manual",
          categoryAccountId: category,
          payments: [{ financialAccountId: tenant.cashWalletId, amount: "99999999" }],
        },
        { override: { pin: PIN, rules: ["insufficientFunds"] } },
      ),
    ).rejects.toMatchObject({
      code: "NEGATIVE_CAPITAL",
      reason: { rule: "negativeCapital" },
    });
  });
});

/**
 * Spec R5.2 and the half of R3.2 that depends on it.
 */
describeDb("বকেয়ার বয়স", () => {
  let tenant: Tenant;
  let productId: string;

  beforeAll(async () => {
    tenant = await makeTenant("Ageing");
    productId = await createProduct(tenant.session, {
      nameBn: "বয়সের পণ্য",
      kind: "finished_good",
      unitId: tenant.unitKgId,
      purchasePrice: "50",
      salePrice: "80",
      openingQuantity: "100000",
      openingRate: "50",
    });
  }, 60_000);

  afterAll(async () => {
    await dropTenant(tenant);
    await closeDb();
  }, 60_000);

  // Counted back from *Dhaka's* today, which is what the ageing uses. Building
  // these from `Date.now()` in UTC makes every date one day out for the six
  // hours a day Dhaka is already tomorrow.
  const iso = (daysAgo: number): string =>
    new Date(Date.parse(`${todayIso()}T00:00:00Z`) - daysAgo * 86_400_000)
      .toISOString()
      .slice(0, 10);

  async function ageOf(partyId: string) {
    return withTenant(tenant.session, async (tx) => {
      const found = await loadAgeing(tx, tenant.companyId, [partyId]);
      return found.get(partyId)!;
    });
  }

  it("reads the age off journal_lines, not off due_amount", async () => {
    const partyId = await createParty(tenant.session, {
      name: "পুরনো বকেয়ার কাস্টমার",
      type: "customer",
    });

    await createTransaction(tenant.session, {
      type: "sale",
      date: iso(75),
      source: "manual",
      partyId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "100", rate: "80" }],
      payments: [],
    });

    const aged = await ageOf(partyId);
    expect(aged.oldestUnpaid).toBe(iso(75));
    expect(aged.daysOverdue).toBe(75);
    expect(aged.band).toBe("risky");
  });

  /**
   * The reason `transactions.due_amount` cannot be used: it is a posting-time
   * snapshot, never revisited when the payment lands. Reading it here would
   * report this party as 75 days overdue for ever.
   */
  it("clears the moment the journal says it was paid", async () => {
    const partyId = await createParty(tenant.session, {
      name: "পরে দেওয়া কাস্টমার",
      type: "customer",
    });

    await createTransaction(tenant.session, {
      type: "sale",
      date: iso(75),
      source: "manual",
      partyId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "100", rate: "80" }],
      payments: [],
    });
    expect((await ageOf(partyId)).band).toBe("risky");

    await createTransaction(tenant.session, {
      type: "customer_payment",
      date: iso(1),
      source: "manual",
      partyId,
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "8000" }],
    });

    expect(await ageOf(partyId)).toEqual({
      oldestUnpaid: null,
      daysOverdue: 0,
      band: "healthy",
    });
  });

  /** FIFO: a payment settles the oldest bill, so what is left is the newest. */
  it("ages the oldest bill a payment has not reached", async () => {
    const partyId = await createParty(tenant.session, {
      name: "আংশিক দেওয়া কাস্টমার",
      type: "customer",
    });

    // Newest first, on purpose: post the 90-day-old bill first and the party
    // is already in the red band by the time the second sale is entered, and
    // R3.2 refuses it. Ageing reads dates, not the order they were typed in.
    for (const daysAgo of [10, 90]) {
      await createTransaction(tenant.session, {
        type: "sale",
        date: iso(daysAgo),
        source: "manual",
        partyId,
        lines: [{ productId, unitId: tenant.unitKgId, quantity: "100", rate: "80" }],
        payments: [],
      });
    }

    // Enough to clear the older bill exactly.
    await createTransaction(tenant.session, {
      type: "customer_payment",
      date: iso(1),
      source: "manual",
      partyId,
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "8000" }],
    });

    const aged = await ageOf(partyId);
    expect(aged.oldestUnpaid).toBe(iso(10));
    expect(aged.band).toBe("healthy");
  });

  it("refuses a new credit sale to a party in the red band", async () => {
    const partyId = await createParty(tenant.session, {
      name: "লাল কাস্টমার",
      type: "customer",
      creditLimit: "10000000",
    });

    await createTransaction(tenant.session, {
      type: "sale",
      date: iso(80),
      source: "manual",
      partyId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "10", rate: "80" }],
      payments: [],
    });

    // Room to spare on the limit, and it makes no difference.
    await expect(
      createTransaction(tenant.session, {
        type: "sale",
        date: iso(0),
        source: "manual",
        partyId,
        lines: [{ productId, unitId: tenant.unitKgId, quantity: "10", rate: "80" }],
        payments: [],
      }),
    ).rejects.toMatchObject({
      code: "RISKY_PARTY",
      reason: { rule: "riskyParty", party: "লাল কাস্টমার" },
    });

    // Cash is always welcome.
    const cash = await createTransaction(tenant.session, {
      type: "sale",
      date: iso(0),
      source: "manual",
      partyId,
      lines: [{ productId, unitId: tenant.unitKgId, quantity: "10", rate: "80" }],
      payments: [{ financialAccountId: tenant.cashWalletId, amount: "800" }],
    });
    expect(cash.voucherNo).toMatch(/^SALE/);
  });
});
