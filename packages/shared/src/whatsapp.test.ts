import { describe, expect, it } from "vitest";
import {
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_KEYS,
  renderTemplate,
  toE164,
  type WhatsAppTemplateKey,
} from "./whatsapp";
import { LOCALES } from "./i18n";

/**
 * Spec R4.6. These constants are what gets submitted to Meta for approval, and
 * a template whose parameter count does not match its body is rejected there —
 * days later, by email. Checking it here costs nothing.
 */
describe("the WhatsApp templates", () => {
  it("declares every placeholder its body uses, in both locales", () => {
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      const template = WHATSAPP_TEMPLATES[key];
      for (const locale of LOCALES) {
        const used = [...template.body[locale].matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
          Number(m[1]),
        );
        const unique = [...new Set(used)].sort((a, b) => a - b);
        expect(unique, `${template.name} (${locale})`).toEqual(
          template.params.map((_, index) => index + 1),
        );
      }
    }
  });

  it("registers each name once", () => {
    const names = WHATSAPP_TEMPLATE_KEYS.map((k) => WHATSAPP_TEMPLATES[k].name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses only lower snake case names, which is Meta's constraint", () => {
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      expect(WHATSAPP_TEMPLATES[key].name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("fills the placeholders in order", () => {
    expect(renderTemplate("paymentReceived", "bn", ["করিম", "৳ 5,000.00", "RCPT-1"])).toBe(
      "করিম থেকে ৳ 5,000.00 পাওয়া গেছে। ভাউচার RCPT-1।",
    );
    // English puts the amount first, which is exactly why the bodies are
    // separate strings rather than one template with the words swapped.
    expect(renderTemplate("paymentReceived", "en", ["Karim", "৳ 5,000.00", "RCPT-1"])).toBe(
      "৳ 5,000.00 received from Karim. Voucher RCPT-1.",
    );
  });

  it("refuses the wrong number of parameters rather than sending a gap", () => {
    expect(() => renderTemplate("paymentReceived", "bn", ["করিম"])).toThrow(
      /takes 3 parameters/,
    );
  });
});

/**
 * Getting a number wrong here does not throw — it delivers to nobody, quietly.
 * That is the case worth the tests.
 */
describe("normalising a Bangladeshi mobile number", () => {
  it("takes the three ways the same number gets typed", () => {
    expect(toE164("01812345678")).toBe("8801812345678");
    expect(toE164("+8801812345678")).toBe("8801812345678");
    expect(toE164("8801812345678")).toBe("8801812345678");
  });

  it("ignores the punctuation people put in", () => {
    expect(toE164("018-1234 5678")).toBe("8801812345678");
    expect(toE164(" +880 1812-345678 ")).toBe("8801812345678");
  });

  it("takes the leading zero dropped, as it is written from abroad", () => {
    expect(toE164("1812345678")).toBe("8801812345678");
  });

  it("returns null rather than guessing", () => {
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("12345")).toBeNull();
    // A landline, not a mobile: WhatsApp has nowhere to deliver it.
    expect(toE164("029558877")).toBeNull();
    // Right length, wrong country prefix.
    expect(toE164("8811812345678")).toBeNull();
  });
});
