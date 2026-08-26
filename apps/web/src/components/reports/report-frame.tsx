import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { currentMonth, type ReportPeriod } from "@hishabai/core";
import { todayIso } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { FilterField, FilterInput } from "@/components/ui/filter-bar";
import { PrintButton } from "@/components/ui/print-button";
import { dict } from "@/lib/locale.server";
import { formatDate } from "@/lib/utils";

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

/**
 * The chrome every report shares: where it sits, what it covers, and how to get
 * it onto paper. Printing is the deliverable here — a বকেয়া report exists to be
 * carried to the customer — so the filters carry `.no-print` and the period is
 * restated in a line that only appears on the page.
 */
export async function ReportFrame({
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
  const t = await dict();

  return (
    <div className="space-y-5">
      <div className="no-print">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t.nav.reports}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground no-print">{description}</p>
          <p className="hidden text-sm text-muted-foreground print:block">
            {asOf
              ? t.reports.asOfLine(formatDate(period.to, t))
              : t.reports.rangeLine(formatDate(period.from, t), formatDate(period.to, t))}
          </p>
        </div>
        <PrintButton label={t.actions.print} />
      </div>

      {/* A toolbar, not a panel. This form governs every card below it, so
          unlike a list page's filter strip it cannot live inside one of them —
          but it should not spend an elevation step to say so either. A sunken
          band under the title reads as the page's own controls. */}
      <form className="no-print flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {asOf ? null : (
            <FilterField label={t.reports.fromDate}>
              <FilterInput type="date" name="from" defaultValue={period.from} />
            </FilterField>
          )}
          <FilterField label={asOf ? t.reports.asOfDate : t.reports.toDate}>
            <FilterInput type="date" name="to" defaultValue={period.to} />
          </FilterField>
          {filters}
        </div>
        <div>
          <Button type="submit" size="sm">
            {t.actions.filter}
          </Button>
        </div>
      </form>

      {children}

      <p className="hidden text-xs text-muted-foreground print:block">
        {t.reports.generatedLine(formatDate(todayIso(), t))}
      </p>
    </div>
  );
}
