import { describe, expect, it } from "vitest";
import { isPublicPath, isSelfAuthenticatedPath, requiresSession } from "./route-access";

/**
 * The middleware's redirect decision, which is easy to get wrong in the
 * direction that matters.
 *
 * It was wrong: /api/cron authenticates its own caller with a bearer token, and
 * the session guard answered Vercel's scheduler with a 307 to /login. The
 * endpoint never ran, and its own check never got to refuse anything — the
 * worst way for something to be secure.
 */
describe("which paths need a session", () => {
  it("guards the application", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/entry",
      "/customers",
      "/customers/health",
      "/settings",
      "/settings/deliveries",
      "/reports/cash-book",
    ]) {
      expect(requiresSession(path), path).toBe(true);
    }
  });

  it("lets a signed-out visitor reach the pages that sign them in", () => {
    for (const path of ["/login", "/register", "/reset-password", "/auth/callback"]) {
      expect(requiresSession(path), path).toBe(false);
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it("stands aside for a route that authenticates its own caller", () => {
    expect(requiresSession("/api/cron/daily")).toBe(false);
    expect(isSelfAuthenticatedPath("/api/cron/daily")).toBe(true);
    // …and it is not "public". The distinction is the whole reason there are
    // two lists: this route still refuses anyone without the bearer token.
    expect(isPublicPath("/api/cron/daily")).toBe(false);
  });

  it("does not let a prefix leak past a segment boundary", () => {
    // `startsWith("/login")` alone would wave these through. None of them
    // exist today, and that is exactly the kind of thing that changes.
    for (const path of ["/loginish", "/registers", "/authority", "/api/crontab"]) {
      expect(requiresSession(path), path).toBe(true);
    }
  });

  it("treats an exact match and a subpath the same way", () => {
    expect(requiresSession("/auth")).toBe(false);
    expect(requiresSession("/auth/callback")).toBe(false);
    expect(requiresSession("/api/cron")).toBe(false);
    expect(requiresSession("/api/cron/daily")).toBe(false);
  });

  it("guards every other API route", () => {
    // Only /api/cron is exempt. Anything else added under /api answers to the
    // session guard until somebody deliberately puts it on the list.
    expect(requiresSession("/api/anything-else")).toBe(true);
    expect(requiresSession("/api/v1/entries")).toBe(true);
  });
});
