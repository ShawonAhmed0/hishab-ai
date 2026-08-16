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
import { moneyToDb } from "@hishabai/shared";
import { cancelTransaction, createTransaction, listTransactions } from "./transactions";
import { getDashboard } from "./dashboard";
import { listParties, listProducts, loadEntryFormData } from "./master-data";
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

async function seedParty(tenant: Tenant, name: string): Promise<string> {
  return withTenant(tenant.session, async (tx) => {
    const [row] = await tx
      .insert(parties)
      .values({ companyId: tenant.companyId, name, type: "customer" })
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

});
