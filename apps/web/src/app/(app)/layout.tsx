import { Suspense } from "react";
import { can, getNotifications } from "@hishabai/core";
import { BottomNav, Sidebar, SidebarFrame } from "@/components/shell/sidebar";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { NotificationBell } from "@/components/shell/notification-bell";
import { Topbar, TopbarFrame } from "@/components/shell/topbar";
import { dict } from "@/lib/locale.server";
import { sessionContext } from "@/lib/session";
import { switchCompanyAction } from "@/app/onboarding/actions";
import { signOut } from "@/app/(auth)/actions";
import { markAllNotificationsReadAction } from "./notification-actions";
import { Shortcuts } from "@/components/shell/shortcuts";

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
    <div className="app-shell flex min-h-dvh bg-background">
      <Suspense fallback={null}>
        <SkipLink />
      </Suspense>
      <Suspense fallback={<SidebarFrame />}>
        <SidebarSlot />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopbarFrame />}>
          <TopbarSlot />
        </Suspense>

        {/* Bottom padding clears the floating mobile nav bar. The canvas is
            deliberately constrained: financial tables can scroll inside
            their cards, while the reading line never stretches indefinitely
            across an ultrawide display. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="app-main min-w-0 flex-1 px-3 py-5 pb-28 outline-none sm:px-5 lg:px-7 lg:py-7 lg:pb-8"
        >
          <div className="relative mx-auto w-full max-w-[100rem]">{children}</div>
        </main>
      </div>

      <Shortcuts />

      <Suspense fallback={null}>
        <BottomNavSlot />
      </Suspense>
    </div>
  );
}

async function SkipLink() {
  const t = await dict();

  return (
    <a
      href="#main-content"
      className="fixed left-3 top-3 z-50 -translate-y-20 rounded-lg bg-primary px-4 py-2 font-medium text-on-primary shadow-overlay transition-transform focus:translate-y-0"
    >
      {t.shell.skipToContent}
    </a>
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
  const [{ session, companies, fullName }, t] = await Promise.all([sessionContext(), dict()]);

  // The alerts are a second read, but they are the shell's own and already
  // behind the same Suspense boundary — the page below is not waiting on them.
  const alerts = await getNotifications(session);

  return (
    <Topbar
      companies={companies}
      activeCompanyId={session.companyId}
      userName={fullName ?? t.shell.user}
      notifications={
        <NotificationBell
          alerts={alerts.alerts}
          notifications={alerts.notifications}
          badgeCount={alerts.badgeCount}
          onMarkAllRead={markAllNotificationsReadAction}
        />
      }
      onSwitch={switchCompanyAction}
      onSignOut={signOut}
    />
  );
}
