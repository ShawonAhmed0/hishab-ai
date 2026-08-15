/**
 * Cancellation by reversal.
 *
 * Spec §18: financial transactions are never physically deleted. Cancelling
 * generates a mirror-image entry that leaves both the original and the undo
 * visible in the ledger, so an audit can always see what happened and when
 * someone changed their mind.
 */
import { ZERO, type Money } from "@hishabai/shared";
import type {
  JournalLineDraft,
  PostingContext,
  PostingResult,
  StockMovementDraft,
} from "./context";
import { JournalBuilder } from "./ledger";
import { StockLedger } from "./stock";

export interface ReversibleTransaction {
  journalLines: readonly JournalLineDraft[];
  stockMovements: readonly StockMovementDraft[];
  totals: PostingResult["totals"];
  partyDelta?: PostingResult["partyDelta"];
  payments?: PostingResult["payments"];
}

export interface ReversalResult {
  journalLines: JournalLineDraft[];
  stockMovements: StockMovementDraft[];
  payments: PostingResult["payments"];
  partyDelta?: PostingResult["partyDelta"];
}

export function reverseTransaction(
  original: ReversibleTransaction,
  context: Pick<PostingContext, "products" | "allowNegativeStock">,
): ReversalResult {
  const journal = new JournalBuilder();
  for (const line of original.journalLines) {
    const options: { partyId?: string; narration?: string } = {
      narration: line.narration ? `বাতিল: ${line.narration}` : "বাতিল এন্ট্রি",
    };
    if (line.partyId !== undefined) options.partyId = line.partyId;

    // Swap the sides. Every other property is carried through untouched.
    if (line.debit !== ZERO) journal.credit(line.accountId, line.debit, options);
    if (line.credit !== ZERO) journal.debit(line.accountId, line.credit, options);
  }

  // Stock is unwound at the value each movement originally carried, so a
  // cancellation restores the exact book value even if the running average
  // has moved on since.
  const stock = new StockLedger(context.products, context.allowNegativeStock ?? true);
  for (const movement of original.stockMovements) {
    if (movement.direction === "out") {
      stock.in(movement.productId, movement.quantity, movement.value, "reversal");
    } else {
      stock.out(movement.productId, movement.quantity, "reversal", {
        valueOverride: movement.value,
      });
    }
  }

  const result: ReversalResult = {
    journalLines: journal.build(),
    stockMovements: stock.build(),
    payments: (original.payments ?? []).map((payment) => ({
      ...payment,
      direction: payment.direction === "in" ? ("out" as const) : ("in" as const),
    })),
  };

  if (original.partyDelta) {
    result.partyDelta = {
      partyId: original.partyDelta.partyId,
      receivable: -original.partyDelta.receivable as Money,
      payable: -original.partyDelta.payable as Money,
    };
  }

  return result;
}
