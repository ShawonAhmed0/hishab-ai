"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { PermissionError, createParty, createProduct } from "@hishabai/core";
import { requireSession } from "@/lib/session";

/**
 * Creating the things every entry picks from.
 *
 * Shared by /inventory, /customers, /vendors and নতুন এন্ট্রি's own inline
 * panels, because "add a customer" has to mean the same thing whether you are
 * on the customer list or halfway through billing one who turns out not to
 * exist yet.
 *
 * The created row comes back rather than just an id: the entry form has to put
 * it straight into its dropdown and select it, and waiting on a full refetch
 * to do that is a stutter in the middle of typing an invoice.
 */
export interface CreatedParty {
  id: string;
  name: string;
  type: string;
  receivable: string;
  payable: string;
}

export interface CreatedProduct {
  id: string;
  nameBn: string;
  kind: string;
  unitId: string;
  unitSymbol: string;
  salePrice: string;
  purchasePrice: string;
  quantity: string;
}

export type CreateResult<T> =
  | { ok: true; created: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function run<T>(fn: () => Promise<T>): Promise<CreateResult<T>> {
  try {
    const created = await fn();
    // Every list that offers these, plus the dropdowns on the entry form.
    revalidatePath("/inventory");
    revalidatePath("/customers");
    revalidatePath("/vendors");
    revalidatePath("/entry");
    revalidatePath("/dashboard");
    return { ok: true, created };
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      return {
        ok: false,
        error: "কিছু তথ্য ঠিক নেই। নিচের ঘরগুলো দেখুন।",
        fieldErrors,
      };
    }
    if (error instanceof PermissionError) return { ok: false, error: error.messageBn };
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return { ok: false, error: "এই নামে বা কোডে একটি এন্ট্রি আগে থেকেই আছে" };
    }
    console.error("master data create failed", error);
    return { ok: false, error: "সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।" };
  }
}

export async function createPartyAction(
  input: unknown,
): Promise<CreateResult<CreatedParty>> {
  const session = await requireSession();

  return run(async () => {
    const id = await createParty(session, input);
    const values = input as { name: string; type: string };
    // Opening balance reaches the dropdown through the next page load; what
    // the form needs right now is something selectable.
    return {
      id,
      name: values.name,
      type: values.type,
      receivable: "0",
      payable: "0",
    } satisfies CreatedParty;
  });
}

export async function createProductAction(
  input: unknown,
  unitSymbol: string,
): Promise<CreateResult<CreatedProduct>> {
  const session = await requireSession();

  return run(async () => {
    const id = await createProduct(session, input);
    const values = input as {
      nameBn: string;
      kind: string;
      unitId: string;
      salePrice?: string;
      purchasePrice?: string;
      openingQuantity?: string;
    };
    return {
      id,
      nameBn: values.nameBn,
      kind: values.kind,
      unitId: values.unitId,
      unitSymbol,
      salePrice: values.salePrice || "0",
      purchasePrice: values.purchasePrice || "0",
      quantity: values.openingQuantity || "0",
    } satisfies CreatedProduct;
  });
}
