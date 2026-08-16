import { Suspense } from "react";
import { can } from "@hishabai/core";
import { BottomNav, Sidebar, SidebarFrame } from "@/components/shell/sidebar";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { Topbar, TopbarFrame } from "@/components/shell/topbar";
import { sessionContext } from "@/lib/session";
import { switchCompanyAction } from "@/app/onboarding/actions";
import { signOut } from "@/app/(auth)/actions";

/**
 * The shell does not block the page.
 *
 * This layout used to `await` the session before rendering anything, which
 * meant the page underneath could not even *start* its own query until the
 * membership lookup came back — two round trips end to end, one after the
 * other, for two things that never depended on each other. Suspending the
 * session-dependent parts instead lets React render the page in parallel with
 * them, so the wait is the slower of the two rather than their sum.
 *
 * Both halves call the same memoised `sessionContext()`, so this costs one
 * lookup, not two, whichever gets there first.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background">
      <Suspense fallback={<SidebarFrame />}>
        <SidebarSlot />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopbarFrame />}>
          <TopbarSlot />
        </Suspense>

        {/* Bottom padding clears the mobile nav bar. */}
        <main className="min-w-0 flex-1 px-3 py-4 pb-24 md:px-6 md:py-6 md:pb-6">
          {children}
        </main>
      </div>

      <Suspense fallback={null}>
        <BottomNavSlot />
      </Suspense>
    </div>
  );
}

/**
 * Navigation is filtered by role rather than rendered-then-disabled: an
 * operator should not have to discover what they cannot do. Only the hrefs
 * cross to the client — the items carry icon components, which do not
 * serialise.
 */
async function allowedHrefs(): Promise<string[]> {
  const { session } = await sessionContext();
  return NAV_ITEMS.filter(
    (item) => !item.permission || can(session, item.permission),
  ).map((item) => item.href as string);
}

async function SidebarSlot() {
  return <Sidebar allowed={await allowedHrefs()} />;
}

async function BottomNavSlot() {
  return <BottomNav allowed={await allowedHrefs()} />;
}

async function TopbarSlot() {
  const { session, companies, fullName } = await sessionContext();

  return (
    <Topbar
      companies={companies}
      activeCompanyId={session.companyId}
      userName={fullName ?? "ব্যবহারকারী"}
      onSwitch={switchCompanyAction}
      onSignOut={signOut}
    />
  );
}
