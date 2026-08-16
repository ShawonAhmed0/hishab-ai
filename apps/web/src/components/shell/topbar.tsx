"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, LogOut, Search } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { bn, type Role } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  onSwitch,
  onSignOut,
}: {
  companies: CompanyOption[];
  activeCompanyId: string;
  userName: string;
  onSwitch: (companyId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const active = companies.find((c) => c.id === activeCompanyId);
  const [switching, setSwitching] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface px-3 md:px-4">
      {/* ---- company switcher ---- */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            disabled={switching}
            className="flex min-h-11 max-w-[15rem] cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Building2 className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {active?.nameBn || active?.name || "কোম্পানি"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {active ? bn.role[active.role] : ""}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-50 min-w-[16rem] rounded-lg border border-border bg-surface p-1 shadow-overlay"
          >
            <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              কোম্পানি পরিবর্তন করুন
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
                    {bn.role[company.role]}
                  </span>
                </span>
                {company.id === activeCompanyId ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden />
                ) : null}
              </DropdownMenu.Item>
            ))}

            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item asChild>
              <Link
                href="/onboarding"
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm outline-none data-[highlighted]:bg-surface-sunken"
              >
                {bn.actions.addNew}
              </Link>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* ---- global search ---- */}
      <form action="/search" className="ml-auto hidden max-w-sm flex-1 md:block">
        <label className="sr-only" htmlFor="global-search">
          {bn.actions.search}
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
            placeholder="কাস্টমার, পণ্য, মেমো, ভাউচার…"
            className="h-10 w-full rounded-md border border-border-strong bg-surface-sunken pl-9 pr-3 text-sm placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
        </div>
      </form>

      {/* ---- account ---- */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={userName} className="ml-auto md:ml-0">
            <span className="flex size-8 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold">
              {userName.slice(0, 1)}
            </span>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[12rem] rounded-lg border border-border bg-surface p-1 shadow-overlay"
          >
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{userName}</p>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={() => void onSignOut()}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm text-debit outline-none data-[highlighted]:bg-debit-soft"
            >
              <LogOut className="size-4" aria-hidden />
              {bn.actions.logout}
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
  return (
    <header
      aria-busy="true"
      className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface px-3 md:px-4"
    >
      <div className="flex max-w-[15rem] items-center gap-2 px-2 py-1.5" aria-hidden>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <Building2 className="size-4" aria-hidden />
        </span>
        <span className="h-4 w-28 rounded bg-surface-sunken" />
      </div>

      <form action="/search" className="ml-auto hidden max-w-sm flex-1 md:block">
        <label className="sr-only" htmlFor="global-search-frame">
          {bn.actions.search}
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
            placeholder="কাস্টমার, পণ্য, মেমো, ভাউচার…"
            className="h-10 w-full rounded-md border border-border-strong bg-surface-sunken pl-9 pr-3 text-sm placeholder:text-subtle-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
        </div>
      </form>

      <span
        className="ml-auto size-8 shrink-0 rounded-full bg-surface-sunken md:ml-0"
        aria-hidden
      />
    </header>
  );
}
