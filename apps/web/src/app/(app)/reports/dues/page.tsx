import Link from "next/link";
import { AlertTriangle, Hourglass, Users } from "lucide-react";
import { AGING_BUCKETS, getDueAging, type AgingBucket } from "@hishabai/core";
import { addMoney, bn } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { ReportFrame, periodFrom, reportInputClass } from "@/components/reports/report-frame";
import { sessionWithData } from "@/lib/session";
import { formatDateBn } from "@/lib/utils";

export const metadata = { title: "বকেয়া ও পাওনা" };

/** The label under each bucket, in the words a shopkeeper would use. */
const BUCKET_LABEL: Record<AgingBucket, string> = {
  "0-30": "০–৩০ দিন",
  "31-60": "৩১–৬০ দিন",
  "61-90": "৬১–৯০ দিন",
  "90+": "৯০+ দিন",
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

  const { data } = await sessionWithData((scope) =>
    getDueAging(scope, { asOf: period.to, side }),
  );

  const isReceivable = side === "receivable";
  const title = isReceivable ? "কাস্টমার বকেয়া" : "ভেন্ডর পাওনা";
  const overdue = addMoney(data.totals["61-90"], data.totals["90+"]);

  return (
    <ReportFrame
      title={`${title} — বয়স বিশ্লেষণ`}
      description={`${formatDateBn(period.to)} পর্যন্ত কার টাকা কত দিন ধরে আটকে আছে`}
      period={period}
      asOf
      filters={
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">কোন দিক</span>
          <select name="side" defaultValue={side} className={`${reportInputClass} cursor-pointer`}>
            <option value="receivable">কাস্টমার বকেয়া</option>
            <option value="payable">ভেন্ডর পাওনা</option>
          </select>
        </label>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={`মোট ${title}`} value={data.totals.all} tone="due" icon={Hourglass} />
        <CountTile
          label={isReceivable ? "বকেয়া আছে যাদের" : "পাওনা আছে যাদের"}
          value={data.rows.length}
          suffix="জন"
          icon={Users}
        />
        <StatTile
          label="৬০ দিনের বেশি পুরোনো"
          value={overdue}
          tone={overdue > 0n ? "debit" : "neutral"}
          icon={AlertTriangle}
          footnote="এগুলোই আগে তাড়া দেওয়ার মতো"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{data.rows.length} জন</CardTitle>
          <span className="text-xs text-muted-foreground no-print">
            পুরোনো বিল আগে শোধ হয়েছে ধরে হিসাব করা
          </span>
        </CardHeader>

        {data.rows.length === 0 ? (
          <EmptyState
            title={isReceivable ? "কারও কাছে বকেয়া নেই" : "কারও পাওনা নেই"}
            hint="সবাই পরিশোধ করে দিয়েছে"
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{bn.fields.name}</TH>
                    {AGING_BUCKETS.map((bucket) => (
                      <TH key={bucket} numeric>
                        {BUCKET_LABEL[bucket]}
                      </TH>
                    ))}
                    <TH numeric>মোট</TH>
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
                            {row.oldestDays} দিন
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
                <tfoot>
                  <TR className="border-t-2 border-border-strong bg-surface-sunken">
                    <TD className="font-semibold">সর্বমোট</TD>
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
                  </TR>
                </tfoot>
              </TableScroll>
            </div>

            <MobileCards>
              {data.rows.map((row) => (
                <MobileRow
                  key={row.partyId}
                  href={`/${isReceivable ? "customers" : "vendors"}/${row.partyId}`}
                  title={row.name}
                  subtitle={`সবচেয়ে পুরোনো ${row.oldestDays} দিন`}
                  right={
                    <>
                      <MoneyText value={row.total} size="sm" tone="due" />
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.oldestDays > 60 ? "তাড়া দিন" : "স্বাভাবিক"}
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
