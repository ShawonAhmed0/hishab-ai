"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet } from "lucide-react";
import { NAV_GROUPS, NAV_ITEMS, type NavGroup } from "./nav-items";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The server decides *which* destinations a role may see and sends just their
 * hrefs. It cannot send the items themselves: each carries a Lucide component,
 * and React has nothing to serialise a function into.
 */
function allowedItems(allowed: string[]) {
  const set = new Set(allowed);
  return NAV_ITEMS.filter((item) => set.has(item.href));
}

/**
 * Desktop navigation.
 *
 * Nine destinations is a lot, so the list is not collapsed behind a menu:
 * hiding frequent destinations behind a click is the overloaded-nav
 * anti-pattern, and this is a tool people use all day. They are grouped
 * instead, by how often a shop opens them, which is the thing that actually
 * separates the dashboard from Settings.
 */
export function Sidebar({ allowed }: { allowed: string[] }) {
  const t = useT();
  const pathname = usePathname();
  const items = allowedItems(allowed);

  return (
    <nav
      aria-label={t.shell.mainMenu}
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex"
    >
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 border-b border-border px-4 py-4"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
          <Wallet className="size-4" aria-hidden />
        </span>
        <span className="font-bold tracking-tight">HishabAI</span>
      </Link>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-2 pt-3">
        {NAV_GROUPS.map((group) => {
          const inGroup = items.filter((item) => item.group === group);
          // A role that cannot reach anything in a group gets no heading for
          // it. An operator does not need to be told there is an
          // administration section they may not open.
          if (inGroup.length === 0) return null;

          return (
            <section key={group} aria-labelledby={`nav-${group}`}>
              <h2
                id={`nav-${group}`}
                className="px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-wide text-subtle-foreground uppercase"
              >
                {t.navGroup[group as NavGroup]}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {inGroup.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                          active
                            ? "bg-primary-soft text-primary"
                            : "text-muted-foreground hover:bg-surface-sunken hover:text-foreground",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        {t.nav[item.label]}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Phone navigation. Capped at five, per the bottom-nav limit — beyond that
 * the targets get too narrow to hit reliably.
 */
export function BottomNav({ allowed }: { allowed: string[] }) {
  const t = useT();
  const pathname = usePathname();
  const shown = allowedItems(allowed)
    .filter((item) => item.mobile)
    .slice(0, 5);

  return (
    <nav
      aria-label={t.shell.mainMenu}
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}
    >
      {shown.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 44px minimum target height, with room for the label.
              "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs transition-colors duration-150",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" aria-hidden />
            <span className="truncate">{t.nav[item.label]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * What stands in the sidebar's place while the role is still being read.
 *
 * Same width, same border, same brand block, so the page beside it is laid out
 * at its final position from the first paint and nothing jumps when the real
 * navigation arrives. Only the items — the part that depends on the role — are
 * left blank.
 */
export function SidebarFrame() {
  return (
    <div
      aria-hidden
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
          <Wallet className="size-4" aria-hidden />
        </span>
        <span className="font-bold tracking-tight">HishabAI</span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2" aria-busy="true">
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} className="h-10 rounded-md bg-surface-sunken/60" />
        ))}
      </div>
    </div>
  );
}

export { NAV_ITEMS };
