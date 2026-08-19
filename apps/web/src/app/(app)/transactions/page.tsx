import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { listTransactions } from "@hishabai/core";
import { TRANSACTION_TYPES, moneyFromDb, type TransactionType } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).nav.transactions };
}

const TYPE_TONE: Record<string, "credit" | "debit" | "info" | "neutral"> = {
  sale: "credit",
  income: "credit",
  customer_payment: "credit",
  purchase: "debit",
  expense: "debit",
  vendor_payment: "debit",
};

interface SearchParams {
  type?: string;
  from?: string;
  to?: string;
  q?: string;
  cancelled?: string;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const type = TRANSACTION_TYPES.includes(params.type as TransactionType)
    ? (params.type as TransactionType)
    : undefined;

  const [{ data: rows }, t] = await Promise.all([
    sessionWithData((scope) =>
      listTransactions(scope, {
      ...(type ? { type } : {}),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
      ...(params.q ? { search: params.q } : {}),
        includeCancelled: params.cancelled === "1",
      }),
    ),
    dict(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.transactions}</h1>
        <Button asChild>
          <Link href="/entry">{t.nav.newEntry}</Link>
        </Button>
      </div>

      {/* Filtering is present on every list — the generated style flags its
          absence as the anti-pattern for a data-dense dashboard. */}
      <Card>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t.actions.search}</span>
              <input
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder={t.transactions.searchPlaceholder}
                className="h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t.fields.type}</span>
              <select
                name="type"
                defaultValue={params.type ?? ""}
                className="h-11 cursor-pointer rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <option value="">{t.transactions.all}</option>
                {TRANSACTION_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {t.transactionType[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t.transactions.start}</span>
              <input
                name="from"
                type="date"
                defaultValue={params.from ?? ""}
                className="h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t.transactions.end}</span>
              <input
                name="to"
                type="date"
                defaultValue={params.to ?? ""}
                className="h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>

            <div className="flex items-end gap-2">
              <Button type="submit" block>
                {t.actions.filter}
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm lg:col-span-5">
              <input
                type="checkbox"
                name="cancelled"
                value="1"
                defaultChecked={params.cancelled === "1"}
                className="size-4 cursor-pointer accent-[var(--color-primary)]"
              />
              {t.transactions.includeCancelled}
            </label>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.transactions.count(String(rows.length))}</CardTitle>
        </CardHeader>

        {rows.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={t.messages.noResults}
            hint={t.emptyStates.noTransactionsHint}
            action={
              <Button asChild size="sm">
                <Link href="/entry">{t.nav.newEntry}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.date}</TH>
                    <TH>{t.fields.voucherNo}</TH>
                    <TH>{t.fields.type}</TH>
                    <TH>{t.fields.party}</TH>
                    <TH>{t.fields.memoNo}</TH>
                    <TH numeric>{t.fields.grandTotal}</TH>
                    <TH numeric>{t.due.payment}</TH>
                    <TH numeric>{t.fields.dueAmount}</TH>
                  </TR>
                </THead>
                <tbody>
                  {rows.map((row) => (
                    <TR key={row.id} className={row.status === "cancelled" ? "opacity-60" : ""}>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateShort(row.date)}
                      </TD>
                      <TD>
                        <Link
                          href={`/transactions/${row.id}`}
                          className="num text-primary hover:underline"
                        >
                          {row.voucherNo}
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={TYPE_TONE[row.type] ?? "neutral"}>
                          {t.transactionType[row.type]}
                        </Badge>
                        {row.status === "cancelled" ? (
                          <Badge tone="neutral" className="ml-1">
                            {t.transactionStatus.cancelled}
                          </Badge>
                        ) : null}
                      </TD>
                      <TD className="max-w-[14rem] truncate">{row.partyName ?? "—"}</TD>
                      <TD className="num text-muted-foreground">{row.memoNo ?? "—"}</TD>
                      <TD numeric>
                        <MoneyText value={moneyFromDb(row.total)} size="sm" symbol={false} />
                      </TD>
                      <TD numeric>
                        <MoneyText
                          value={moneyFromDb(row.paidAmount)}
                          size="sm"
                          symbol={false}
                          tone="credit"
                        />
                      </TD>
                      <TD numeric>
                        <MoneyText
                          value={moneyFromDb(row.dueAmount)}
                          size="sm"
                          symbol={false}
                          tone={moneyFromDb(row.dueAmount) > 0n ? "due" : "neutral"}
                        />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableScroll>
            </div>

            <MobileCards>
              {rows.map((row) => (
                <MobileRow
                  key={row.id}
                  title={row.partyName ?? t.transactionType[row.type]}
                  subtitle={`${row.voucherNo} · ${formatDateShort(row.date)}`}
                  meta={
                    <>
                      <Badge tone={TYPE_TONE[row.type] ?? "neutral"}>
                        {t.transactionType[row.type]}
                      </Badge>
                      {row.status === "cancelled" ? (
                        <Badge tone="neutral">{t.transactionStatus.cancelled}</Badge>
                      ) : null}
                    </>
                  }
                  right={
                    <>
                      <MoneyText value={moneyFromDb(row.total)} size="sm" />
                      {moneyFromDb(row.dueAmount) > 0n ? (
                        <p className="mt-0.5 text-xs text-due">
                          {t.fields.dueAmount}{" "}
                          <MoneyText
                            value={moneyFromDb(row.dueAmount)}
                            size="sm"
                            tone="due"
                            symbol={false}
                          />
                        </p>
                      ) : null}
                    </>
                  }
                />
              ))}
            </MobileCards>
          </>
        )}
      </Card>
    </div>
  );
}
