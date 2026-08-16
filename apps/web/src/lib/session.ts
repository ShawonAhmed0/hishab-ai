import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, type Session } from "@hishabai/core";
import { getAuthUser } from "./supabase/server";
import { VERIFIED_USER_HEADER } from "@/middleware";

export const ACTIVE_COMPANY_COOKIE = "hishabai_company";

/**
 * The signed-in user's id.
 *
 * The middleware already verified the JWT against the auth service on this
 * request and passed the id down as a header, so the page does not repeat that
 * network round trip. It strips any inbound copy of the header first, so this
 * cannot be forged from the browser. `getAuthUser()` remains the fallback for
 * any route the middleware matcher does not cover.
 */
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

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

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
