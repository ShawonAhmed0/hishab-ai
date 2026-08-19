import {
  bn,
  blockedMessage,
  warnedMessage,
  type BlockedReason,
  type WarnedReason,
} from "@hishabai/shared";

/**
 * Posting failures carry the *reason* rather than a sentence.
 *
 * Every one of them is something the person at the keyboard has to understand
 * and fix, and since Phase 0 that person may be reading either language. The
 * engine is pure, so it cannot know which — it names the rule and the numbers,
 * and the web layer renders the sentence from the dictionary it is already
 * serving the page in.
 *
 * `messageBn` stays available for the places that have no locale to hand — a
 * server log, an audit summary — and is rendered from the Bengali dictionary
 * so the two can never drift apart.
 */
export type PostingErrorCode =
  | "UNBALANCED_ENTRY"
  | "MISSING_ACCOUNT"
  | "MISSING_PRODUCT"
  | "MISSING_FINANCIAL_ACCOUNT"
  | "PAYMENT_EXCEEDS_TOTAL"
  | "NEGATIVE_STOCK"
  | "INVALID_AMOUNT"
  | "PRODUCTION_COST_UNPAID"
  | "WASTAGE_NOT_AN_INPUT"
  | "EMPTY_TRANSACTION"
  | "INSUFFICIENT_FUNDS"
  | "OVER_CREDIT_LIMIT"
  | "RISKY_PARTY"
  | "NEGATIVE_CAPITAL";

export class PostingError extends Error {
  readonly code: PostingErrorCode;
  /** Which rule refused, and the values it refused over. */
  readonly reason: BlockedReason;

  constructor(code: PostingErrorCode, reason: BlockedReason, messageEn: string) {
    super(`${code}: ${messageEn}`);
    this.name = "PostingError";
    this.code = code;
    this.reason = reason;
  }

  /** Bengali, for logs and audit summaries that have no request locale. */
  get messageBn(): string {
    return blockedMessage(this.reason, bn);
  }
}

export type PostingWarningCode = "NEGATIVE_STOCK" | "ZERO_COST_ISSUE" | "OVER_CREDIT_LIMIT";

/**
 * Something the entry did anyway. Same shape as a refusal and for the same
 * reason: it is read by the person at the counter, in the language they chose.
 */
export interface PostingWarning {
  code: PostingWarningCode;
  reason: WarnedReason;
  details?: Record<string, unknown>;
}

/** Bengali, for the notification row — which has no reader's locale. */
export function warningMessageBn(warning: PostingWarning): string {
  return warnedMessage(warning.reason, bn);
}
