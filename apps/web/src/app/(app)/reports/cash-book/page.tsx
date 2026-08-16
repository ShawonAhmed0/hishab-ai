import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote, Wallet } from "lucide-react";
import { getCashBook } from "@hishabai/core";
import { bn, type FinancialAccountKind } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { ReportFrame, periodFrom, reportInputClass } from "@/components/reports/report-frame";
import { sessionWithData } from "@/lib/session";
import { formatDateBn, formatDateShort } from "@/lib/utils";

export const metadata = { title: "ক্যাশ বই" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; wallet?: string }>;
}) {
  const params = await searchParams;
  const period = periodFrom(params);
  const wallet = params.wallet && UUID.test(params.wallet) ? params.wallet : undefined;

  const { data } = await sessionWithData((scope) =>
    getCashBook(scope, { ...period, ...(wallet ? { financialAccountId: wallet } : {}) }),
  );

  return (
    <ReportFrame
      title="ক্যাশ বই"
      description="নগদ, ব্যাংক ও মোবাইল ব্যাংকিং-এ প্রতিটি টাকা কোথা থেকে এলো, কোথায় গেল"
      period={period}
      filters={
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{bn.fields.paymentMethod}</span>
          <select
            name="wallet"
            defaultValue={wallet ?? ""}
            className={`${reportInputClass} cursor-pointer`}
          >
            <option value="">সব মাধ্যম</option>
            {data.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="প্রারম্ভিক ব্যালেন্স"
          value={data.opening}
          icon={Wallet}
          footnote={`${formatDateBn(period.from)} তারিখের আগে পর্যন্ত`}
        />
        <StatTile label="মোট জমা" value={data.totals.received} tone="credit" icon={ArrowDownLeft} />
        <StatTile label="মোট খরচ" value={data.totals.paid} tone="debit" icon={ArrowUpRight} />
        <StatTile
          label="সমাপনী ব্যালেন্স"
          value={data.closing}
          tone="auto"
          icon={Banknote}
          footnote="প্রারম্ভিক + জমা − খরচ"
        />
      </div>

      {/* Each wallet's own running total, which the trigger maintains from the
          very lines listed below — the two have to agree. */}
      {!wallet && data.wallets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>বর্তমান ব্যালেন্স</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-4">
            {data.wallets.map((w) => (
              <span key={w.id} className="flex items-center gap-2 text-sm">
                <Badge tone="neutral">
                  {bn.financialAccountKind[w.kind as FinancialAccountKind]}
                </Badge>
                {w.name}
                <MoneyText value={w.balance} size="sm" tone="auto" className="font-medium" />
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{data.entries.length} টি লেনদেন</CardTitle>
        </CardHeader>

        {data.entries.length === 0 ? (
          <EmptyState
            title="এই সময়ে কোনো জমা-খরচ নেই"
            hint="অন্য তারিখ বা অন্য মাধ্যম বেছে দেখুন"
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{bn.fields.date}</TH>
                    <TH>{bn.fields.voucherNo}</TH>
                    <TH>{bn.fields.paymentMethod}</TH>
                    <TH>{bn.fields.description}</TH>
                    <TH numeric>জমা</TH>
                    <TH numeric>খরচ</TH>
                    <TH numeric>ব্যালেন্স</TH>
                  </TR>
                </THead>
                <tbody>
                  <TR className="bg-surface-sunken">
                    <TD colSpan={6} className="font-medium text-muted-foreground">
                      প্রারম্ভিক ব্যালেন্স
                    </TD>
                    <TD numeric>
                      <MoneyText value={data.opening} size="sm" symbol={false} tone="auto" />
                    </TD>
                  </TR>
                  {data.entries.map((entry) => (
                    <TR key={entry.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateShort(entry.date)}
                      </TD>
                      <TD>
                        {entry.transactionId ? (
                          <Link
                            href={`/transactions/${entry.transactionId}`}
                            className="num text-primary hover:underline"
                          >
                            {entry.voucherNo}
                          </Link>
                        ) : (
                          <span className="num">{entry.voucherNo ?? "—"}</span>
                        )}
                      </TD>
                      <TD className="text-muted-foreground">{entry.accountName}</TD>
                      <TD className="max-w-[16rem] truncate text-muted-foreground">
                        {entry.narration ??
                          (entry.transactionType
                            ? bn.transactionType[entry.transactionType]
                            : "—")}
                      </TD>
                      <TD numeric>
                        {entry.received > 0n ? (
                          <MoneyText value={entry.received} size="sm" symbol={false} tone="credit" />
                        ) : (
                          <span className="text-subtle-foreground">—</span>
                        )}
                      </TD>
                      <TD numeric>
                        {entry.paid > 0n ? (
                          <MoneyText value={entry.paid} size="sm" symbol={false} tone="debit" />
                        ) : (
                          <span className="text-subtle-foreground">—</span>
                        )}
                      </TD>
                      <TD numeric className="font-medium">
                        <MoneyText value={entry.balance} size="sm" symbol={false} tone="auto" />
                      </TD>
                    </TR>
                  ))}
                </tbody>
                <tfoot>
                  <TR className="border-t-2 border-border-strong bg-surface-sunken">
                    <TD colSpan={4} className="font-semibold">
                      সমাপনী ব্যালেন্স
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.received}
                        size="sm"
                        symbol={false}
                        tone="credit"
                        className="font-semibold"
                      />
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.paid}
                        size="sm"
                        symbol={false}
                        tone="debit"
                        className="font-semibold"
                      />
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.closing}
                        size="sm"
                        symbol={false}
                        tone="auto"
                        className="font-bold"
                      />
                    </TD>
                  </TR>
                </tfoot>
              </TableScroll>
            </div>

            <MobileCards>
              {data.entries.map((entry) => {
                const isIn = entry.received > 0n;
                return (
                  <MobileRow
                    key={entry.id}
                    {...(entry.transactionId
                      ? { href: `/transactions/${entry.transactionId}` as const }
                      : {})}
                    title={
                      entry.transactionType
                        ? bn.transactionType[entry.transactionType]
                        : (entry.narration ?? "লেনদেন")
                    }
                    subtitle={`${formatDateShort(entry.date)} · ${entry.accountName}`}
                    right={
                      <>
                        <MoneyText
                          value={isIn ? entry.received : entry.paid}
                          size="sm"
                          tone={isIn ? "credit" : "debit"}
                        />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          ব্যালেন্স{" "}
                          <MoneyText value={entry.balance} size="sm" symbol={false} tone="auto" />
                        </p>
                      </>
                    }
                  />
                );
              })}
            </MobileCards>
          </>
        )}
      </Card>
    </ReportFrame>
  );
}
