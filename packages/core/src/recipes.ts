/**
 * রেসিপি — কাঁচামাল → পণ্য, written down once instead of remembered.
 *
 * A recipe is a form-filling convenience and nothing more: it never posts, and
 * নতুন এন্ট্রি treats what it fills in as a starting point the operator can
 * overwrite. That is deliberate. A batch that actually used a little more flour
 * has to be recordable as what happened, not as what was planned — the ledger
 * costs the goods that moved, and the recipe has no vote.
 *
 * It also holds no prices. The cost of a batch is whatever its inputs are
 * worth at their running average on the day, which is the journal's business.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  productionRecipeInputs,
  productionRecipes,
  products,
  withTenant,
} from "@hishabai/db";
import { recipeInputSchema } from "@hishabai/shared";
import { requirePermission, type Session } from "./session";
import { writeAudit } from "./transactions";

export interface RecipeInputRow {
  productId: string;
  productNameBn: string;
  unitSymbol: string;
  quantityPerUnit: string;
}

export interface RecipeRow {
  id: string;
  nameBn: string | null;
  outputProductId: string;
  outputProductNameBn: string;
  outputUnitSymbol: string;
  expectedYieldPercent: string | null;
  notes: string | null;
  isActive: boolean;
  inputs: RecipeInputRow[];
}

/**
 * Every product named has to be one of ours.
 *
 * Same reasoning as the posting path: the foreign key is checked by a trigger
 * that bypasses RLS, so an id from another company would satisfy the
 * constraint and land in our recipe.
 */
async function assertProductsAreOurs(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  companyId: string,
  ids: readonly string[],
): Promise<void> {
  const rows = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.companyId, companyId), inArray(products.id, [...ids])));

  const found = new Set(rows.map((row) => row.id));
  const stray = ids.find((id) => !found.has(id));
  if (stray) throw new Error("নির্বাচিত পণ্যটি এই কোম্পানির নয়");
}

export async function createRecipe(session: Session, rawInput: unknown): Promise<string> {
  requirePermission(session, "settings.manage");
  const input = recipeInputSchema.parse(rawInput);

  return withTenant(session, async (tx) => {
    const productIds = [
      input.outputProductId,
      ...input.inputs.map((line) => line.productId),
    ];
    await assertProductsAreOurs(tx, session.companyId, [...new Set(productIds)]);

    const [created] = await tx
      .insert(productionRecipes)
      .values({
        companyId: session.companyId,
        outputProductId: input.outputProductId,
        nameBn: input.nameBn ?? null,
        expectedYieldPercent: input.expectedYieldPercent ?? null,
        notes: input.notes ?? null,
      })
      .returning({ id: productionRecipes.id });

    await tx.insert(productionRecipeInputs).values(
      input.inputs.map((line) => ({
        companyId: session.companyId,
        recipeId: created!.id,
        productId: line.productId,
        quantityPerUnit: line.quantityPerUnit,
      })),
    );

    await writeAudit(tx, session, {
      action: "create",
      entityType: "production_recipe",
      entityId: created!.id,
      summaryBn: `রেসিপি — ${input.nameBn ?? "নতুন"}`,
      after: { outputProductId: input.outputProductId, inputs: input.inputs.length },
    });

    return created!.id;
  });
}

/** Replaces the input list wholesale — editing one line is not worth a diff. */
export async function updateRecipe(
  session: Session,
  recipeId: string,
  rawInput: unknown,
): Promise<void> {
  requirePermission(session, "settings.manage");
  const input = recipeInputSchema.parse(rawInput);

  await withTenant(session, async (tx) => {
    const productIds = [
      input.outputProductId,
      ...input.inputs.map((line) => line.productId),
    ];
    await assertProductsAreOurs(tx, session.companyId, [...new Set(productIds)]);

    const [existing] = await tx
      .select({ id: productionRecipes.id })
      .from(productionRecipes)
      .where(
        and(
          eq(productionRecipes.id, recipeId),
          eq(productionRecipes.companyId, session.companyId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("রেসিপিটি পাওয়া যায়নি");

    await tx
      .update(productionRecipes)
      .set({
        outputProductId: input.outputProductId,
        nameBn: input.nameBn ?? null,
        expectedYieldPercent: input.expectedYieldPercent ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(productionRecipes.id, recipeId));

    await tx
      .delete(productionRecipeInputs)
      .where(
        and(
          eq(productionRecipeInputs.recipeId, recipeId),
          eq(productionRecipeInputs.companyId, session.companyId),
        ),
      );

    await tx.insert(productionRecipeInputs).values(
      input.inputs.map((line) => ({
        companyId: session.companyId,
        recipeId,
        productId: line.productId,
        quantityPerUnit: line.quantityPerUnit,
      })),
    );

    await writeAudit(tx, session, {
      action: "update",
      entityType: "production_recipe",
      entityId: recipeId,
      summaryBn: `রেসিপি — ${input.nameBn ?? "সম্পাদনা"}`,
      after: { outputProductId: input.outputProductId, inputs: input.inputs.length },
    });
  });
}

/**
 * Retired, not deleted — a recipe has no ledger consequence, but an operator
 * who is midway through a batch should not watch the row vanish.
 */
export async function setRecipeActive(
  session: Session,
  recipeId: string,
  isActive: boolean,
): Promise<void> {
  requirePermission(session, "settings.manage");

  await withTenant(session, async (tx) => {
    await tx
      .update(productionRecipes)
      .set({ isActive, updatedAt: new Date() })
      .where(
        and(
          eq(productionRecipes.id, recipeId),
          eq(productionRecipes.companyId, session.companyId),
        ),
      );
  });
}
