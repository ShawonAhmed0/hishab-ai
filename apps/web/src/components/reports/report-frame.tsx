import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { currentMonth, type ReportPeriod } from "@hishabai/core";
import { bn, todayIso } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { formatDateBn } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every report is bounded by a date range, and an unbounded one would scan the
 * company's whole history. A missing or malformed parameter falls back to the
 * current month rather than erroring — a hand-edited URL should still render.
 */
export function periodFrom(params: { from?: string; to?: string }): ReportPeriod {
  const fallback = currentMonth();
  const from = params.from && ISO_DATE.test(params.from) ? params.from : fallback.from;
  const to = params.to && ISO_DATE.test(params.to) ? params.to : fallback.to;
  return from <= to ? { from, to } : fallback;
}

const inputClass =
  "h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

/**
 * The chrome every report shares: where it sits, what it covers, and how to get
 * it onto paper. Printing is the deliverable here — a বকেয়া report exists to be
 * carried to the customer — so the filters carry `.no-print` and the period is
 * restated in a line that only appears on the page.
 */
export function ReportFrame({
  title,
  description,
  period,
  asOf,
  filters,
  children,
}: {
  title: string;
  description: string;
  period: ReportPeriod;
  /** A snapshot report — aging asks "how old is this money today", not "what
   *  happened between two dates". Offering a start date it then ignores is
   *  worse than offering none. */
  asOf?: boolean;
  /** Extra controls that live inside the same GET form as the date range. */
  filters?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="no-print">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {bn.nav.reports}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground no-print">{description}</p>
          <p className="hidden text-sm text-muted-foreground print:block">
            {asOf
              ? `${formatDateBn(period.to)} পর্যন্ত`
              : `${formatDateBn(period.from)} — ${formatDateBn(period.to)}`}
          </p>
        </div>
        <PrintButton label={bn.actions.print} />
      </div>

      <Card className="no-print">
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {asOf ? null : (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">শুরুর তারিখ</span>
                <input type="date" name="from" defaultValue={period.from} className={inputClass} />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{asOf ? "কোন তারিখ পর্যন্ত" : "শেষ তারিখ"}</span>
              <input type="date" name="to" defaultValue={period.to} className={inputClass} />
            </label>
            {filters}
            <div className="flex items-end">
              <Button type="submit" block>
                {bn.actions.filter}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {children}

      <p className="hidden text-xs text-muted-foreground print:block">
        HishabAI থেকে তৈরি — {formatDateBn(todayIso())}
      </p>
    </div>
  );
}

export { inputClass as reportInputClass };
