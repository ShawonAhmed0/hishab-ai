import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getMembership, listCompanies, type Session } from "@hishabai/core";
import { getAuthUser } from "./supabase/server";

export const ACTIVE_COMPANY_COOKIE = "hishabai_company";

/**
 * Builds the Session every service call is scoped by.
 *
 * The role comes from `company_members` on every request, not from a cookie or
 * a token claim — so revoking someone's access takes effect on their next
 * click rather than whenever their session happens to expire.
 */
export async function requireSession(): Promise<Session> {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

  if (requested) {
    const membership = await getMembership(user.id, requested);
    if (membership) {
      return { userId: user.id, companyId: requested, role: membership.role };
    }
  }

  // No company chosen, or the chosen one is no longer theirs to see.
  const companies = await listCompanies(user.id);
  const first = companies[0];
  if (!first) redirect("/onboarding");

  return { userId: user.id, companyId: first.id, role: first.role };
}

export async function currentUserOrRedirect() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}
