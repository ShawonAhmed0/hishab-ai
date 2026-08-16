/**
 * সেটিংস — the company's own record of itself, and the four lists the rest of
 * the app picks from.
 *
 * Everything here is `settings.manage`, which only an admin has. The read is
 * one round trip because the settings page shows all five sections at once and
 * there is no reason for it to cost five.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  accounts,
  companies,
  financialAccounts,
  productCategories,
  tenantQuery,
  tenantRead,
  units,
  withTenant,
} from "@hishabai/db";
import {
  categoryAccountInputSchema,
  companyInputSchema,
  productCategoryInputSchema,
  unitInputSchema,
  type FinancialAccountKind,
  type MfsProvider,
} from "@hishabai/shared";
import { requirePermission, type Session, type TenantScope } from "./session";
import { writeAudit } from "./transactions";
import type { RecipeRow } from "./recipes";

export interface CompanyProfile {
  id: string;
  name: string;
  nameBn: string | null;
  businessType: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  fiscalYearStartMonth: number;
}

export interface WalletRow {
  id: string;
  nameBn: string;
  kind: FinancialAccountKind;
  bankName: string | null;
  accountNumber: string | null;
  mfsProvider: MfsProvider | null;
  openingBalance: string;
  balance: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface UnitRow {
  id: string;
  nameBn: string;
  symbol: string;
  decimalPlaces: number;
  productCount: number;
}

export interface CategoryRow {
  id: string;
  code: string;
  nameBn: string;
  type: "income" | "expense";
  /** Seeded categories can be renamed but not removed. */
  isSystem: boolean;
}

export interface SettingsView {
  company: CompanyProfile;
  wallets: WalletRow[];
  units: UnitRow[];
  categories: CategoryRow[];
  productCategories: { id: string; nameBn: string; productCount: number }[];
  recipes: RecipeRow[];
  /** The recipe form's two dropdowns; nothing else on the page needs them. */
  products: { id: string; nameBn: string; kind: string; unitSymbol: string }[];
}

