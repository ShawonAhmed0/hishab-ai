"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  PermissionError,
  createCategoryAccount,
  createFinancialAccount,
  createProductCategory,
  createRecipe,
  createUnit,
  setRecipeActive,
  setSettingActive,
  updateCompany,
  updateRecipe,
} from "@hishabai/core";
import { requireSession } from "@/lib/session";

export interface SettingsState {
  ok?: boolean;
  error?: string;
  /** Which card to reopen and report against — several share this page. */
  section?: string;
}

/**
 * One wrapper for every settings mutation.
 *
 * They all do the same three things — check the permission, validate, tell the
 * user in Bengali what went wrong — and the only interesting difference is the
 * call in the middle. Zod messages are already written in Bengali, so a failed
 * field is reported as-is rather than replaced with a generic apology.
 */
async function run(
  section: string,
  action: (session: Awaited<ReturnType<typeof requireSession>>) => Promise<unknown>,
): Promise<SettingsState> {
  const session = await requireSession();

  try {
    await action(session);
    revalidatePath("/settings");
    // The entry form's dropdowns come from these lists.
    revalidatePath("/entry");
    return { ok: true, section };
  } catch (error) {
    if (error instanceof PermissionError) return { error: error.messageBn, section };
    if (error instanceof ZodError) {
      return { error: error.issues[0]?.message ?? "তথ্য সঠিক নয়", section };
    }
    // A duplicate unit symbol is the common one, and the constraint name is no
    // use to anybody reading the screen.
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return { error: "এই নামে বা সংক্ষিপ্ত রূপে একটি এন্ট্রি আগে থেকেই আছে", section };
    }
    if (error instanceof Error && /যাবে না/.test(error.message)) {
      return { error: error.message, section };
    }
    console.error(`settings:${section} failed`, error);
    return { error: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।", section };
  }
}

function text(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function updateCompanyAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  return run("company", (session) =>
    updateCompany(session, {
      name: text(form, "name") ?? "",
      nameBn: text(form, "nameBn"),
      businessType: text(form, "businessType"),
      phone: text(form, "phone"),
      address: text(form, "address"),
      fiscalYearStartMonth: Number(form.get("fiscalYearStartMonth") ?? 7),
    }),
  );
}

export async function createWalletAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  return run("wallet", (session) =>
    createFinancialAccount(session, {
      kind: form.get("kind"),
      nameBn: text(form, "nameBn") ?? "",
      bankName: text(form, "bankName"),
      accountNumber: text(form, "accountNumber"),
      mfsProvider: text(form, "mfsProvider"),
      openingBalance: text(form, "openingBalance") ?? "0",
    }),
  );
}

export async function createUnitAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  return run("unit", (session) =>
    createUnit(session, {
      nameBn: text(form, "nameBn") ?? "",
      symbol: text(form, "symbol") ?? "",
      decimalPlaces: form.get("decimalPlaces") ?? 3,
    }),
  );
}

export async function createCategoryAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  return run("category", (session) =>
    createCategoryAccount(session, {
      type: form.get("type"),
      nameBn: text(form, "nameBn") ?? "",
    }),
  );
}

export async function createProductCategoryAction(
  _prev: SettingsState,
  form: FormData,
): Promise<SettingsState> {
  return run("productCategory", (session) =>
    createProductCategory(session, { nameBn: text(form, "nameBn") ?? "" }),
  );
}

export async function deactivateAction(
  target: "wallet" | "unit" | "category" | "productCategory",
  id: string,
): Promise<SettingsState> {
  return run(target, (session) => setSettingActive(session, target, id, false));
}

export interface RecipePayload {
  outputProductId: string;
  nameBn?: string;
  expectedYieldPercent?: string;
  notes?: string;
  inputs: { productId: string; quantityPerUnit: string }[];
}

/**
 * A recipe has a variable number of rows, so it arrives as a payload rather
 * than as a FormData the browser flattened — the same shape the entry form
 * sends, and validated the same way on arrival.
 */
export async function saveRecipeAction(
  recipeId: string | null,
  payload: RecipePayload,
): Promise<SettingsState> {
  return run("recipe", (session) =>
    recipeId
      ? updateRecipe(session, recipeId, payload)
      : createRecipe(session, payload),
  );
}

export async function deactivateRecipeAction(recipeId: string): Promise<SettingsState> {
  return run("recipe", (session) => setRecipeActive(session, recipeId, false));
}
