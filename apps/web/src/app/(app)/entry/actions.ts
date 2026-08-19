"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createTransaction, MissingSetupError, PermissionError } from "@hishabai/core";
import { PostingError } from "@hishabai/accounting";
import { addMoney, moneyToDb } from "@hishabai/shared";
import { dict } from "@/lib/locale.server";
import { requireSession } from "@/lib/session";

export interface EntrySuccess {
  ok: true;
  voucherNo: string;
  /** Serialised as strings — bigint does not cross the action boundary. */
  total: string;
  paid: string;
  due: string;
  previousDue: string;
  newDue: string;
  warnings: string[];
}

export interface EntryFailure {
  ok: false;
  /** Message for the summary at the top of the form. */
  error: string;
  /** Field path → message, for the inline errors. */
  fieldErrors?: Record<string, string>;
}

export type EntryResult = EntrySuccess | EntryFailure;

/**
 * The only way an entry gets saved.
 *
 * Whatever the browser computed is ignored: the raw inputs go to the engine,
 * and every figure that comes back — total, due, cost of goods, new average
 * cost — was calculated here (spec §24).
 */
export async function createEntryAction(rawInput: unknown): Promise<EntryResult> {
  const session = await requireSession();

  try {
    const result = await createTransaction(session, rawInput);
    revalidatePath("/dashboard");
    revalidatePath("/transactions");

    return {
      ok: true,
      voucherNo: result.voucherNo,
      total: moneyToDb(result.totals.total),
      paid: moneyToDb(result.totals.paid),
      due: moneyToDb(result.totals.due),
      previousDue: moneyToDb(result.previousDue),
      newDue: moneyToDb(addMoney(result.previousDue, result.totals.due)),
      warnings: result.warnings.map((w) => w.messageBn),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      return {
        ok: false,
        error: (await dict()).messages.fixTheFields,
        fieldErrors,
      };
    }

    if (error instanceof PostingError) {
      return { ok: false, error: error.messageBn };
    }

    if (error instanceof PermissionError) {
      return { ok: false, error: error.messageBn };
    }

    // Setup that is incomplete, or a reference that is not this company's.
    if (error instanceof MissingSetupError) {
      return { ok: false, error: error.messageBn };
    }

    // Anything unexpected: say so plainly rather than leaking internals.
    console.error("createEntryAction failed", error);
    return { ok: false, error: (await dict()).messages.errorGeneric };
  }
}
