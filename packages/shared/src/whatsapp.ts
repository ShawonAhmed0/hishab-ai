/**
 * WhatsApp message templates — spec R4.6.
 *
 * Meta does not let an application send free text to somebody who has not
 * messaged it in the last 24 hours. Everything here is therefore a *template*:
 * a body registered with Meta ahead of time, with positional `{{1}}`
 * placeholders, approved once and then referenced by name. That is why the
 * bodies live in the repo as constants — they have to exist here before they
 * can be submitted for approval, and the copy that ships has to be the copy
 * that was approved, or the send is rejected at the API.
 *
 * Both locales are registered as the *same* template name with different
 * language codes, which is how Meta models translations. `bn` is the default
 * for the reason it is everywhere else in this codebase.
 *
 * Nothing here sends anything or knows how to. It is the vocabulary; the
 * delivery layer is `packages/core/src/delivery.ts`.
 */
import type { Locale } from "./i18n";

/** Meta's language codes, which are not our locale strings. */
export const WHATSAPP_LANGUAGE: Record<Locale, string> = { bn: "bn", en: "en" };

export interface WhatsAppTemplate {
  /**
   * The name registered with Meta. Lower snake case is their constraint, not
   * a style choice.
   */
  readonly name: string;
  /**
   * What each `{{n}}` means, in order. Documentation for whoever submits the
   * template, and the thing `renderTemplate` counts against so a caller that
   * passes the wrong number of parameters fails here rather than at Meta.
   */
  readonly params: readonly string[];
  readonly body: Readonly<Record<Locale, string>>;
}

/**
 * The four events spec R4.6 lists, and nothing else.
 *
 * Every figure is passed already formatted. A template parameter is a string
 * to Meta, and the formatting rules — ৳, 2-2-3 grouping — are the same in both
 * locales, so the sentence is the only thing that differs.
 */
export const WHATSAPP_TEMPLATES = {
  /** Money collected from a customer → admin. */
  paymentReceived: {
    name: "payment_received",
    params: ["party", "amount", "voucher"],
    body: {
      bn: "{{1}} থেকে {{2}} পাওয়া গেছে। ভাউচার {{3}}।",
      en: "{{2}} received from {{1}}. Voucher {{3}}.",
    },
  },
  /** Entry recorded against a customer → that customer. */
  entryRecorded: {
    name: "entry_recorded",
    params: ["company", "amount", "due", "voucher"],
    body: {
      bn: "{{1}} — আপনার নামে {{2}} টাকার এন্ট্রি হয়েছে। বকেয়া {{3}}। ভাউচার {{4}}।",
      en: "{{1}} — an entry of {{2}} was recorded in your name. Outstanding {{3}}. Voucher {{4}}.",
    },
  },
  /** The day's totals → admin. */
  dailySummary: {
    name: "daily_summary",
    params: ["date", "sales", "collected", "due"],
    body: {
      bn: "{{1}} — বিক্রয় {{2}}, আদায় {{3}}, মোট বকেয়া {{4}}।",
      en: "{{1}} — sales {{2}}, collected {{3}}, outstanding {{4}}.",
    },
  },
  /** R5.1: a customer went yellow or red → the sales side. This is R5.6. */
  customerAtRisk: {
    name: "customer_at_risk",
    params: ["party", "days", "due"],
    body: {
      bn: "{{1}} {{2}} দিন ধরে কোনো অর্ডার দেয়নি। বকেয়া {{3}}। একবার ফোন করুন।",
      en: "{{1}} has not ordered for {{2}} days. Outstanding {{3}}. Worth a call.",
    },
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;
export const WHATSAPP_TEMPLATE_KEYS = Object.keys(
  WHATSAPP_TEMPLATES,
) as WhatsAppTemplateKey[];

/**
 * The body with its placeholders filled — for the delivery log and for tests.
 *
 * Meta is sent the template name and the parameters separately and renders it
 * on their side, so this is never what goes over the wire. It is what a human
 * reads afterwards when they want to know what was actually sent.
 */
export function renderTemplate(
  key: WhatsAppTemplateKey,
  locale: Locale,
  params: readonly string[],
): string {
  const template: WhatsAppTemplate = WHATSAPP_TEMPLATES[key];
  if (params.length !== template.params.length) {
    throw new Error(
      `whatsapp template ${template.name} takes ${template.params.length} ` +
        `parameters (${template.params.join(", ")}), got ${params.length}`,
    );
  }
  return template.body[locale].replace(/\{\{(\d+)\}\}/g, (_, index: string) =>
    // Meta numbers from 1. An out-of-range index cannot happen after the
    // length check above, but leaving the placeholder is better than "undefined".
    params[Number(index) - 1] ?? `{{${index}}}`,
  );
}

/**
 * A Bangladeshi mobile number in the form the Cloud API wants.
 *
 * Meta takes E.164 without the leading `+`. What is actually in the database is
 * whatever the shopkeeper typed: `01812345678`, `+8801812345678`, or the same
 * with spaces and dashes in it. Getting this wrong does not throw — it delivers
 * to nobody, silently — so it is worth the twelve lines and the tests.
 *
 * Returns null for anything that is not a plausible BD mobile number, and the
 * caller declines to send rather than guessing.
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");

  // 8801812345678 — already country-coded.
  if (digits.length === 13 && digits.startsWith("880")) {
    return digits.startsWith("8801") ? digits : null;
  }
  // 01812345678 — the way it is written locally.
  if (digits.length === 11 && digits.startsWith("01")) return `88${digits}`;
  // 1812345678 — the leading zero dropped, as it is when dialled from abroad.
  if (digits.length === 10 && digits.startsWith("1")) return `880${digits}`;

  return null;
}
