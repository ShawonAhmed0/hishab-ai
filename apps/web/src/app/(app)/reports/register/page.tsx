import Link from "next/link";
import { ClipboardList, Package, Receipt, Wallet } from "lucide-react";
import { getRegister } from "@hishabai/core";
import { bn, deriveRate, formatQty, qtyFromDb } from "@hishabai/shared";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { ReportFrame, periodFrom, reportInputClass } from "@/components/reports/report-frame";
import { sessionWithData } from "@/lib/session";

export const metadata = { title: "বিক্রয় ও ক্রয়" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string }>;
}) {
  const params = await searchParams;
  const type = params.type === "purchase" ? "purchase" : "sale";
  const period = periodFrom(params);

  const { data } = await sessionWithData((scope) => getRegister(scope, { ...period, type }));

  const isSale = type === "sale";
  const title = isSale ? "বিক্রয় রিপোর্ট" : "ক্রয় রিপোর্ট";
  const partyLabel = isSale ? bn.fields.customer : bn.fields.vendor;
  const dueLabel = isSale ? bn.fields.dueAmount : "পাওনা";

  return (
    <ReportFrame
      title={title}
      description={`নির্বাচিত সময়ে কার কাছে কত ${isSale ? "বিক্রি" : "কেনা"} হলো, আর কোন পণ্য কত গেল`}
      period={period}
      filters={
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{bn.fields.type}</span>
          <select name="type" defaultValue={type} className={`${reportInputClass} cursor-pointer`}>
            <option value="sale">{bn.transactionType.sale}</option>
            <option value="purchase">{bn.transactionType.purchase}</option>
          </select>
        </label>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={isSale ? "মোট বিক্রয়" : "মোট ক্রয়"}
          value={data.totals.total}
          tone={isSale ? "credit" : "debit"}
          icon={ClipboardList}
        />
        <StatTile
          label="নগদ পাওয়া/দেওয়া"
          value={data.totals.paid}
          icon={Receipt}
          footnote="যত টাকা হাতবদল হয়েছে"
        />
        <StatTile
          label={dueLabel}
          value={data.totals.due}
          tone={data.totals.due > 0n ? "due" : "neutral"}
          icon={Wallet}
        />
        <CountTile
          label="লেনদেন সংখ্যা"
          value={data.totals.count}
          suffix="টি"
          icon={Package}
        />
      </div>

      {data.totals.count === 0 ? (
        <Card>
          <EmptyState
            title={`এই সময়ে কোনো ${isSale ? "বিক্রয়" : "ক্রয়"} নেই`}
            hint="অন্য তারিখ বেছে দেখুন"
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{partyLabel} অনুযায়ী</CardTitle>
            </CardHeader>

            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{partyLabel}</TH>
                    <TH numeric>লেনদেন</TH>
                    <TH numeric>মোট</TH>
                    <TH numeric>পরিশোধ</TH>
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
                <tfoot>
                  <TR className="border-t-2 border-border-strong bg-surface-sunken">
                    <TD className="font-semibold">সর্বমোট</TD>
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
                  </TR>
                </tfoot>
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
                  subtitle={`${row.count} টি লেনদেন`}
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
              <CardTitle>পণ্য অনুযায়ী</CardTitle>
            </CardHeader>

            {data.byProduct.length === 0 ? (
              <EmptyState
                title="কোনো পণ্য যুক্ত ছিল না"
                hint="এই সময়ের লেনদেনগুলো পণ্যবিহীন ছিল"
              />
            ) : (
              <>
                <div className="hidden md:block">
                  <TableScroll>
                    <THead>
                      <TR>
                        <TH>{bn.fields.product}</TH>
                        <TH numeric>{bn.fields.quantity}</TH>
                        <TH numeric>মোট মূল্য</TH>
                        <TH numeric>গড় দর</TH>
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
