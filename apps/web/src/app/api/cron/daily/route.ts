import { runDailyJobs } from "@hishabai/core";
import { timingSafeEqual } from "node:crypto";

/**
 * The clock — spec R4.6's daily summary and R5.6's follow-up reminders.
 *
 * Both are events with no posting behind them: the day ended, or a customer
 * did not order. Nothing in the app can notice either, so something outside it
 * has to knock. On Vercel that is a cron in `vercel.json`; anywhere else it is
 * whatever can make an authenticated request once a day.
 *
 * The work itself is idempotent per company per day, so a cron that fires
 * twice — which is a Tuesday — queues nothing the second time.
 */

/** No caching, ever: the whole point is that today's answer differs. */
export const dynamic = "force-dynamic";
/** It talks to the database as a real member, so it needs the Node runtime. */
export const runtime = "nodejs";

/**
 * Constant-time, and length-safe.
 *
 * `a === b` on a secret leaks its prefix through timing, and `timingSafeEqual`
 * throws rather than returns false when the lengths differ — which would turn
 * a wrong-length token into a 500 instead of a 401.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env["CRON_SECRET"];

  // Refuse rather than run unauthenticated. An open endpoint that messages
  // every customer of every company is not something to leave to obscurity,
  // and failing closed on a missing secret is the only safe default.
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!tokenMatches(provided, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await runDailyJobs();

  // 200 even with per-company failures: the cron did its job, and a non-2xx
  // would have Vercel retry the companies that already succeeded. The failures
  // are in the body for whoever reads the logs.
  return Response.json(report);
}
