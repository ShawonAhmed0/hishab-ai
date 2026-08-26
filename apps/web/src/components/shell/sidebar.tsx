"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BrandMark } from "@/components/brand-mark";
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
      className="no-print relative hidden w-[17rem] shrink-0 flex-col overflow-hidden bg-[#171b3d] text-white shadow-[10px_0_36px_-28px_rgba(19,23,55,0.9)] lg:flex"
    >
      <Link
        href="/dashboard"
        className="flex items-center gap-3 border-b border-white/10 px-5 py-[1.125rem] transition-colors duration-200 hover:bg-white/[0.035]"
      >
        <BrandMark className="size-9 shrink-0" decorative />
        <span className="min-w-0">
          <span className="block font-bold tracking-[-0.025em]">HishabAI</span>
          <span className="block truncate text-[0.6875rem] text-white/60">
            {t.shell.tagline}
          </span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-3 pt-5">
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
                className="px-3 pb-2 text-[0.6875rem] font-semibold tracking-[0.11em] text-white/60 uppercase"
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
                          "group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-sm font-medium transition-[color,background-color,transform] duration-200",
                          active
                            ? "bg-white/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                            : "text-white/58 hover:translate-x-0.5 hover:bg-white/[0.055] hover:text-white",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-accent transition-transform duration-200",
                            active ? "scale-y-100" : "scale-y-0",
                          )}
                          aria-hidden
                        />
                        <item.icon
                          className={cn(
                            "size-[1.125rem] shrink-0 transition-colors duration-200",
                            active ? "text-[#f0bb63]" : "text-white/45 group-hover:text-white/80",
                          )}
                          aria-hidden
                        />
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

      <div className="border-t border-white/10 px-5 py-4">
        <p className="max-w-[22ch] text-xs leading-relaxed text-white/60">
          {t.shell.motto}
        </p>
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
  const items = allowedItems(allowed);
  const mobile = items.filter((item) => item.mobile);
  const secondary = items.filter((item) => !item.mobile);
  // Keep the bottom bar at five targets total. When a role has secondary
  // destinations, the fifth slot becomes More and carries both those routes
  // and the least-frequent mobile destination.
  const shown = mobile.slice(0, secondary.length > 0 ? 4 : 5);
  const overflow = [...mobile.slice(shown.length), ...secondary];
  const overflowActive = overflow.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const columns = shown.length + (overflow.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label={t.shell.mainMenu}
      className="no-print fixed inset-x-3 bottom-3 z-40 grid overflow-hidden rounded-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-overlay backdrop-blur-xl lg:hidden"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
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
              "group flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-medium transition-colors duration-200",
              active ? "text-primary-ink" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-lg transition-colors duration-200",
                active ? "bg-primary-soft" : "group-hover:bg-surface-sunken",
              )}
            >
              <item.icon className="size-[1.125rem]" aria-hidden />
            </span>
            <span className="truncate">{t.nav[item.label]}</span>
          </Link>
        );
      })}

      {overflow.length > 0 ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={t.nav.more}
              className={cn(
                "group flex min-h-[3.75rem] cursor-pointer flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-medium transition-colors duration-200",
                overflowActive ? "text-primary-ink" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg transition-colors duration-200",
                  overflowActive ? "bg-primary-soft" : "group-hover:bg-surface-sunken",
                )}
              >
                <MoreHorizontal className="size-[1.125rem]" aria-hidden />
              </span>
              <span>{t.nav.more}</span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="end"
              sideOffset={10}
              className="z-50 min-w-[13rem] rounded-xl border border-border bg-surface p-1.5 shadow-overlay"
            >
              {overflow.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <DropdownMenu.Item key={item.href} asChild>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-surface-sunken",
                        active ? "font-semibold text-primary-ink" : "text-foreground",
                      )}
                    >
                      <item.icon className="size-4 text-muted-foreground" aria-hidden />
                      {t.nav[item.label]}
                    </Link>
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
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
      className="no-print hidden w-[17rem] shrink-0 flex-col bg-[#171b3d] text-white lg:flex"
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-[1.125rem]">
        <BrandMark className="size-9 shrink-0" decorative />
        <span className="font-bold tracking-[-0.025em]">HishabAI</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 pt-5" aria-busy="true">
        {Array.from({ length: 9 }).map((_, index) => (
          <span key={index} className="h-10 rounded-lg bg-white/[0.045]" />
        ))}
      </div>
    </div>
  );
}

export { NAV_ITEMS };
