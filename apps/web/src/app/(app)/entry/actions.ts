"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import {
  createTransaction,
  MissingSetupError,
  OverrideError,
  PermissionError,
} from "@hishabai/core";
import { PostingError } from "@hishabai/accounting";
import {
  addMoney,
  blockedMessage,
  isOverridable,
  moneyToDb,
  warnedMessage,
} from "@hishabai/shared";
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
  /**
   * Set when a posting rule refused the entry and an admin is allowed to push
   * past it. The browser uses this to raise the PIN dialog; it is not
   * permission to do anything, and the server re-checks the role and the PIN
   * on the retry regardless of what comes back here.
   */
  canOverride?: boolean;
  /** Why the PIN attempt itself failed, when one was made. */
  overrideError?: OverrideError["kind"];
}

export type EntryResult = EntrySuccess | EntryFailure;

/**
 * The only way an entry gets saved.
 *
 * Whatever the browser computed is ignored: the raw inputs go to the engine,
 * and every figure that comes back — total, due, cost of goods, new average
 * cost — was calculated here (spec §24).
 */
export async function createEntryAction(
  rawInput: unknown,
  override?: { pin: string },
): Promise<EntryResult> {
  const session = await requireSession();

  try {
    const result = await createTransaction(session, rawInput, {
      ...(override ? { override } : {}),
    });
    revalidatePath("/dashboard");
    revalidatePath("/transactions");

    const t = await dict();
    return {
      ok: true,
      voucherNo: result.voucherNo,
      total: moneyToDb(result.totals.total),
      paid: moneyToDb(result.totals.paid),
      due: moneyToDb(result.totals.due),
      previousDue: moneyToDb(result.previousDue),
      newDue: moneyToDb(addMoney(result.previousDue, result.totals.due)),
      warnings: [
        ...result.overrides.map(() => t.override.recorded),
        ...result.warnings.map((w) => warnedMessage(w.reason, t)),
      ],
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

    // A refusal carries the rule and the numbers rather than a sentence, so it
    // renders in whichever language this request is being served in.
    if (error instanceof PostingError) {
      const t = await dict();
      return {
        ok: false,
        error: blockedMessage(error.reason, t),
        // Only an admin may push past one, and only some rules may be pushed
        // past at all. Both are checked again on the retry.
        canOverride: isOverridable(error.reason.rule) && session.role === "admin",
      };
    }

    // The PIN itself was wrong, missing, or the role was not admin. The entry
    // is still blocked; the dialog stays open and says which.
    if (error instanceof OverrideError) {
      const t = await dict();
      const message: Record<OverrideError["kind"], string> = {
        wrong_pin: t.override.wrongPin,
        no_pin: t.override.noPin,
        not_admin: t.override.notAdmin,
        not_overridable: t.override.notOverridable,
      };
      return {
        ok: false,
        error: message[error.kind],
        canOverride: error.kind === "wrong_pin",
        overrideError: error.kind,
      };
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
