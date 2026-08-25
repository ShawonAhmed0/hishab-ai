/**
 * Where a redirect carried in a query string is allowed to land.
 *
 * `next` reaches /auth/callback from an emailed link, so it is
 * attacker-controlled by construction: anyone who can put a link in front of a
 * user chooses it. The job is to make this domain useless for laundering a
 * redirect somewhere else.
 *
 * In its own module rather than beside the route, because a Next route file may
 * only export its handlers — exporting a helper from one is a build error, and
 * not exporting it means nothing can test it.
 */

/** Our own paths only, and never a protocol-relative one. */
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  // A leading `//` is a protocol-relative URL and goes off-site while still
  // starting with a slash. That is the half of this check that gets forgotten.
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
