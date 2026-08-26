import { afterEach, describe, expect, it, vi } from "vitest";
import { attempt } from "./attempt";

/**
 * The whole point of this helper is a failure that used to be invisible.
 *
 * A rejected server-action call escaped `startTransition`, reached the root
 * error boundary, and replaced the page — losing whatever was typed. Nothing
 * about that shows up in a type check, and it only happens when the network
 * misbehaves, which is exactly when nobody is watching.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every path here logs; the tests should not print it. */
function silenceConsole() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("a server action that answers", () => {
  it("hands back the value and no failure", async () => {
    const [value, failure] = await attempt(async () => ({ ok: true as const, id: "v1" }));
    expect(failure).toBeNull();
    expect(value).toEqual({ ok: true, id: "v1" });
  });

  it("passes a business failure through untouched", async () => {
    // A refused entry is a *value*, not a throw — the action caught it
    // server-side. This helper must not turn it into a transport problem.
    const refused = { ok: false as const, error: "পর্যাপ্ত স্টক নেই" };
    const [value, failure] = await attempt(async () => refused);
    expect(failure).toBeNull();
    expect(value).toBe(refused);
  });
});

describe("a server action that never arrives", () => {
  it("returns a failure instead of throwing", async () => {
    silenceConsole();
    const [value, failure] = await attempt(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(value).toBeNull();
    expect(failure).not.toBeNull();
    expect(failure?.detail).toBe("Failed to fetch");
  });

  it("does not reject, whatever was thrown", async () => {
    silenceConsole();
    // Actions can reject with things that are not Errors — a string from a
    // proxy, a serialization failure carrying an object.
    await expect(attempt(async () => Promise.reject("gateway timeout"))).resolves.toBeTruthy();
    const [, failure] = await attempt(async () => Promise.reject({ code: 502 }));
    expect(failure?.detail).toContain("object");
  });

  it("says so when the browser knows it is offline", async () => {
    silenceConsole();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const [, failure] = await attempt(async () => {
      throw new Error("network");
    });
    expect(failure?.offline).toBe(true);
  });

  it("does not claim offline merely because the browser thinks it is online", async () => {
    silenceConsole();
    // `navigator.onLine === true` means a network interface exists, not that
    // anything is reachable. It may upgrade the message, never suppress it.
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const [, failure] = await attempt(async () => {
      throw new Error("500");
    });
    expect(failure).not.toBeNull();
    expect(failure?.offline).toBe(false);
  });

  it("logs the cause, since only the browser ever sees it", async () => {
    const spy = silenceConsole();
    await attempt(async () => {
      throw new Error("boom");
    });
    expect(spy).toHaveBeenCalled();
  });
});
