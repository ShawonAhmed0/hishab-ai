import type { DuplicateCandidate } from "@hishabai/core";
import type { EntryResult } from "./actions";

/**
 * Which question the entry form is asking — spec R4.2.
 *
 * There is exactly one `Dialog` on নতুন এন্ট্রি, switched on the *kind* of
 * question. Three dialogs is how the wording, the buttons and the dismiss
 * behaviour drift apart from one another.
 *
 * The gate is **derived from the last reply**, never held in its own state.
 * State would let the banner and the dialog disagree about what happened —
 * which they did, and which is unfixable once two things can both be true.
 *
 * Extracted from the component because the precedence below is the whole rule
 * and a 2000-line form is not a place anything can test it from.
 */
export type Gate =
  | { kind: "final" }
  | { kind: "override" }
  | { kind: "duplicate"; candidate: DuplicateCandidate }
  | { kind: "unusual"; detail: { total: string; usual?: string } };

export interface GateInput {
  /** The last reply from the server, or null before the first submit. */
  result: EntryResult | null;
  /**
   * The entry waiting on an answer. Null means nothing is in flight, and no
   * question can be asked about it — a stale refusal must not raise a dialog
   * over a form the user has since gone back to editing.
   */
  pendingPayload: unknown;
  /** The company asks for a confirmation on every entry (R4.2, off by default). */
  askingFinal: boolean;
}

/**
 * Precedence is the point.
 *
 * A refusal an admin can override outranks both questions: it is a *block*,
 * and offering "save anyway" beside it would imply the entry is one click from
 * saving when it is not. Between the two questions, the duplicate outranks the
 * unusual amount, because "you already saved this" is a more specific
 * explanation of a surprising figure than "that is a lot".
 *
 * The final confirmation sits above everything: it is asked *before* the entry
 * is sent, so nothing has come back to disagree with it yet.
 */
export function deriveGate({
  result,
  pendingPayload,
  askingFinal,
}: GateInput): Gate | null {
  if (pendingPayload !== null && askingFinal) return { kind: "final" };
  if (!result || result.ok || pendingPayload === null) return null;
  if (result.canOverride) return { kind: "override" };
  if (result.duplicate) return { kind: "duplicate", candidate: result.duplicate };
  if (result.unusual) return { kind: "unusual", detail: result.unusual };
  return null;
}
