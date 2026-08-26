import Link from "next/link";
import { AlertTriangle, Hourglass, Users } from "lucide-react";
import { AGING_BUCKETS, getDueAging, type AgingBucket } from "@hishabai/core";
import { addMoney, type Dictionary, type StringKeys } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TFoot, TH, THead, TR, TableScroll, TotalRow } from "@/components/ui/table";
import { ReportFrame, periodFrom } from "@/components/reports/report-frame";
import { FilterField } from "@/components/ui/filter-bar";
import { FilterSelect } from "@/components/ui/filter-select";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).reports.dues };
}

/** The label under each bucket, in the words a shopkeeper would use. */
const BUCKET_LABEL: Record<AgingBucket, StringKeys<Dictionary["reports"]>> = {
  "0-30": "agingBucket0",
  "31-60": "agingBucket31",
  "61-90": "agingBucket61",
  "90+": "agingBucket90",
};

export default async function DuesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; side?: string }>;
}) {
  const params = await searchParams;
  const side = params.side === "payable" ? "payable" : "receivable";
  // Aging is a snapshot, not a range: it asks "as of today, how old is this".
  // The frame still supplies a range, and the end of it is the as-of date.
  const period = periodFrom(params);

  const [{ data }, t] = await Promise.all([
    sessionWithData((scope) => getDueAging(scope, { asOf: period.to, side })),
    dict(),
  ]);

  const isReceivable = side === "receivable";
  const title = isReceivable ? t.accountSubtype.receivable : t.accountSubtype.payable;
  const overdue = addMoney(data.totals["61-90"], data.totals["90+"]);

  return (
    <ReportFrame
      title={t.reports.agingTitle(title)}
      description={t.reports.agingDescription(formatDate(period.to, t))}
      period={period}
      asOf
      filters={
        <FilterField label={t.reports.whichSide}>
          <FilterSelect name="side" defaultValue={side}>
            <option value="receivable">{t.accountSubtype.receivable}</option>
            <option value="payable">{t.accountSubtype.payable}</option>
          </FilterSelect>
        </FilterField>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t.reports.totalOf(title)}
          value={data.totals.all}
          tone="due"
          icon={Hourglass}
        />
        <CountTile
          label={isReceivable ? t.reports.peopleOwing : t.reports.peopleOwed}
          value={data.rows.length}
          suffix={t.reports.people}
          icon={Users}
        />
        <StatTile
          label={t.reports.olderThan60}
          value={overdue}
          tone={overdue > 0n ? "debit" : "neutral"}
          icon={AlertTriangle}
          footnote={t.reports.chaseTheseFirst}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.reports.personCount(String(data.rows.length))}</CardTitle>
          <span className="text-xs text-muted-foreground no-print">
            {t.reports.fifoNote}
          </span>
        </CardHeader>

        {data.rows.length === 0 ? (
          <EmptyState
            title={isReceivable ? t.reports.noReceivables : t.reports.noPayables}
            hint={t.reports.everyoneSettled}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.name}</TH>
                    {AGING_BUCKETS.map((bucket) => (
                      <TH key={bucket} numeric>
                        {t.reports[BUCKET_LABEL[bucket]]}
                      </TH>
                    ))}
                    <TH numeric>{t.reports.totalColumn}</TH>
                  </TR>
                </THead>
                <tbody>
                  {data.rows.map((row) => (
                    <TR key={row.partyId}>
                      <TD>
                        <Link
                          href={`/${isReceivable ? "customers" : "vendors"}/${row.partyId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.oldestDays > 90 ? (
                          <Badge tone="due" className="ml-2">
                            {t.reports.days(String(row.oldestDays))}
                          </Badge>
                        ) : null}
                      </TD>
                      {AGING_BUCKETS.map((bucket) => (
                        <TD key={bucket} numeric>
                          {row.buckets[bucket] > 0n ? (
                            <MoneyText
                              value={row.buckets[bucket]}
                              size="sm"
                              symbol={false}
                              // Older money is the money at risk, so only the
                              // late columns carry the warning colour.
                              tone={bucket === "0-30" ? "neutral" : "due"}
                            />
                          ) : (
                            <span className="text-subtle-foreground">—</span>
                          )}
                        </TD>
                      ))}
                      <TD numeric className="font-medium">
                        <MoneyText value={row.total} size="sm" symbol={false} tone="due" />
                      </TD>
                    </TR>
                  ))}
                </tbody>
                <TFoot>
                  <TotalRow>
                    <TD className="font-semibold">{t.reports.grandTotalRow}</TD>
                    {AGING_BUCKETS.map((bucket) => (
                      <TD key={bucket} numeric>
                        <MoneyText
                          value={data.totals[bucket]}
                          size="sm"
                          symbol={false}
                          className="font-semibold"
                        />
                      </TD>
                    ))}
                    <TD numeric>
                      <MoneyText
                        value={data.totals.all}
                        size="sm"
                        symbol={false}
                        tone="due"
                        className="font-bold"
                      />
                    </TD>
                  </TotalRow>
                </TFoot>
              </TableScroll>
            </div>

            <MobileCards>
              {data.rows.map((row) => (
                <MobileRow
                  key={row.partyId}
                  href={`/${isReceivable ? "customers" : "vendors"}/${row.partyId}`}
                  title={row.name}
                  subtitle={t.reports.oldestDays(String(row.oldestDays))}
                  right={
                    <>
                      <MoneyText value={row.total} size="sm" tone="due" />
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.oldestDays > 60 ? t.reports.chase : t.reports.normal}
                      </p>
                    </>
                  }
                />
              ))}
            </MobileCards>
          </>
        )}
      </Card>
    </ReportFrame>
  );
}
