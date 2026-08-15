/**
 * Posting failures carry a Bengali message, because every one of them is
 * something the person at the keyboard has to understand and fix.
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
  | "EMPTY_TRANSACTION";

export class PostingError extends Error {
  readonly code: PostingErrorCode;
  /** Message safe to show the user, already in Bengali. */
  readonly messageBn: string;
  readonly details: Record<string, unknown>;

  constructor(
    code: PostingErrorCode,
    messageBn: string,
    messageEn: string,
    details: Record<string, unknown> = {},
  ) {
    super(`${code}: ${messageEn}`);
    this.name = "PostingError";
    this.code = code;
    this.messageBn = messageBn;
    this.details = details;
  }
}

export type PostingWarningCode = "NEGATIVE_STOCK" | "ZERO_COST_ISSUE" | "OVER_CREDIT_LIMIT";

export interface PostingWarning {
  code: PostingWarningCode;
  messageBn: string;
  details?: Record<string, unknown>;
}
