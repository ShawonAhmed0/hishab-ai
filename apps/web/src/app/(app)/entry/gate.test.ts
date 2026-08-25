import { describe, expect, it } from "vitest";
import { deriveGate } from "./gate";
import type { EntryResult } from "./actions";

/**
 * Spec R4.2. One dialog, switched on the kind of question — so the *order* in
 * which those kinds win is the entire rule, and it is the kind of thing a
 * refactor silently reorders.
 */

const payload = { type: "sale" };

function refusal(extra: Partial<Extract<EntryResult, { ok: false }>>): EntryResult {
  return { ok: false, error: "নাকচ", ...extra };
}

const candidate = {
  id: "11111111-1111-1111-1111-111111111111",
  voucherNo: "SALE-000012",
  savedAt: "2026-08-23T04:00:00.000Z",
  total: "80000.0000",
};

describe("which question the entry form asks", () => {
  it("asks nothing before the first submit", () => {
    expect(deriveGate({ result: null, pendingPayload: null, askingFinal: false })).toBeNull();
  });

  it("asks nothing when the entry saved", () => {
    const ok = { ok: true, transactionId: "x", voucherNo: "SALE-1" } as EntryResult;
    expect(deriveGate({ result: ok, pendingPayload: payload, askingFinal: false })).toBeNull();
  });

  it("asks the final confirmation before anything has been sent", () => {
    // Nothing has come back yet, so nothing can disagree with it.
    expect(deriveGate({ result: null, pendingPayload: payload, askingFinal: true })).toEqual({
      kind: "final",
    });
  });

  it("raises the PIN dialog on a refusal an admin may override", () => {
    expect(
      deriveGate({
        result: refusal({ canOverride: true, blockedRule: "negativeStock" }),
        pendingPayload: payload,
        askingFinal: false,
      }),
    ).toEqual({ kind: "override" });
  });

  it("carries the existing voucher so the duplicate dialog can link to it", () => {
    expect(
      deriveGate({
        result: refusal({ duplicate: candidate }),
        pendingPayload: payload,
        askingFinal: false,
      }),
    ).toEqual({ kind: "duplicate", candidate });
  });

  it("carries both figures when the amount is unusual for this party", () => {
    const detail = {
      total: "৳ 8,00,000.00",
      usual: "৳ 10,000.00",
      trigger: "multiple" as const,
    };
    expect(
      deriveGate({
        result: refusal({ unusual: detail }),
        pendingPayload: payload,
        askingFinal: false,
      }),
    ).toEqual({ kind: "unusual", detail });
  });

  it("says nothing about a plain validation failure", () => {
    // Field errors belong in the summary and against the boxes, not in a
    // modal the user has to dismiss before they can fix anything.
    expect(
      deriveGate({
        result: refusal({ fieldErrors: { partyId: "পক্ষ নির্বাচন করুন" } }),
        pendingPayload: payload,
        askingFinal: false,
      }),
    ).toBeNull();
  });
});

describe("precedence, when more than one is true at once", () => {
  it("puts an overridable block above both questions", () => {
    // A block is not one click from saving, and offering "save anyway" beside
    // it would say that it is.
    expect(
      deriveGate({
        result: refusal({ canOverride: true, duplicate: candidate, unusual: { total: "৳ 1", trigger: "absolute" as const } }),
        pendingPayload: payload,
        askingFinal: false,
      }),
    ).toEqual({ kind: "override" });
  });

  it("puts the duplicate above the unusual amount", () => {
    // "You already saved this" explains a surprising figure better than
    // "that is a lot" does.
    expect(
      deriveGate({
        result: refusal({ duplicate: candidate, unusual: { total: "৳ 1", trigger: "absolute" as const } }),
        pendingPayload: payload,
        askingFinal: false,
      }),
    ).toEqual({ kind: "duplicate", candidate });
  });

  it("puts the final confirmation above every reply", () => {
    expect(
      deriveGate({
        result: refusal({ canOverride: true, duplicate: candidate }),
        pendingPayload: payload,
        askingFinal: true,
      }),
    ).toEqual({ kind: "final" });
  });
});

describe("a stale reply must not raise a dialog", () => {
  /**
   * `pendingPayload` is the entry waiting on an answer. Once it is cleared the
   * user has gone back to editing, and a dialog about the submit they already
   * dismissed would be a modal they cannot explain.
   */
  it("asks nothing about an overridable block with nothing in flight", () => {
    expect(
      deriveGate({
        result: refusal({ canOverride: true }),
        pendingPayload: null,
        askingFinal: false,
      }),
    ).toBeNull();
  });

  it("asks nothing about a duplicate with nothing in flight", () => {
    expect(
      deriveGate({ result: refusal({ duplicate: candidate }), pendingPayload: null, askingFinal: false }),
    ).toBeNull();
  });

  it("does not raise the final confirmation with nothing in flight", () => {
    // askingFinal without a payload is not a question about anything.
    expect(deriveGate({ result: null, pendingPayload: null, askingFinal: true })).toBeNull();
  });
});
