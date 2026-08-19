import {
  ZERO,
  addMoney,
  isZeroMoney,
  moneyToDb,
  type Money,
} from "@hishabai/shared";
import type { JournalLineDraft } from "./context";
import { PostingError } from "./errors";

/**
 * Accumulates the double-entry side of a posting.
 *
 * Zero lines are dropped rather than written, and `build()` refuses to hand
 * back an entry that does not balance — the invariant is checked here so no
 * individual posting rule has to remember to check it.
 */
export class JournalBuilder {
  private readonly lines: JournalLineDraft[] = [];

  debit(
    accountId: string,
    amount: Money,
    options: { partyId?: string; narration?: string } = {},
  ): this {
    return this.push(accountId, amount, ZERO, options);
  }

  credit(
    accountId: string,
    amount: Money,
    options: { partyId?: string; narration?: string } = {},
  ): this {
    return this.push(accountId, ZERO, amount, options);
  }

  /**
   * Post an amount that may legitimately be either sign — a stock adjustment
   * gain and a shrinkage differ only in the sign of the delta.
   */
  signed(
    accountId: string,
    amount: Money,
    side: "debit" | "credit",
    options: { partyId?: string; narration?: string } = {},
  ): this {
    if (isZeroMoney(amount)) return this;
    const flip = amount < 0n;
    const magnitude = (flip ? -amount : amount) as Money;
    const effective = flip ? (side === "debit" ? "credit" : "debit") : side;
    return effective === "debit"
      ? this.debit(accountId, magnitude, options)
      : this.credit(accountId, magnitude, options);
  }

  private push(
    accountId: string,
    debit: Money,
    credit: Money,
    options: { partyId?: string; narration?: string },
  ): this {
    if (isZeroMoney(debit) && isZeroMoney(credit)) return this;
    if (debit < 0n || credit < 0n) {
      throw new PostingError(
        "INVALID_AMOUNT",
        { rule: "negativeJournalAmount" },
        `Journal amounts must be non-negative on ${accountId}; use the opposite side instead.`,
      );
    }
    const line: JournalLineDraft = { accountId, debit, credit };
    if (options.partyId !== undefined) line.partyId = options.partyId;
    if (options.narration !== undefined) line.narration = options.narration;
    this.lines.push(line);
    return this;
  }

  get totalDebit(): Money {
    return addMoney(...this.lines.map((l) => l.debit));
  }

  get totalCredit(): Money {
    return addMoney(...this.lines.map((l) => l.credit));
  }

  get isEmpty(): boolean {
    return this.lines.length === 0;
  }

  build(): JournalLineDraft[] {
    const debit = this.totalDebit;
    const credit = this.totalCredit;
    if (debit !== credit) {
      throw new PostingError(
        "UNBALANCED_ENTRY",
        { rule: "unbalancedEntry" },
        `Double-entry invariant violated: debits ${moneyToDb(debit)} do not equal credits ${moneyToDb(credit)}.`,
      );
    }
    return this.lines;
  }
}
