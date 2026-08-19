/**
 * Company lifecycle and membership.
 *
 * These are the only operations that run before a company is selected, so they
 * use withUser rather than withTenant — the tenant policies deny everything
 * until app.company_id is set, which is exactly right for this stage.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  financialAccounts,
  getDb,
  profiles,
  withTenant,
  withUser,
} from "@hishabai/db";
import {
  companyInputSchema,
  financialAccountInputSchema,
  moneyToDb,
  money,
  type Role,
} from "@hishabai/shared";
import { postOpeningBalance } from "./opening-balance";
import { requirePermission, type Session } from "./session";
import { writeAudit } from "./audit";

export interface CompanySummary {
  id: string;
  name: string;
  nameBn: string | null;
  businessType: string | null;
  role: Role;
}

export interface ResolvedSession {
  /** Role in the requested company, or null if they are not a member of it. */
  role: Role | null;
  /** Every company this user may switch between. */
  companies: CompanySummary[];
  /** Display name, so rendering the shell needs no second auth lookup. */
  fullName: string | null;
}

/**
 * Who this user is and what they may see — one round trip.
 *
 * The role is read from `company_members` on every request rather than trusted
 * from a cookie or a token claim, so revoking access takes effect on the next
 * click. It just no longer costs two transactions to find out.
 */
export async function resolveSession(
  userId: string,
  requestedCompanyId?: string,
): Promise<ResolvedSession> {
  const rows = (await getDb().execute(
    sql`select app.resolve_session(${userId}::uuid, ${requestedCompanyId ?? null}) as data`,
  )) as unknown as { data: ResolvedSession }[];

  const data = rows[0]?.data;
  return {
    role: data?.role ?? null,
    companies: data?.companies ?? [],
    fullName: data?.fullName ?? null,
  };
}

/** Everything this user may switch between. */
export async function listCompanies(userId: string): Promise<CompanySummary[]> {
  return (await resolveSession(userId)).companies;
}

export async function getMembership(
  userId: string,
  companyId: string,
): Promise<{ role: Role } | null> {
  const { role } = await resolveSession(userId, companyId);
  return role ? { role } : null;
}

/**
 * Creating a company also seeds its chart of accounts, units, categories and
 * cash drawer. That happens in one SECURITY DEFINER function because the row
 * has to exist before its creator can be a member of it.
 */
export async function createCompany(userId: string, rawInput: unknown): Promise<string> {
  const input = companyInputSchema.parse(rawInput);

  return withUser(userId, async (tx) => {
    const rows = await tx.execute<{ company_id: string }>(sql`
      select app.create_company(
        ${input.name},
        ${input.nameBn ?? null},
        ${input.businessType ?? null},
        ${input.phone ?? null},
        ${input.address ?? null},
        ${input.fiscalYearStartMonth}
      ) as company_id
    `);

    const companyId = (rows as unknown as { company_id: string }[])[0]?.company_id;
    if (!companyId) throw new Error("Company creation returned no id");
    return companyId;
  });
}

export async function ensureProfile(
  userId: string,
  fullName: string,
  phone?: string,
): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.execute(
      sql`select app.ensure_profile(${fullName}, ${phone ?? null})`,
    );
  });
}

export async function rememberLastCompany(userId: string, companyId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx
      .update(profiles)
      .set({ lastCompanyId: companyId, updatedAt: new Date() })
      .where(eq(profiles.id, userId));
  });
}

/** নগদ / ব্যাংক / বিকাশ wallets, in the order the entry form shows them. */
export async function listFinancialAccounts(session: Session) {
  return withTenant(session, async (tx) =>
    tx
      .select()
      .from(financialAccounts)
      .where(
        and(
          eq(financialAccounts.companyId, session.companyId),
          eq(financialAccounts.isActive, true),
        ),
      )
      .orderBy(financialAccounts.kind, financialAccounts.nameBn),
  );
}

/**
 * Adding a bank or bKash wallet, with whatever is already in it.
 *
 * The opening balance is posted, not assigned. This used to set
 * `balance = openingBalance` on the row and stop there — and the comment above
 * it claimed the entry went through opening-balance equity, which it did not.
 * Two things then disagreed: `financial_accounts.balance` carried the opening
 * amount plus every journal delta, while the account's own ledger balance
 * carried only the deltas, so the ক্যাশ বই and the dashboard tile would drift
 * apart by exactly the opening figure and neither would look wrong on its own.
 *
 * The same mistake, in the same shape, as opening stock. It is now the same
 * fix: `postOpeningBalance` writes Dr wallet / Cr opening-balance equity, and
 * the balance trigger derives the row from that.
 */
export async function createFinancialAccount(
  session: Session,
  rawInput: unknown,
): Promise<string> {
  requirePermission(session, "settings.manage");
  const input = financialAccountInputSchema.parse(rawInput);
  const opening = money(input.openingBalance);

  return withTenant(session, async (tx) => {
    const subtypeCode = { cash: "1000", bank: "1010", mfs: "1020" }[input.kind];

    const rows = await tx.execute<{ id: string }>(sql`
      select id from accounts
       where company_id = ${session.companyId}::uuid and code = ${subtypeCode}
       limit 1
    `);
    const accountId = (rows as unknown as { id: string }[])[0]?.id;
    if (!accountId) throw new Error(`Missing ledger account for ${input.kind}`);

    const [created] = await tx
      .insert(financialAccounts)
      .values({
        companyId: session.companyId,
        accountId,
        kind: input.kind,
        nameBn: input.nameBn,
        bankName: input.bankName ?? null,
        accountNumber: input.accountNumber ?? null,
        mfsProvider: input.mfsProvider ?? null,
        // Kept as a record of what was declared; `balance` is the trigger's.
        openingBalance: moneyToDb(opening),
      })
      .returning({ id: financialAccounts.id });

    await postOpeningBalance(tx, session, {
      accountId,
      amount: opening,
      description: `${input.nameBn} — প্রারম্ভিক ব্যালেন্স`,
    });

    await writeAudit(tx, session, {
      action: "create",
      entityType: "financial_account",
      entityId: created!.id,
      summaryBn: `পেমেন্ট মাধ্যম যোগ করা হয়েছে — ${input.nameBn}`,
    });

    return created!.id;
  });
}
