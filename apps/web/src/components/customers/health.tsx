import Link from "next/link";
import { AlertTriangle, PhoneCall, TrendingDown, UserMinus, UserX } from "lucide-react";
import type { CustomerHealth, DailyAlerts } from "@hishabai/core";
import type { ActivityStatus, Dictionary } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";

/**
 * The customer traffic light, everywhere it is shown — spec R5.1 and R5.4.
 *
 * A server component that takes the dictionary as a prop rather than calling
 * `useT()`: CLAUDE.md records what happened the last time a shared component
 * reached for the hook without `"use client"` — every server-rendered report
 * 500'd, and only the browser could see it.
 */

const STATUS_TONE: Record<ActivityStatus, "credit" | "due" | "debit"> = {
  normal: "credit",
  doubtful: "due",
  critical: "debit",
};

export function StatusBadge({ status, t }: { status: ActivityStatus; t: Dictionary }) {
  return <Badge tone={STATUS_TONE[status]}>{t.activity.status[status]}</Badge>;
}

/** At most this many names in one alert line; the rest are a count. */
const NAMES_SHOWN = 5;

function nameList(customers: readonly CustomerHealth[], t: Dictionary): string {
  const shown = customers.slice(0, NAMES_SHOWN).map((c) => c.name);
  if (customers.length <= NAMES_SHOWN) return shown.join(", ");
  // "…, and 12 more" would need its own key in both locales for a rounding
  // detail; the count already reads as one.
  return `${shown.join(", ")} + ${t.activity.customerCount(String(customers.length - NAMES_SHOWN))}`;
}

interface AlertLine {
  key: string;
  icon: typeof AlertTriangle;
  tone: "due" | "debit";
  title: string;
  body: string;
}

function linesFrom(alerts: DailyAlerts, t: Dictionary): AlertLine[] {
  const lines: AlertLine[] = [];

  if (alerts.likelyLost.length > 0) {
    lines.push({
      key: "lost",
      icon: UserX,
      tone: "debit",
      title: t.activity.likelyLost,
      body: t.activity.likelyLostBody(nameList(alerts.likelyLost, t)),
    });
  }
  if (alerts.enteredCritical.length > 0) {
    lines.push({
      key: "critical",
      icon: UserMinus,
      tone: "debit",
      title: t.activity.enteredCritical,
      body: nameList(alerts.enteredCritical, t),
    });
  }
  if (alerts.enteredDoubtful.length > 0) {
    lines.push({
      key: "doubtful",
      icon: UserMinus,
      tone: "due",
      title: t.activity.enteredDoubtful,
      body: nameList(alerts.enteredDoubtful, t),
    });
  }
  for (const customer of alerts.agedToday) {
    lines.push({
      key: `aged-${customer.partyId}`,
      icon: AlertTriangle,
      tone: customer.agedIntoToday === "risky" ? "debit" : "due",
      title: t.activity.agedToday,
      body: t.activity.agedTodayBody(customer.name, String(customer.ageing.daysOverdue)),
    });
  }
  if (alerts.volumeDrops.length > 0) {
    lines.push({
      key: "volume",
      icon: TrendingDown,
      tone: "due",
      title: t.activity.volumeDrops,
      body: nameList(alerts.volumeDrops, t),
    });
  }

  return lines;
}

/**
 * R5.4's daily block.
 *
 * Nothing here was written down last night by a scheduled job. Every line is
 * counted from the journal at the moment the page is rendered, which is why it
 * can say "today" without a table to keep in step.
 */
export function DailyAlertBlock({
  alerts,
  t,
  limit,
}: {
  alerts: DailyAlerts;
  t: Dictionary;
  /** The dashboard shows the top few; the health page shows all of them. */
  limit?: number;
}) {
  const lines = linesFrom(alerts, t);
  const shown = limit ? lines.slice(0, limit) : lines;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.activity.dailyTitle}</CardTitle>
        <Link href="/customers/health" className="text-sm text-primary hover:underline">
          {t.actions.viewAll}
        </Link>
      </CardHeader>

      {shown.length === 0 ? (
        <EmptyState title={t.activity.noAlerts} hint={t.activity.allHealthy} />
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((line) => (
            <li key={line.key} className="flex items-start gap-2.5 px-4 py-3 text-sm">
              <line.icon
                className={
                  line.tone === "debit"
                    ? "mt-0.5 size-4 shrink-0 text-debit"
                    : "mt-0.5 size-4 shrink-0 text-due"
                }
                aria-hidden
              />
              <span className="min-w-0">
                <span className="font-medium">{line.title}</span>
                <span className="block text-muted-foreground">{line.body}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * R5.6 — the call list.
 *
 * The reminder is derived, not queued: anybody yellow or red is on it, and
 * they leave it by ordering again rather than by somebody ticking a box. The
 * spec routes delivery through R4.6 (WhatsApp), which is not built, so this is
 * the in-app half — and the phone number is here so the call is one tap.
 */
export function FollowUpList({
  customers,
  t,
}: {
  customers: readonly CustomerHealth[];
  t: Dictionary;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.activity.followUps}</CardTitle>
        <span className="text-xs text-muted-foreground">{t.activity.followUpHint}</span>
      </CardHeader>

      {customers.length === 0 ? (
        <EmptyState title={t.activity.allHealthy} />
      ) : (
        <ul className="divide-y divide-border">
          {customers.map((customer) => (
            <li
              key={customer.partyId}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <PhoneCall className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
                <Link
                  href={`/customers/${customer.partyId}`}
                  className="truncate text-primary hover:underline"
                >
                  {t.activity.followUpLine(customer.name)}
                </Link>
              </span>
              {customer.phone ? (
                <a
                  href={`tel:${customer.phone}`}
                  className="num shrink-0 text-sm text-primary hover:underline"
                >
                  {customer.phone}
                </a>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t.activity.noPhone}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
