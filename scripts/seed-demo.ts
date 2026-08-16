/**
 * Demo data for looking at the app with real numbers in it.
 *
 *   npm run db:seed:demo
 *
 * Creates a confirmed login, a company, a customer, a vendor, two products,
 * the spec's ৳80,000 sale and a ৳50,000 purchase against it. Everything except
 * the auth row goes through the same services the UI uses, so what you see on
 * screen is what the engine produced — not fixtures painted on top.
 *
 * Idempotent per fixture, not just overall: re-running reuses whatever is
 * already there and adds only what is missing.
 */
import { sql } from "drizzle-orm";
import {
  closeDb,
  getDb,
  parties,
  transactions,
  units,
  withTenant,
  withUser,
  financialAccounts,
} from "@hishabai/db";
import {
  createProduct,
  createTransaction,
  listCompanies,
  listProducts,
} from "@hishabai/core";
import { moneyToDb } from "@hishabai/shared";
import { eq, and } from "drizzle-orm";

const EMAIL = "rafiq@paperstar.demo";
const PASSWORD = "HishabDemo2026!";

async function ensureAuthUser(): Promise<string> {
  // The owner connection is needed for auth.users; the runtime role has no
  // business writing there.
  const adminUrl = process.env["SUPABASE_DB_ADMIN_URL"];
  if (!adminUrl) throw new Error("SUPABASE_DB_ADMIN_URL is required to seed a login");

  const previous = process.env["DATABASE_URL"];
  process.env["DATABASE_URL"] = adminUrl;
  await closeDb();

  // auth.users has no plain unique index on email, so check before inserting
  // rather than relying on ON CONFLICT.
  const existing = (await getDb().execute(
    sql`select id from auth.users where email = ${EMAIL} limit 1`,
  )) as unknown as { id: string }[];

  const rows = existing[0]
    ? existing
    : ((await getDb().execute(sql`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password,
          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${EMAIL}, crypt(${PASSWORD}, gen_salt('bf')),
          now(), '{"provider":"email","providers":["email"]}'::jsonb,
          ${JSON.stringify({ full_name: "মোঃ রফিকুল ইসলাম" })}::jsonb,
          now(), now()
        )
        returning id
      `)) as unknown as { id: string }[]);

  const userId = rows[0]!.id;

  // GoTrue scans these columns into non-nullable Go strings. A hand-written
  // INSERT leaves them NULL, and the login then fails with the thoroughly
  // unhelpful "Database error querying schema".
  await getDb().execute(sql`
    update auth.users set
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change = coalesce(phone_change, ''),
      phone_change_token = coalesce(phone_change_token, ''),
      reauthentication_token = coalesce(reauthentication_token, '')
    where id = ${userId}::uuid
  `);

  // GoTrue resolves a password login through auth.identities, not auth.users
  // alone. Without this row the credentials are simply "invalid".
  await getDb().execute(sql`
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    select ${userId}, ${userId}::uuid,
           ${JSON.stringify({ sub: userId, email: EMAIL, email_verified: true, phone_verified: false })}::jsonb,
           'email', now(), now(), now()
    where not exists (
      select 1 from auth.identities where user_id = ${userId}::uuid and provider = 'email'
    )
  `);

  await closeDb();
  // Restore unconditionally. Guarding on `previous` meant that when
  // DATABASE_URL was unset — a fresh .env.local — the owner connection stayed
  // in place and the rest of the seed ran as `postgres`, which has BYPASSRLS.
  // The data lands either way, so nothing looks wrong; what is lost is the
  // check that the runtime role can actually do the work.
  if (previous === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = previous;
  return userId;
}

async function main(): Promise<void> {
  const userId = await ensureAuthUser();
  console.log(`✓ login ready — ${EMAIL} / ${PASSWORD}`);

  let companies = await listCompanies(userId);
  if (companies.length === 0) {
    await withUser(userId, async (tx) => {
      await tx.execute(sql`select app.ensure_profile('মোঃ রফিকুল ইসলাম', '01711000000')`);
      await tx.execute(
        sql`select app.create_company('Paper Star', 'পেপার স্টার', 'কাগজ ব্যবসা', '01711000000', 'নবাবপুর রোড, ঢাকা', 7)`,
      );
    });
    companies = await listCompanies(userId);
    console.log("✓ company created — পেপার স্টার");
  }

  const company = companies[0]!;
  const session = { userId, companyId: company.id, role: company.role };

  // Resolved piece by piece rather than all-or-nothing. The old guard bailed
  // the moment any party existed, so a company seeded before a new fixture was
  // added could never pick it up — the demo just silently lacked it.
  const refs = await withTenant(session, async (tx) => {
    const [kg] = await tx
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.companyId, company.id), eq(units.symbol, "kg")))
      .limit(1);

    const [cash] = await tx
      .select({ id: financialAccounts.id })
      .from(financialAccounts)
      .where(eq(financialAccounts.companyId, company.id))
      .limit(1);

    async function ensureParty(
      name: string,
      values: { type: "customer" | "vendor"; phone: string; address?: string },
    ): Promise<string> {
      const [found] = await tx
        .select({ id: parties.id })
        .from(parties)
        .where(and(eq(parties.companyId, company.id), eq(parties.name, name)))
        .limit(1);
      if (found) return found.id;

      const [row] = await tx
        .insert(parties)
        .values({ companyId: company.id, name, ...values })
        .returning({ id: parties.id });
      return row!.id;
    }

    return {
      unitId: kg!.id,
      walletId: cash!.id,
      customerId: await ensureParty("মায়ের দোয়া ট্রেডার্স", {
        type: "customer",
        phone: "01812345678",
        address: "চকবাজার, ঢাকা",
      }),
      vendorId: await ensureParty("রহমান পেপার মিলস", {
        type: "vendor",
        phone: "01912345678",
        address: "টঙ্গী, গাজীপুর",
      }),
    };
  });

  // Through createProduct, not a direct insert: opening stock has to post its
  // journal entry and its stock movement, and seeding around that is how the
  // ledger ended up ৳120,000 short of the stock table in the first place.
  const catalogue = await listProducts(session);
  async function ensureProduct(
    nameBn: string,
    input: Omit<Parameters<typeof createProduct>[1], "nameBn" | "unitId">,
  ): Promise<string> {
    const found = catalogue.find((p) => p.nameBn === nameBn);
    if (found) return found.id;
    return createProduct(session, { nameBn, unitId: refs.unitId, ...input });
  }

  const paperId = await ensureProduct("অফসেট পেপার", {
    kind: "finished_good",
    purchasePrice: "120",
    salePrice: "160",
    minStockLevel: "100",
    openingQuantity: "1000",
    openingRate: "120",
  });

  await ensureProduct("জাম্বু পেপার", {
    kind: "raw_material",
    purchasePrice: "100",
    salePrice: "0",
    minStockLevel: "200",
  });

  const today = new Date().toISOString().slice(0, 10);
  const posted = await withTenant(session, async (tx) =>
    tx
      .select({ type: transactions.type })
      .from(transactions)
      .where(eq(transactions.companyId, company.id)),
  );
  const already = new Set(posted.map((row) => row.type));

  // The spec's worked example: ৳80,000 billed, ৳50,000 taken, ৳30,000 left.
  if (!already.has("sale")) {
    const sale = await createTransaction(session, {
      type: "sale",
      date: today,
      source: "manual",
      partyId: refs.customerId,
      memoNo: "125",
      lines: [{ productId: paperId, unitId: refs.unitId, quantity: "500", rate: "160" }],
      payments: [{ financialAccountId: refs.walletId, amount: "50000" }],
    });

    console.log(
      `✓ sale posted ${sale.voucherNo} — মোট ${moneyToDb(sale.totals.total)}, ` +
        `পরিশোধ ${moneyToDb(sale.totals.paid)}, বকেয়া ${moneyToDb(sale.totals.due)}`,
    );
  }

  // The mirror of it, so ভেন্ডর has a statement to show rather than an empty
  // profile: ৳50,000 of paper bought, ৳20,000 paid, ৳30,000 still owed.
  if (!already.has("purchase")) {
    const purchase = await createTransaction(session, {
      type: "purchase",
      date: today,
      source: "manual",
      partyId: refs.vendorId,
      memoNo: "RPM-4471",
      lines: [{ productId: paperId, unitId: refs.unitId, quantity: "400", rate: "125" }],
      payments: [{ financialAccountId: refs.walletId, amount: "20000" }],
    });

    console.log(
      `✓ purchase posted ${purchase.voucherNo} — মোট ${moneyToDb(purchase.totals.total)}, ` +
        `পরিশোধ ${moneyToDb(purchase.totals.paid)}, পাওনা ${moneyToDb(purchase.totals.due)}`,
    );
  }

  await closeDb();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
