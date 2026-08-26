import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { listTransactions } from "@hishabai/core";
import { TRANSACTION_TYPES, moneyFromDb, type TransactionType } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { FilterBar, FilterCheck, FilterField, FilterInput } from "@/components/ui/filter-bar";
import { FilterSelect } from "@/components/ui/filter-select";
import { MoneyText } from "@/components/ui/money";
import {
  MobileCards,
  MobileRow,
  RowLink,
  TD,
  TH,
  THead,
  TR,
  TableScroll,
} from "@/components/ui/table";
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

  const filtered = Boolean(
    params.q || params.type || params.from || params.to || params.cancelled,
  );

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

      <Card>
        <CardHeader>
          <CardTitle>{t.transactions.count(String(rows.length))}</CardTitle>
        </CardHeader>

        {/* Filtering is present on every list — the generated style flags its
            absence as the anti-pattern for a data-dense dashboard. It sits
            inside this card rather than in one of its own: the filters and the
            rows they filter are one object. */}
        <FilterBar
          action="/transactions"
          active={filtered}
          submitLabel={t.actions.filter}
          clearLabel={t.actions.clearFilters}
        >
          <FilterField label={t.actions.search}>
            <FilterInput
              name="q"
              type="search"
              defaultValue={params.q ?? ""}
              placeholder={t.transactions.searchPlaceholder}
            />
          </FilterField>

          <FilterField label={t.fields.type}>
            <FilterSelect name="type" defaultValue={params.type ?? ""}>
              <option value="">{t.transactions.all}</option>
              {TRANSACTION_TYPES.map((option) => (
                <option key={option} value={option}>
                  {t.transactionType[option]}
                </option>
              ))}
            </FilterSelect>
          </FilterField>

          <FilterField label={t.transactions.start}>
            <FilterInput name="from" type="date" defaultValue={params.from ?? ""} />
          </FilterField>

          <FilterField label={t.transactions.end}>
            <FilterInput name="to" type="date" defaultValue={params.to ?? ""} />
          </FilterField>

          <FilterCheck
            className="sm:col-span-2 lg:col-span-4"
            name="cancelled"
            value="1"
            defaultChecked={params.cancelled === "1"}
            label={t.transactions.includeCancelled}
          />
        </FilterBar>

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
                    <TR
                      key={row.id}
                      linked
                      className={row.status === "cancelled" ? "opacity-60" : ""}
                    >
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateShort(row.date)}
                      </TD>
                      {/* A voucher number is one token. Left to wrap it broke
                          as "OPEN-" over "000002", which is not a number
                          anybody can read back to a customer. */}
                      <TD className="whitespace-nowrap">
                        <RowLink
                          href={`/transactions/${row.id}`}
                          className="num text-primary-ink"
                        >
                          {row.voucherNo}
                        </RowLink>
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
