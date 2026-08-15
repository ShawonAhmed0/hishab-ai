/**
 * Company lifecycle and membership.
 *
 * These are the only operations that run before a company is selected, so they
 * use withUser rather than withTenant — the tenant policies deny everything
 * until app.company_id is set, which is exactly right for this stage.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  companies,
  companyMembers,
  financialAccounts,
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
import { requirePermission, type Session } from "./session";

export interface CompanySummary {
  id: string;
  name: string;
  nameBn: string | null;
  businessType: string | null;
  role: Role;
}

/** Everything this user may switch between. */
export async function listCompanies(userId: string): Promise<CompanySummary[]> {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({
        id: companies.id,
        name: companies.name,
        nameBn: companies.nameBn,
        businessType: companies.businessType,
        role: companyMembers.role,
      })
      .from(companyMembers)
      .innerJoin(companies, eq(companies.id, companyMembers.companyId))
      .where(
        and(
          eq(companyMembers.userId, userId),
          eq(companyMembers.isActive, true),
          eq(companies.isActive, true),
        ),
      )
      .orderBy(companies.name);

    return rows;
  });
}

export async function getMembership(
  userId: string,
  companyId: string,
): Promise<{ role: Role } | null> {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select({ role: companyMembers.role })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, companyId),
          eq(companyMembers.userId, userId),
          eq(companyMembers.isActive, true),
        ),
      )
      .limit(1);
    return row ?? null;
  });
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
 * Adding a bank or bKash wallet. The opening balance is recorded on the wallet
 * itself and posted through the opening-balance equity account, so the ledger
 * still balances on day one.
 */
export async function createFinancialAccount(
  session: Session,
  rawInput: unknown,
): Promise<string> {
  requirePermission(session, "settings.manage");
  const input = financialAccountInputSchema.parse(rawInput);

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
        openingBalance: moneyToDb(money(input.openingBalance)),
        balance: moneyToDb(money(input.openingBalance)),
      })
      .returning({ id: financialAccounts.id });

    return created!.id;
  });
}
