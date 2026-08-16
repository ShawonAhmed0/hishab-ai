import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, type Session, type TenantScope } from "@hishabai/core";
import { getAuthUser } from "./supabase/server";
import { VERIFIED_USER_HEADER } from "./headers";

export const ACTIVE_COMPANY_COOKIE = "hishabai_company";

/**
 * A year, http-only, lax. It holds a company id, not a permission — RLS checks
 * membership on every row regardless of what this says.
 */
const COMPANY_COOKIE = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
} as const;

/**
 * Records which company the user is working in.
 *
 * Worth doing at sign-in and not only when they create or switch companies:
 * without it, the very first request of every new session has no idea which
 * company to ask about, and has to wait for the membership lookup before it
 * can start its own query. Setting it here is what lets `sessionWithData` run
 * the two together.
 */
export async function rememberActiveCompany(companyId: string): Promise<void> {
  (await cookies()).set(ACTIVE_COMPANY_COOKIE, companyId, COMPANY_COOKIE);
}

/**
 * The signed-in user's id.
 *
 * The middleware already verified the JWT against the auth service on this
 * request and passed the id down as a header, so the page does not repeat that
 * network round trip. It strips any inbound copy of the header first, so this
 * cannot be forged from the browser. `getAuthUser()` remains the fallback for
 * any route the middleware matcher does not cover.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The active-company cookie, or undefined if it does not hold a UUID.
 *
 * The browser can write this cookie, so its contents are input. Handing a
 * malformed value straight to a `uuid` parameter turns a hand-edited cookie
 * into a 500 on every page — the user cannot get back to a working screen,
 * because the bad cookie is sent again with the next request. Treating it as
 * absent instead falls back to their first company, which is recoverable.
 */
const activeCompanyCookie = cache(async (): Promise<string | undefined> => {
  const value = (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value;
  return value && UUID.test(value) ? value : undefined;
});

export const currentUserId = cache(async (): Promise<string | null> => {
  const headerList = await headers();
  const verified = headerList.get(VERIFIED_USER_HEADER);
  if (verified) return verified;

  const user = await getAuthUser();
  return user?.id ?? null;
});

/**
 * Who is asking, which company they are in, and what they may do — resolved in
 * one database round trip, and memoised for the rest of the request so the
 * layout and the page it wraps share the answer.
 *
 * The role comes from `company_members` every time, never from a cookie or a
 * token claim, so revoking access takes effect on the next click.
 */
export const sessionContext = cache(async () => {
  const userId = await currentUserId();
  if (!userId) redirect("/login");

  const requested = await activeCompanyCookie();

  const resolved = await resolveSession(userId, requested);

  // Either no company is chosen, or the one in the cookie is no longer theirs.
  const companyId =
    resolved.role && requested ? requested : resolved.companies[0]?.id;
  const role = resolved.role ?? resolved.companies[0]?.role;

  if (!companyId || !role) redirect("/onboarding");

  return {
    session: { userId, companyId, role } satisfies Session,
    companies: resolved.companies,
    fullName: resolved.fullName,
  };
});

export const requireSession = cache(async (): Promise<Session> => {
  return (await sessionContext()).session;
});

/**
 * Who the request claims to be, from the verified header and the active-company
 * cookie — no database call at all.
 *
 * Not authorisation. The company id here is whatever the browser last stored,
 * and the only reason it is safe to query with is that RLS checks membership
 * itself on every row: `tenant_isolation` is
 * `company_id = app.current_company_id() and app.is_member(company_id)`, so a
 * cookie pointing at someone else's company returns nothing.
 *
 * A cookie that is not a UUID is discarded rather than passed on. It is a value
 * the browser can write, so a corrupted or hand-edited one must cost the
 * request its head start, not turn the page into a 500.
 */
const tenantHint = cache(async (): Promise<TenantScope | null> => {
  const userId = await currentUserId();
  if (!userId) return null;

  const companyId = await activeCompanyCookie();
  return companyId ? { userId, companyId } : null;
});

/**
 * Run a page's own read *while* the session is still resolving, rather than
 * after it.
 *
 * These were two sequential round trips — one to learn the role, then one to
 * fetch the data — even though the second never depended on the answer to the
 * first. Now they overlap on separate pooled connections and the page waits
 * for the slower of the two instead of their sum.
 */
export async function sessionWithData<T>(
  read: (scope: TenantScope) => Promise<T>,
): Promise<{ session: Session; data: T }> {
  const hint = await tenantHint();

  // First visit, or no company chosen yet: nothing to be optimistic with.
  if (!hint) {
    const session = await requireSession();
    return { session, data: await read(session) };
  }

  const [session, data] = await Promise.all([requireSession(), read(hint)]);

  // The cookie named a company they are no longer a member of, so
  // sessionContext fell back to a different one and the rows we fetched are for
  // the wrong company (in practice: none). Pay for the correct read.
  if (session.companyId !== hint.companyId) {
    return { session, data: await read(session) };
  }

  return { session, data };
}
