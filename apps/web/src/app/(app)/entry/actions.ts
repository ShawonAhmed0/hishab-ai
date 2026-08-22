"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ZodError } from "zod";
import {
  createTransaction,
  flushDeliveries,
  DuplicateMemoError,
  MissingSetupError,
  OverrideError,
  PermissionError,
  ProbableDuplicateError,
  UnusualAmountError,
  type DuplicateCandidate,
  type UnusualAmount,
} from "@hishabai/core";
import { PostingError } from "@hishabai/accounting";
import {
  addMoney,
  blockedMessage,
  isOverridable,
  moneyToDb,
  validationMessage,
  warnedMessage,
  type OverridableRule,
} from "@hishabai/shared";
import { dict } from "@/lib/locale.server";
import { requireSession } from "@/lib/session";

export interface EntrySuccess {
  ok: true;
  /** So the success dialog can offer this entry's receipt — spec R4.4. */
  transactionId: string;
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
  /**
   * The rule that refused, when an admin may push past it. The browser sends
   * it back with the PIN, so the override authorises the rule the person was
   * actually shown and nothing else — a second rule is a second dialog.
   */
  blockedRule?: OverridableRule;
  /** Why the PIN attempt itself failed, when one was made. */
  overrideError?: OverrideError["kind"];
  /**
   * An already-saved entry this one looks identical to — spec R2.2. A
   * question, not a refusal: the browser shows it and offers to save anyway.
   */
  duplicate?: DuplicateCandidate;
  /**
   * The figure looked wrong for this party — spec R4.2. Also a question, not
   * a refusal: a genuinely large order is a good day, not a typo.
   */
  unusual?: UnusualAmount;
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
  options: {
    override?: { pin: string; rules: OverridableRule[] };
    confirmDuplicate?: boolean;
    confirmUnusual?: boolean;
  } = {},
): Promise<EntryResult> {
  const session = await requireSession();

  try {
    const result = await createTransaction(session, rawInput, {
      ...(options.override ? { override: options.override } : {}),
      ...(options.confirmDuplicate ? { confirmDuplicate: true } : {}),
      ...(options.confirmUnusual ? { confirmUnusual: true } : {}),
    });
    revalidatePath("/dashboard");
    revalidatePath("/transactions");

    // Spec R4.6 — sending happens *after* the posting transaction has
    // committed, and cannot touch it. `after()` runs this once the response has
    // been sent, so a slow or unreachable Meta costs the user nothing; the
    // entry is already saved either way. `flushDeliveries` never throws, so the
    // `void` here is discarding a report rather than swallowing an error.
    after(async () => {
      await flushDeliveries(session);
    });

    const t = await dict();
    return {
      ok: true,
      transactionId: result.transactionId,
      voucherNo: result.voucherNo,
      total: moneyToDb(result.totals.total),
      paid: moneyToDb(result.totals.paid),
      due: moneyToDb(result.totals.due),
      previousDue: moneyToDb(result.previousDue),
      newDue: moneyToDb(addMoney(result.previousDue, result.totals.due)),
      warnings: [
        ...result.overrides.map((reason) =>
          t.override.recordedRule(blockedMessage(reason, t)),
        ),
        ...result.warnings.map((w) => warnedMessage(w.reason, t)),
      ],
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const t = await dict();
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = validationMessage(issue.message, t);
      }
      return { ok: false, error: t.messages.fixTheFields, fieldErrors };
    }

    // A refusal carries the rule and the numbers rather than a sentence, so it
    // renders in whichever language this request is being served in.
    if (error instanceof PostingError) {
      const t = await dict();
      const message = blockedMessage(error.reason, t);
      const rule = error.reason.rule;
      // Only an admin may push past one, and only some rules may be pushed
      // past at all. Both are checked again on the retry.
      if (isOverridable(rule)) {
        return {
          ok: false,
          error: message,
          canOverride: session.role === "admin",
          blockedRule: rule,
        };
      }
      return { ok: false, error: message };
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

    // A চালান number already in the books. A refusal — this entry *is* that
    // entry — and no PIN lifts it.
    if (error instanceof DuplicateMemoError) {
      return { ok: false, error: blockedMessage(error.reason, await dict()) };
    }

    // Same everything else. A question, so the candidate goes back with it.
    if (error instanceof ProbableDuplicateError) {
      const t = await dict();
      return {
        ok: false,
        error: t.duplicate.title,
        duplicate: error.candidate,
      };
    }

    // The figure looked wrong for this party. Same shape as the duplicate:
    // shown, explained, and waved through if the person says it is right.
    if (error instanceof UnusualAmountError) {
      const t = await dict();
      return { ok: false, error: t.confirm.unusualTitle, unusual: error.detail };
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
