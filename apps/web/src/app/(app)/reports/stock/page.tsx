import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Boxes } from "lucide-react";
import { getStockReport } from "@hishabai/core";
import { bn, formatQty, qtyFromDb, subMoney } from "@hishabai/shared";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { ReportFrame, periodFrom } from "@/components/reports/report-frame";
import { sessionWithData } from "@/lib/session";
import { formatDateBn } from "@/lib/utils";

export const metadata = { title: "স্টক রিপোর্ট" };

export default async function StockReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const period = periodFrom(await searchParams);
  const { data } = await sessionWithData((scope) => getStockReport(scope, period));

  const movement = subMoney(data.totals.closingValue, data.totals.openingValue);

  return (
    <ReportFrame
      title="স্টক রিপোর্ট"
      description="সময়ের শুরুতে কত ছিল, কত ঢুকল, কত বেরোল, আর শেষে কত রইল"
      period={period}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="প্রারম্ভিক স্টক ভ্যালু"
          value={data.totals.openingValue}
          icon={ArrowUpRight}
          footnote={`${formatDateBn(period.from)} তারিখে`}
        />
        <StatTile
          label="সমাপনী স্টক ভ্যালু"
          value={data.totals.closingValue}
          icon={Boxes}
          footnote={`${formatDateBn(period.to)} তারিখে`}
        />
        <StatTile
          label="পরিবর্তন"
          value={movement}
          tone="auto"
          icon={ArrowDownRight}
          footnote={movement >= 0n ? "স্টক বেড়েছে" : "স্টক কমেছে"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{data.rows.length} টি পণ্য</CardTitle>
          <span className="text-xs text-muted-foreground no-print">
            প্রতিটি মুভমেন্টে জমা থাকা ব্যালেন্স থেকে নেওয়া
          </span>
        </CardHeader>

        {data.rows.length === 0 ? (
          <EmptyState title={bn.emptyStates.noProducts} hint="প্রথমে পণ্য যোগ করুন" />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{bn.fields.product}</TH>
                    <TH numeric>প্রারম্ভিক</TH>
                    <TH numeric>আগমন</TH>
                    <TH numeric>নির্গমন</TH>
                    <TH numeric>সমাপনী</TH>
                    <TH numeric>{bn.fields.avgCost}</TH>
                    <TH numeric>স্টক ভ্যালু</TH>
                  </TR>
                </THead>
                <tbody>
                  {data.rows.map((row) => (
                    <TR key={row.productId}>
                      <TD>
                        <Link
                          href={`/inventory/${row.productId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      </TD>
                      <TD numeric className="num text-muted-foreground">
                        {formatQty(qtyFromDb(row.openingQty))}
                      </TD>
                      <TD numeric className="num text-credit">
                        {row.inQty === "0" ? "—" : `+${formatQty(qtyFromDb(row.inQty))}`}
                      </TD>
                      <TD numeric className="num text-debit">
                        {row.outQty === "0" ? "—" : `−${formatQty(qtyFromDb(row.outQty))}`}
                      </TD>
                      <TD numeric className="num font-medium">
                        {formatQty(qtyFromDb(row.closingQty))} {row.unitSymbol}
                      </TD>
                      <TD numeric>
                        <MoneyText value={row.avgCost} size="sm" symbol={false} />
                      </TD>
                      <TD numeric>
                        <MoneyText value={row.closingValue} size="sm" symbol={false} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
                <tfoot>
                  <TR className="border-t-2 border-border-strong bg-surface-sunken">
                    <TD className="font-semibold">সর্বমোট</TD>
                    <TD colSpan={4} />
                    <TD numeric className="text-xs text-muted-foreground">
                      স্টক ভ্যালু
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.closingValue}
                        size="sm"
                        symbol={false}
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
                  key={row.productId}
                  href={`/inventory/${row.productId}`}
                  title={row.name}
                  subtitle={`${formatQty(qtyFromDb(row.openingQty))} → ${formatQty(
                    qtyFromDb(row.closingQty),
                  )} ${row.unitSymbol}`}
                  right={
                    <>
                      <MoneyText value={row.closingValue} size="sm" />
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        +{formatQty(qtyFromDb(row.inQty))} / −{formatQty(qtyFromDb(row.outQty))}
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