export async function getSettings(scope: TenantScope): Promise<SettingsView> {
  const rows = await tenantRead<{
    company: CompanyProfile | null;
    wallets: WalletRow[] | null;
    units: UnitRow[] | null;
    categories: CategoryRow[] | null;
    product_categories: { id: string; nameBn: string; productCount: number }[] | null;
    recipes: RecipeRow[] | null;
    products: SettingsView["products"] | null;
    [key: string]: unknown;
  }>(
    scope,
    tenantQuery`
      select
        (select row_to_json(t) from (
          select id, name, name_bn as "nameBn", business_type as "businessType",
                 phone, address, currency,
                 fiscal_year_start_month as "fiscalYearStartMonth"
            from companies where id = app.current_company_id()
        ) t) as company,

        (select coalesce(json_agg(t order by t.kind, t."nameBn"), '[]'::json) from (
          select id, name_bn as "nameBn", kind::text as kind,
                 bank_name as "bankName", account_number as "accountNumber",
                 mfs_provider::text as "mfsProvider",
                 opening_balance::text as "openingBalance",
                 balance::text as balance,
                 is_default as "isDefault", is_active as "isActive"
            from financial_accounts
           where company_id = app.current_company_id()
        ) t) as wallets,

        (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
          -- The product count is what makes "can this be removed" answerable
          -- without a second query when the user asks.
          select u.id, u.name_bn as "nameBn", u.symbol,
                 u.decimal_places as "decimalPlaces",
                 count(p.id)::int as "productCount"
            from units u
            left join products p on p.unit_id = u.id and p.is_active
           where u.company_id = app.current_company_id() and u.is_active
           group by u.id
        ) t) as units,

        (select coalesce(json_agg(t order by t.code), '[]'::json) from (
          select id, code, name_bn as "nameBn", type::text as type,
                 is_system as "isSystem"
            from accounts
           where company_id = app.current_company_id()
             and is_category and is_active
        ) t) as categories,

        (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
          select c.id, c.name_bn as "nameBn", count(p.id)::int as "productCount"
            from product_categories c
            left join products p on p.category_id = c.id and p.is_active
           where c.company_id = app.current_company_id() and c.is_active
           group by c.id
        ) t) as product_categories,

        (select coalesce(json_agg(t order by t."outputProductNameBn"), '[]'::json) from (
          select r.id, r.name_bn as "nameBn",
                 r.output_product_id as "outputProductId",
                 op.name_bn as "outputProductNameBn",
                 ou.symbol as "outputUnitSymbol",
                 r.expected_yield_percent::text as "expectedYieldPercent",
                 r.notes, r.is_active as "isActive",
                 coalesce((
                   select json_agg(json_build_object(
                            'productId', ri.product_id,
                            'productNameBn', ip.name_bn,
                            'unitSymbol', iu.symbol,
                            'quantityPerUnit', ri.quantity_per_unit::text)
                          order by ip.name_bn)
                     from production_recipe_inputs ri
                     join products ip on ip.id = ri.product_id
                     join units iu on iu.id = ip.unit_id
                    where ri.recipe_id = r.id
                 ), '[]'::json) as inputs
            from production_recipes r
            join products op on op.id = r.output_product_id
            join units ou on ou.id = op.unit_id
           where r.company_id = app.current_company_id() and r.is_active
        ) t) as recipes,

        (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
          select p.id, p.name_bn as "nameBn", p.kind::text as kind, u.symbol as "unitSymbol"
            from products p
            join units u on u.id = p.unit_id
           where p.company_id = app.current_company_id() and p.is_active
        ) t) as products
    `,
  );

  const view = rows[0];
  if (!view?.company) throw new Error("Company not found");

  return {
    company: view.company,
    wallets: view.wallets ?? [],
    units: view.units ?? [],
    categories: view.categories ?? [],
    productCategories: view.product_categories ?? [],
    recipes: view.recipes ?? [],
    products: view.products ?? [],
  };
}

export async function updateCompany(session: Session, rawInput: unknown): Promise<void> {
  requirePermission(session, "settings.manage");
  const input = companyInputSchema.parse(rawInput);

  await withTenant(session, async (tx) => {
    await tx
      .update(companies)
      .set({
        name: input.name,
        nameBn: input.nameBn ?? null,
        businessType: input.businessType ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, session.companyId));

    await writeAudit(tx, session, {
      action: "update",
      entityType: "company",
      entityId: session.companyId,
      summaryBn: "কোম্পানির তথ্য হালনাগাদ করা হয়েছে",
    });
  });
}

export async function createUnit(session: Session, rawInput: unknown): Promise<string> {
  requirePermission(session, "settings.manage");
  const input = unitInputSchema.parse(rawInput);

  return withTenant(session, async (tx) => {
    const [created] = await tx
      .insert(units)
      .values({
        companyId: session.companyId,
        nameBn: input.nameBn,
        symbol: input.symbol,
        decimalPlaces: input.decimalPlaces,
      })
      .returning({ id: units.id });

    await writeAudit(tx, session, {
      action: "create",
      entityType: "unit",
      entityId: created!.id,
      summaryBn: `একক যোগ করা হয়েছে — ${input.nameBn}`,
    });
    return created!.id;
  });
}

/**
 * A new খাত.
 *
 * The user names it; everything else is decided here. Income categories sit
 * under `other_income` and expense categories under `operating_expense`,
 * because those are the two buckets the posting rules already know how to
 * handle — offering the full chart of accounts would be asking a shopkeeper to
 * classify their own ledger, which is the thing this product exists not to do.
 */
