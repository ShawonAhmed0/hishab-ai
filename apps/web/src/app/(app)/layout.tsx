import { listCompanies, can } from "@hishabai/core";
import { BottomNav, Sidebar } from "@/components/shell/sidebar";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { Topbar } from "@/components/shell/topbar";
import { requireSession } from "@/lib/session";
import { getAuthUser } from "@/lib/supabase/server";
import { switchCompanyAction } from "@/app/onboarding/actions";
import { signOut } from "@/app/(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [companies, user] = await Promise.all([listCompanies(session.userId), getAuthUser()]);

  // Navigation is filtered by role rather than rendered-then-disabled: an
  // operator should not have to discover what they cannot do. Only the hrefs
  // cross to the client — the items carry icon components, which do not
  // serialise.
  const allowed = NAV_ITEMS.filter(
    (item) => !item.permission || can(session, item.permission),
  ).map((item) => item.href as string);

  const userName =
    (user?.user_metadata?.["full_name"] as string | undefined) ??
    user?.email?.split("@")[0] ??
    "ব্যবহারকারী";

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar allowed={allowed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          companies={companies}
          activeCompanyId={session.companyId}
          userName={userName}
          onSwitch={switchCompanyAction}
          onSignOut={signOut}
        />

        {/* Bottom padding clears the mobile nav bar. */}
        <main className="min-w-0 flex-1 px-3 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
          {children}
        </main>
      </div>

      <BottomNav allowed={allowed} />
    </div>
  );
}
