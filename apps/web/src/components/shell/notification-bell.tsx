"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, Bell, Check, Info, TriangleAlert } from "lucide-react";
import type { Alert, NotificationRow } from "@hishabai/core";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

const SEVERITY_ICON = {
  info: Info,
  warning: TriangleAlert,
  critical: AlertTriangle,
} as const;

const SEVERITY_CLASS = {
  info: "text-info",
  warning: "text-due",
  critical: "text-debit",
} as const;

export function NotificationBell({
  alerts,
  notifications,
  badgeCount,
  onMarkAllRead,
}: {
  alerts: Alert[];
  notifications: NotificationRow[];
  badgeCount: number;
  onMarkAllRead: () => Promise<void>;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  const unread = notifications.filter((row) => !row.isRead);
  const empty = alerts.length === 0 && notifications.length === 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            badgeCount > 0
              ? t.shell.notificationsWithCount(String(badgeCount))
              : t.nav.notifications
          }
        >
          <Bell className="size-5" aria-hidden />
          {badgeCount > 0 ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-semibold leading-4 text-on-destructive"
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-overlay"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t.nav.notifications}
            </p>
            {unread.length > 0 ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await onMarkAllRead();
                    router.refresh();
                  })
                }
                className="flex items-center gap-1 text-xs text-primary-ink hover:underline disabled:opacity-50"
              >
                <Check className="size-3.5" aria-hidden />
                {t.shell.markAllRead}
              </button>
            ) : null}
          </div>

          {empty ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t.shell.noNotifications}
            </p>
          ) : null}

          {/* Alerts first: they describe how things stand right now, which is
              more urgent than what happened on some voucher last week. */}
          {alerts.map((alert, index) => {
            const Icon = SEVERITY_ICON[alert.severity];
            return (
              <Link
                key={`${alert.kind}-${index}`}
                href={alert.href as never}
                onClick={() => setOpen(false)}
                className="flex gap-2 rounded-md px-2 py-2.5 text-sm hover:bg-surface-sunken"
              >
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", SEVERITY_CLASS[alert.severity])}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-medium">{alert.titleBn}</span>
                  <span className="block text-xs text-muted-foreground">{alert.bodyBn}</span>
                </span>
              </Link>
            );
          })}

          {alerts.length > 0 && notifications.length > 0 ? (
            <div className="my-1 h-px bg-border" />
          ) : null}

          {notifications.map((row) => {
            const Icon = SEVERITY_ICON[row.severity];
            const body = (
              <>
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", SEVERITY_CLASS[row.severity])}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-medium">{row.titleBn}</span>
                  {row.bodyBn ? (
                    <span className="block text-xs text-muted-foreground">{row.bodyBn}</span>
                  ) : null}
                </span>
              </>
            );

            const className = cn(
              "flex gap-2 rounded-md px-2 py-2.5 text-sm",
              row.isRead ? "opacity-60" : "bg-surface",
            );

            return row.entityType === "transaction" && row.entityId ? (
              <Link
                key={row.id}
                href={`/transactions/${row.entityId}` as never}
                onClick={() => setOpen(false)}
                className={cn(className, "hover:bg-surface-sunken")}
              >
                {body}
              </Link>
            ) : (
              <div key={row.id} className={className}>
                {body}
              </div>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
