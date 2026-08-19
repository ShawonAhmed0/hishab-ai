/**
 * Locale selection.
 *
 * Deliberately not a runtime i18n library. There are two locales, the strings
 * are static, and the dictionaries are plain objects — a library would add a
 * loader, a provider and an interpolation syntax to solve problems this
 * codebase does not have. What it *would* give us for free is the missing-key
 * check, so `./bn` derives `Dictionary` and `./en` is annotated with it.
 */
import type { BlockedReason, WarnedReason } from "../types";
import { bn, type Dictionary } from "./bn";
import { en } from "./en";

export * from "./bn";
export { en };

/**
 * The keys of a dictionary group whose values are plain strings.
 *
 * Some groups hold parametrised messages, which are functions. A component
 * that stores a key and renders `t.group[key]` needs the string ones only —
 * `keyof` alone would let a function through and fail at the JSX child.
 */
export type StringKeys<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

export const LOCALES = ["bn", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Bengali-first, and the fallback for anything unrecognised. */
export const DEFAULT_LOCALE: Locale = "bn";

export const dictionaries: Record<Locale, Dictionary> = { bn, en };

/** What each locale calls itself — never translated. */
export const localeName: Record<Locale, string> = { bn: "বাংলা", en: "English" };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/**
 * `null` for anything that is not a locale we ship.
 *
 * The caller decides what to do with that. This returns `null` rather than
 * silently defaulting because the difference matters in one place: the root
 * layout needs to know whether the user has *chosen* Bengali or merely not
 * chosen anything.
 */
export function parseLocale(value: string | undefined | null): Locale | null {
  return value === "bn" || value === "en" ? value : null;
}

/**
 * The sentence for a refusal, in the caller's language.
 *
 * A switch rather than `t.blocked[reason.rule](...)` on purpose: each rule
 * carries different values, and the switch is what makes TypeScript check that
 * they are passed in the right order. Adding a rule to `BlockedReason` without
 * a case here is a compile error at the `never`.
 */
export function blockedMessage(reason: BlockedReason, t: Dictionary): string {
  switch (reason.rule) {
    case "emptyTransaction":
      return t.blocked.emptyTransaction;
    case "unbalancedEntry":
      return t.blocked.unbalancedEntry;
    case "negativeJournalAmount":
      return t.blocked.negativeJournalAmount;
    case "missingProduct":
      return t.blocked.missingProduct;
    case "missingFinancialAccount":
      return t.blocked.missingFinancialAccount;
    case "paymentExceedsTotal":
      return t.blocked.paymentExceedsTotal(reason.paid, reason.total);
    case "discountExceedsTotal":
      return t.blocked.discountExceedsTotal(reason.discount, reason.total);
    case "productionCostUnpaid":
      return t.blocked.productionCostUnpaid(reason.cost, reason.paid);
    case "wastageNotAnInput":
      return t.blocked.wastageNotAnInput(reason.product);
    case "wastageExceedsInputs":
      return t.blocked.wastageExceedsInputs;
    case "negativeStock":
      return t.blocked.negativeStock(reason.product, reason.available, reason.requested);
    case "duplicateMemo":
      return t.blocked.duplicateMemo(reason.memoNo, reason.voucher);
    case "duplicateMemoNumber":
      return t.blocked.duplicateMemoNumber(reason.memoNo);
    case "insufficientFunds":
      return t.blocked.insufficientFunds(reason.wallet, reason.available, reason.requested);
    case "overCreditLimit":
      return t.blocked.overCreditLimit(reason.party, reason.limit, reason.projected);
    case "riskyParty":
      return t.blocked.riskyParty(reason.party);
    case "negativeCapital":
      return t.blocked.negativeCapital(reason.available, reason.requested);
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/** The same, for the warnings that post anyway. */
export function warnedMessage(reason: WarnedReason, t: Dictionary): string {
  switch (reason.rule) {
    case "stockWentNegative":
      return t.warned.stockWentNegative(reason.product);
    case "zeroCostReturn":
      return t.warned.zeroCostReturn(reason.product);
    case "zeroCostSurplus":
      return t.warned.zeroCostSurplus(reason.product);
    case "overCreditLimit":
      return t.warned.overCreditLimit(reason.party, reason.limit, reason.projected);
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}
