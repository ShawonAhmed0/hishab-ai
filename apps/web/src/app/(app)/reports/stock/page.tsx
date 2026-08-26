import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Boxes } from "lucide-react";
import { getStockReport } from "@hishabai/core";
import { formatQty, qtyFromDb, subMoney } from "@hishabai/shared";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TFoot, TH, THead, TR, TableScroll, TotalRow } from "@/components/ui/table";
import { ReportFrame, periodFrom } from "@/components/reports/report-frame";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).reports.stock };
}

export default async function StockReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const period = periodFrom(await searchParams);
  const [{ data }, t] = await Promise.all([
    sessionWithData((scope) => getStockReport(scope, period)),
    dict(),
  ]);

  const movement = subMoney(data.totals.closingValue, data.totals.openingValue);

  return (
    <ReportFrame
      title={t.reports.stock}
      description={t.reports.stockDescription}
      period={period}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t.reports.openingStockValue}
          value={data.totals.openingValue}
          icon={ArrowUpRight}
          footnote={t.reports.onDate(formatDate(period.from, t))}
        />
        <StatTile
          label={t.reports.closingStockValue}
          value={data.totals.closingValue}
          icon={Boxes}
          footnote={t.reports.onDate(formatDate(period.to, t))}
        />
        <StatTile
          label={t.reports.stockChange}
          value={movement}
          tone="auto"
          icon={ArrowDownRight}
          footnote={movement >= 0n ? t.reports.stockUp : t.reports.stockDown}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.reports.productCount(String(data.rows.length))}</CardTitle>
          <span className="text-xs text-muted-foreground no-print">
            {t.reports.stockValueNote}
          </span>
        </CardHeader>

        {data.rows.length === 0 ? (
          <EmptyState title={t.emptyStates.noProducts} hint={t.reports.addProductsFirst} />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.product}</TH>
                    <TH numeric>{t.reports.openingColumn}</TH>
                    <TH numeric>{t.reports.inMovementColumn}</TH>
                    <TH numeric>{t.reports.outMovementColumn}</TH>
                    <TH numeric>{t.reports.closingColumn}</TH>
                    <TH numeric>{t.fields.avgCost}</TH>
                    <TH numeric>{t.reports.stockValueColumn}</TH>
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
                <TFoot>
                  <TotalRow>
                    <TD className="font-semibold">{t.reports.grandTotalRow}</TD>
                    <TD colSpan={4} />
                    <TD numeric className="text-xs text-muted-foreground">
                      {t.reports.stockValueColumn}
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.closingValue}
                        size="sm"
                        symbol={false}
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
