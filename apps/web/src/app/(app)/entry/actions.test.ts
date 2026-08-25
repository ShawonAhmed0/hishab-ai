import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError, z } from "zod";
import { PostingError } from "@hishabai/accounting";

/**
 * How a refusal reaches the user.
 *
 * Every rule in Phases 1–4 ends here: the engine throws a typed error, and
 * this is the one place that decides which sentence, which language, and
 * whether a PIN dialog is offered. Getting `canOverride` wrong is the
 * interesting failure — too generous and the browser raises a PIN prompt that
 * the server will refuse, too strict and an admin cannot save an entry they
 * are entitled to save.
 *
 * The server is asked again on every retry regardless of what goes back, so
 * none of this is a permission. It is what the browser is told to show.
 */

const createTransaction = vi.hoisted(() => vi.fn());
const requireSession = vi.hoisted(() => vi.fn());

vi.mock("@hishabai/core", async () => {
  const actual = await vi.importActual<typeof import("@hishabai/core")>("@hishabai/core");
  return { ...actual, createTransaction, flushDeliveries: vi.fn() };
});
vi.mock("@/lib/session", () => ({ requireSession }));
/**
 * Only the cookie read is replaced, not the dictionary — `dict()` reaches for
 * the request store, which a test does not have. The real Bengali dictionary
 * still resolves every message, so the assertions below are about the actual
 * copy a user would see.
 */
vi.mock("@/lib/locale.server", async () => {
  const shared = await vi.importActual<typeof import("@hishabai/shared")>("@hishabai/shared");
  return { dict: async () => shared.bn, currentLocale: async () => "bn" as const };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { createEntryAction } from "./actions";
import { OverrideError } from "@hishabai/core";

/** The dictionary is read per request; bn is the default and the fallback. */
const asRole = (role: "admin" | "manager" | "operator") =>
  requireSession.mockResolvedValue({ userId: "u", companyId: "c", role });

beforeEach(() => {
  createTransaction.mockReset();
  requireSession.mockReset();
  asRole("admin");
});

afterEach(() => vi.clearAllMocks());

describe("a rule that refuses the entry", () => {
  const notEnoughStock = () =>
    new PostingError(
      "NEGATIVE_STOCK",
      {
        rule: "negativeStock",
        productId: "p1",
        product: "আর্ট কার্ড",
        available: "৪০ কেজি",
        requested: "১০০ কেজি",
      },
      "not enough stock",
    );

  it("offers the PIN dialog to an admin, naming the rule", async () => {
    createTransaction.mockRejectedValue(notEnoughStock());
    const result = await createEntryAction({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.canOverride).toBe(true);
    // The rule travels back so the retry authorises *that* rule and no other.
    expect(result.blockedRule).toBe("negativeStock");
    // The sentence is built from the reason against this request's dictionary,
    // not frozen into the error.
    expect(result.error).toContain("আর্ট কার্ড");
    expect(result.error).toContain("৪০ কেজি");
  });

  it("does not offer it to anyone else", async () => {
    createTransaction.mockRejectedValue(notEnoughStock());
    for (const role of ["manager", "operator"] as const) {
      asRole(role);
      const result = await createEntryAction({});
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // Still refused, still explained — just no door.
      expect(result.canOverride).toBe(false);
      expect(result.error).toContain("আর্ট কার্ড");
    }
  });

  it("offers no door at all for a rule nothing can override", async () => {
    // An unbalanced entry is not a policy an admin may disagree with; it is
    // arithmetic. No PIN lifts it.
    createTransaction.mockRejectedValue(
      new PostingError("UNBALANCED_ENTRY", { rule: "unbalancedEntry" }, "unbalanced"),
    );
    const result = await createEntryAction({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.canOverride).toBeUndefined();
    expect(result.blockedRule).toBeUndefined();
  });
});

describe("a PIN that did not work", () => {
  it("keeps the dialog open on a wrong PIN, so it can be retyped", async () => {
    createTransaction.mockRejectedValue(new OverrideError("wrong_pin", "ভুল পিন", "wrong pin"));
    const result = await createEntryAction({}, { override: { pin: "0000", rules: [] } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.canOverride).toBe(true);
    expect(result.overrideError).toBe("wrong_pin");
  });

  it("closes it when re-typing cannot help", async () => {
    // No PIN set, not an admin, or a rule that is not overridable: another
    // attempt at the same PIN is not the answer to any of these.
    for (const kind of ["no_pin", "not_admin", "not_overridable"] as const) {
      createTransaction.mockRejectedValue(new OverrideError(kind, "বাংলা", "english"));
      const result = await createEntryAction({}, { override: { pin: "1234", rules: [] } });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.canOverride, kind).toBe(false);
      expect(result.overrideError).toBe(kind);
    }
  });
});

describe("a form that does not validate", () => {
  it("puts a message against each field, keyed by the server's own path", async () => {
    createTransaction.mockRejectedValue(
      new ZodError([
        {
          code: z.ZodIssueCode.custom,
          path: ["partyId"],
          message: "validation.chooseOne",
        },
        {
          code: z.ZodIssueCode.custom,
          path: ["lines", 0, "quantity"],
          message: "validation.mustBePositive",
        },
      ]),
    );

    const result = await createEntryAction({});
    expect(result.ok).toBe(false);
    if (result.ok) return;

    // The path is what ErrorSummary links to, so the shape matters.
    expect(Object.keys(result.fieldErrors ?? {})).toEqual([
      "partyId",
      "lines.0.quantity",
    ]);
    // Keys, not sentences: resolved here against this request's dictionary.
    expect(result.fieldErrors?.["partyId"]).not.toContain("validation.");
    expect(result.fieldErrors?.["partyId"]).toBeTruthy();
  });

  it("keeps the first message when one field fails twice", async () => {
    createTransaction.mockRejectedValue(
      new ZodError([
        { code: z.ZodIssueCode.custom, path: ["partyId"], message: "validation.chooseOne" },
        { code: z.ZodIssueCode.custom, path: ["partyId"], message: "validation.required" },
      ]),
    );
    const result = await createEntryAction({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(["partyId"]);
  });
});