export async function createCategoryAccount(
  session: Session,
  rawInput: unknown,
): Promise<string> {
  requirePermission(session, "settings.manage");
  const input = categoryAccountInputSchema.parse(rawInput);

  const subtype = input.type === "income" ? "other_income" : "operating_expense";

  return withTenant(session, async (tx) => {
    // Codes are grouped by type — 4xxx income, 5xxx expense — and the next one
    // is ten past the highest in that band, leaving room to slot rows in later.
    const rows = (await tx.execute(sql`
      select lpad((coalesce(max(code::int), ${input.type === "income" ? 4000 : 5000}) + 10)::text, 4, '0') as code
        from accounts
       where company_id = ${session.companyId}::uuid
         and type = ${input.type}::account_type
         and code ~ '^[0-9]+$'
    `)) as unknown as { code: string }[];

    const [created] = await tx
      .insert(accounts)
      .values({
        companyId: session.companyId,
        code: rows[0]!.code,
        nameBn: input.nameBn,
        type: input.type,
        subtype,
        isSystem: false,
        isCategory: true,
      })
      .returning({ id: accounts.id });

    await writeAudit(tx, session, {
      action: "create",
      entityType: "account",
      entityId: created!.id,
      summaryBn: `খাত যোগ করা হয়েছে — ${input.nameBn}`,
    });
    return created!.id;
  });
}

export async function createProductCategory(
  session: Session,
  rawInput: unknown,
): Promise<string> {
  requirePermission(session, "settings.manage");
  const input = productCategoryInputSchema.parse(rawInput);

  return withTenant(session, async (tx) => {
    const [created] = await tx
      .insert(productCategories)
      .values({ companyId: session.companyId, nameBn: input.nameBn })
      .returning({ id: productCategories.id });
    return created!.id;
  });
}

/**
 * Retiring a wallet or a খাত rather than deleting it.
 *
 * Deleting would orphan every journal line that ever pointed at it, and spec
 * §18 is explicit that history stays intact. Deactivating takes it out of the
 * dropdowns and leaves the ledger alone.
 */
export async function setSettingActive(
  session: Session,
  target: "wallet" | "unit" | "category" | "productCategory",
  id: string,
  isActive: boolean,
): Promise<void> {
  requirePermission(session, "settings.manage");

  await withTenant(session, async (tx) => {
    if (target === "wallet") {
      // The default wallet is what নতুন এন্ট্রি preselects; retiring it would
      // leave the form with nothing chosen.
      const [wallet] = await tx
        .select({ isDefault: financialAccounts.isDefault })
        .from(financialAccounts)
        .where(
          and(
            eq(financialAccounts.id, id),
            eq(financialAccounts.companyId, session.companyId),
          ),
        )
        .limit(1);

      if (!wallet) throw new Error("Wallet not found");
      if (wallet.isDefault && !isActive) {
        throw new Error("ডিফল্ট পেমেন্ট মাধ্যম বন্ধ করা যাবে না");
      }

      await tx
        .update(financialAccounts)
        .set({ isActive, updatedAt: new Date() })
        .where(
          and(
            eq(financialAccounts.id, id),
            eq(financialAccounts.companyId, session.companyId),
          ),
        );
      return;
    }

    if (target === "unit") {
      await tx
        .update(units)
        .set({ isActive })
        .where(and(eq(units.id, id), eq(units.companyId, session.companyId)));
      return;
    }

    if (target === "productCategory") {
      await tx
        .update(productCategories)
        .set({ isActive })
        .where(
          and(
            eq(productCategories.id, id),
            eq(productCategories.companyId, session.companyId),
          ),
        );
      return;
    }

    // A খাত the posting rules address by subtype cannot be taken away from
    // them, however unused it looks.
    const [account] = await tx
      .select({ isSystem: accounts.isSystem })
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.companyId, session.companyId)))
      .limit(1);

    if (!account) throw new Error("Account not found");
    if (account.isSystem) throw new Error("সিস্টেম খাত বন্ধ করা যাবে না");

    await tx
      .update(accounts)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.companyId, session.companyId)));
  });
}
