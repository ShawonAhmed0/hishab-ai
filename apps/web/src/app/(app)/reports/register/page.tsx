import Link from "next/link";
import { ClipboardList, Package, Receipt, Wallet } from "lucide-react";
import { getRegister } from "@hishabai/core";
import { deriveRate, formatQty, qtyFromDb } from "@hishabai/shared";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TFoot, TH, THead, TR, TableScroll, TotalRow } from "@/components/ui/table";
import { ReportFrame, periodFrom } from "@/components/reports/report-frame";
import { FilterField } from "@/components/ui/filter-bar";
import { FilterSelect } from "@/components/ui/filter-select";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await dict()).reports.register };
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string }>;
}) {
  const params = await searchParams;
  const type = params.type === "purchase" ? "purchase" : "sale";
  const period = periodFrom(params);

  const [{ data }, t] = await Promise.all([
    sessionWithData((scope) => getRegister(scope, { ...period, type })),
    dict(),
  ]);

  const isSale = type === "sale";
  const title = isSale ? t.reports.salesRegister : t.reports.purchaseRegister;
  const partyLabel = isSale ? t.fields.customer : t.fields.vendor;
  const dueLabel = isSale ? t.fields.dueAmount : t.accountSubtype.payable;

  return (
    <ReportFrame
      title={title}
      description={
        isSale ? t.reports.registerDescriptionSale : t.reports.registerDescriptionPurchase
      }
      period={period}
      filters={
        <FilterField label={t.fields.type}>
          <FilterSelect name="type" defaultValue={type}>
            <option value="sale">{t.transactionType.sale}</option>
            <option value="purchase">{t.transactionType.purchase}</option>
          </FilterSelect>
        </FilterField>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={isSale ? t.reports.totalSales : t.reports.totalPurchases}
          value={data.totals.total}
          tone={isSale ? "credit" : "debit"}
          icon={ClipboardList}
        />
        <StatTile
          label={t.reports.cashMoved}
          value={data.totals.paid}
          icon={Receipt}
          footnote={t.reports.cashMovedHint}
        />
        <StatTile
          label={dueLabel}
          value={data.totals.due}
          tone={data.totals.due > 0n ? "due" : "neutral"}
          icon={Wallet}
        />
        <CountTile
          label={t.reports.entryCountLabel}
          value={data.totals.count}
          suffix={t.reports.countSuffix}
          icon={Package}
        />
      </div>

      {data.totals.count === 0 ? (
        <Card>
          <EmptyState
            title={isSale ? t.reports.noSales : t.reports.noPurchases}
            hint={t.reports.tryAnotherRange}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t.reports.byParty(partyLabel)}</CardTitle>
            </CardHeader>

            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{partyLabel}</TH>
                    <TH numeric>{t.reports.entry}</TH>
                    <TH numeric>{t.reports.totalColumn}</TH>
                    <TH numeric>{t.reports.paidColumn}</TH>
                    <TH numeric>{dueLabel}</TH>
                  </TR>
                </THead>
                <tbody>
                  {data.byParty.map((row) => (
                    <TR key={row.partyId ?? "cash"}>
                      <TD>
                        {row.partyId ? (
                          <Link
                            href={`/${isSale ? "customers" : "vendors"}/${row.partyId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{row.name}</span>
                        )}
                      </TD>
                      <TD numeric className="num text-muted-foreground">
                        {row.count}
                      </TD>
                      <TD numeric>
                        <MoneyText value={row.total} size="sm" symbol={false} />
                      </TD>
                      <TD numeric>
                        <MoneyText value={row.paid} size="sm" symbol={false} tone="credit" />
                      </TD>
                      <TD numeric>
                        <MoneyText
                          value={row.due}
                          size="sm"
                          symbol={false}
                          tone={row.due > 0n ? "due" : "neutral"}
                        />
                      </TD>
                    </TR>
                  ))}
                </tbody>
                <TFoot>
                  <TotalRow>
                    <TD className="font-semibold">{t.reports.grandTotalRow}</TD>
                    <TD numeric className="num font-semibold">
                      {data.totals.count}
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.total}
                        size="sm"
                        symbol={false}
                        className="font-bold"
                      />
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.paid}
                        size="sm"
                        symbol={false}
                        tone="credit"
                        className="font-bold"
                      />
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.due}
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
              {data.byParty.map((row) => (
                <MobileRow
                  key={row.partyId ?? "cash"}
                  {...(row.partyId
                    ? { href: `/${isSale ? "customers" : "vendors"}/${row.partyId}` as const }
                    : {})}
                  title={row.name}
                  subtitle={t.reports.entriesCount(String(row.count))}
                  right={
                    <>
                      <MoneyText value={row.total} size="sm" />
                      {row.due > 0n ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {dueLabel} <MoneyText value={row.due} size="sm" symbol={false} tone="due" />
                        </p>
                      ) : null}
                    </>
                  }
                />
              ))}
            </MobileCards>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.reports.byProduct}</CardTitle>
            </CardHeader>

            {data.byProduct.length === 0 ? (
              <EmptyState
                title={t.reports.noProductsInvolved}
                hint={t.reports.noProductsInvolvedHint}
              />
            ) : (
              <>
                <div className="hidden md:block">
                  <TableScroll>
                    <THead>
                      <TR>
                        <TH>{t.fields.product}</TH>
                        <TH numeric>{t.fields.quantity}</TH>
                        <TH numeric>{t.reports.lineValueColumn}</TH>
                        <TH numeric>{t.reports.avgRateColumn}</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {data.byProduct.map((row) => {
                        const quantity = qtyFromDb(row.quantity);
                        return (
                          <TR key={row.productId}>
                            <TD>
                              <Link
                                href={`/inventory/${row.productId}`}
                                className="font-medium text-primary hover:underline"
                              >
                                {row.name}
                              </Link>
                            </TD>
                            <TD numeric className="num">
                              {formatQty(quantity)} {row.unitSymbol}
                            </TD>
                            <TD numeric>
                              <MoneyText value={row.amount} size="sm" symbol={false} />
                            </TD>
                            <TD numeric>
                              {/* Derived rather than stored: the same product can go
                                  out at different prices within one period, and
                                  deriveRate keeps the two scales straight. */}
                              {quantity > 0n ? (
                                <MoneyText
                                  value={deriveRate(row.amount, quantity)}
                                  size="sm"
                                  symbol={false}
                                  tone="neutral"
                                />
                              ) : (
                                <span className="text-subtle-foreground">—</span>
                              )}
                            </TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </TableScroll>
                </div>

                <MobileCards>
                  {data.byProduct.map((row) => (
                    <MobileRow
                      key={row.productId}
                      href={`/inventory/${row.productId}`}
                      title={row.name}
                      subtitle={`${formatQty(qtyFromDb(row.quantity))} ${row.unitSymbol}`}
                      right={<MoneyText value={row.amount} size="sm" />}
                    />
                  ))}
                </MobileCards>
              </>
            )}
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
