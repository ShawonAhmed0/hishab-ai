/**
 * Which paths the session guard lets through — and why each one is on a list.
 *
 * Kept out of `middleware.ts` so it can be tested. The middleware itself needs
 * `@supabase/ssr` and a NextRequest to run at all, which is exactly the kind of
 * thing that stops a rule like this from ever being checked.
 */

/** Signed-out visitors belong here: this is how they sign in. */
const PUBLIC_PATHS = ["/login", "/register", "/reset-password", "/auth"];

/**
 * Authenticated, but not by a session cookie.
 *
 * These are **not public**. Each one authenticates its own caller and answers
 * 401 or 503 when that fails — `/api/cron` checks a bearer token against
 * `CRON_SECRET` in constant time and refuses outright when no secret is set.
 * The session guard has to stand aside for them because the caller is a
 * scheduler, which has no cookie to present and no login page to be sent to.
 *
 * Deliberately a separate list from PUBLIC_PATHS rather than more entries in
 * it: a future path added here inherits the obligation to authenticate itself,
 * and calling it "public" is how somebody would come to believe it need not.
 */
const SELF_AUTHENTICATED_PATHS = ["/api/cron"];

/** Prefix match, and anchored at a segment boundary. */
function matches(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`),
  );
}

export function isPublicPath(path: string): boolean {
  return matches(path, PUBLIC_PATHS);
}

export function isSelfAuthenticatedPath(path: string): boolean {
  return matches(path, SELF_AUTHENTICATED_PATHS);
}

/**
 * Does a signed-out request to this path get redirected to the login page?
 *
 * The cron route did, before this existed — Vercel's scheduler was answered
 * with a 307 to /login and the job never ran once. Its own bearer check never
 * got the chance to refuse anything, which is the worst way for an endpoint to
 * be secure.
 */
export function requiresSession(path: string): boolean {
  return !isPublicPath(path) && !isSelfAuthenticatedPath(path);
}
