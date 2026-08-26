"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, LogOut, Search } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Role } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/shell/locale-toggle";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import { SearchHint } from "./shortcuts";

export interface CompanyOption {
  id: string;
  name: string;
  nameBn: string | null;
  role: Role;
}

export function Topbar({
  companies,
  activeCompanyId,
  userName,
  notifications,
  onSwitch,
  onSignOut,
}: {
  companies: CompanyOption[];
  activeCompanyId: string;
  userName: string;
  /** The bell, already loaded on the server. */
  notifications?: React.ReactNode;
  onSwitch: (companyId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const t = useT();
  const active = companies.find((c) => c.id === activeCompanyId);
  const [switching, setSwitching] = React.useState(false);

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-1.5 border-b border-border/80 bg-background/85 px-2.5 backdrop-blur-xl sm:gap-2 sm:px-4 lg:px-5">
      {/* ---- company switcher ---- */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={switching}
            className="flex min-h-11 min-w-0 max-w-[11rem] cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-200 hover:bg-surface sm:max-w-[17rem] sm:px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-ink">
              <Building2 className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {active?.nameBn || active?.name || t.shell.company}
              </span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">
                {active ? t.role[active.role] : ""}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[16rem] rounded-xl border border-border bg-surface p-1.5 shadow-overlay"
          >
            <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {t.shell.switchCompany}
            </DropdownMenu.Label>

            {companies.map((company) => (
              <DropdownMenu.Item
                key={company.id}
                onSelect={() => {
                  if (company.id === activeCompanyId) return;
                  setSwitching(true);
                  void onSwitch(company.id);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm outline-none",
                  "data-[highlighted]:bg-surface-sunken",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {company.nameBn || company.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t.role[company.role]}
                  </span>
                </span>
                {company.id === activeCompanyId ? (
                  <Check className="size-4 shrink-0 text-primary-ink" aria-hidden />
                ) : null}
              </DropdownMenu.Item>
            ))}

            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild>
              <Link
                href="/onboarding"
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none data-[highlighted]:bg-surface-sunken"
              >
                {t.actions.addNew}
              </Link>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* ---- global search ---- */}
      <form action="/search" className="ml-auto hidden max-w-md flex-1 lg:block">
        <label className="sr-only" htmlFor="global-search">
          {t.actions.search}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <input
            id="global-search"
            name="q"
            type="search"
            placeholder={t.shell.searchPlaceholder}
            className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-16 text-sm shadow-card placeholder:text-subtle-foreground transition-[border-color,box-shadow] duration-200 hover:border-border-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
          <SearchHint />
        </div>
      </form>

      {/* ---- alerts and appearance ---- */}
      <div className="ml-auto flex items-center rounded-xl sm:border sm:border-border sm:bg-surface/80 sm:p-0.5 sm:shadow-card lg:ml-0">
        <Button asChild variant="ghost" size="icon" className="lg:hidden">
          <Link href="/search" aria-label={t.actions.search}>
            <Search className="size-5" aria-hidden />
          </Link>
        </Button>
        <LocaleToggle />
        <span className="hidden sm:contents">
          <ThemeToggle />
        </span>
        {notifications}
      </div>

      {/* ---- account ---- */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={userName}>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold text-primary-ink">
              {userName.slice(0, 1)}
            </span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[12rem] rounded-xl border border-border bg-surface p-1.5 shadow-overlay"
          >
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{userName}</p>
            </div>
            <DropdownMenu.Item
              asChild
              onSelect={(event) => event.preventDefault()}
              className="sm:hidden"
            >
              <ThemeToggle showLabel />
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={() => void onSignOut()}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm text-debit outline-none data-[highlighted]:bg-debit-soft"
            >
              <LogOut className="size-4" aria-hidden />
              {t.actions.logout}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}

/**
 * The topbar's shape while the company list is still loading.
 *
 * The search box is real — it needs no session, and it is the one control
 * someone might reach for immediately. Only the company switcher and the
 * account button, which depend on the membership lookup, are placeholders.
 */
export function TopbarFrame() {
  const t = useT();

  return (
    <header
      aria-busy="true"
      className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/80 bg-background/85 px-2.5 backdrop-blur-xl sm:px-4 lg:px-5"
    >
      <div className="flex max-w-[15rem] items-center gap-2 px-2 py-1.5" aria-hidden>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-ink">
          <Building2 className="size-4" aria-hidden />
        </span>
        <span className="h-4 w-28 rounded bg-surface-sunken" />
      </div>

      <form action="/search" className="ml-auto hidden max-w-md flex-1 lg:block">
        <label className="sr-only" htmlFor="global-search-frame">
          {t.actions.search}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <input
            id="global-search-frame"
            name="q"
            type="search"
            placeholder={t.shell.searchPlaceholder}
            className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm shadow-card placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
        </div>
      </form>

      <span
        className="ml-auto size-9 shrink-0 rounded-lg bg-surface-sunken lg:ml-0"
        aria-hidden
      />
    </header>
  );
}
