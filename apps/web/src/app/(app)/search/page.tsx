import Link from "next/link";
import { ArrowLeftRight, Boxes, SearchX, Users } from "lucide-react";
import { search } from "@hishabai/core";
import { formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { FilterInput } from "@/components/ui/filter-bar";
import { MoneyText } from "@/components/ui/money";
import { MobileCards, MobileRow } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { requireSession } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).actions.search };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [session, t] = await Promise.all([requireSession(), dict()]);
  const results = await search(session, q);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.actions.search}</h1>
        <p className="text-sm text-muted-foreground">{t.masterData.searchHint}</p>
      </div>

      {/* The topbar box is hidden on phones, so the page carries its own. */}
      <Card>
        <CardBody>
          <form className="flex flex-wrap gap-3">
            <FilterInput
              name="q"
              type="search"
              defaultValue={results.query}
              autoFocus={!results.query}
              placeholder={t.masterData.searchPlaceholder}
              className="min-w-[14rem] flex-1"
            />
            <Button type="submit">{t.actions.search}</Button>
          </form>
        </CardBody>
      </Card>

      {!results.query ? (
        <Card>
          <EmptyState
            title={t.masterData.searchPrompt}
            hint={t.masterData.searchPromptHint}
          />
        </Card>
      ) : results.total === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={t.masterData.searchMiss(results.query)}
            hint={t.masterData.searchMissHint}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="num">{results.total}</span> {t.masterData.resultsSuffix}
          </p>

          {results.parties.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Users className="size-4 text-primary-ink" aria-hidden />
                    {t.masterData.partiesHeading}
                  </span>
                </CardTitle>
              </CardHeader>
              <MobileCards className="md:flex">
                {results.parties.map((party) => {
                  const due = moneyFromDb(party.receivable);
                  const payable = moneyFromDb(party.payable);
                  return (
                    <MobileRow
                      key={party.id}
                      href={`/${party.type === "vendor" ? "vendors" : "customers"}/${party.id}`}
                      title={party.name}
                      subtitle={party.phone ?? t.masterData.noPhone}
                      meta={<Badge tone="neutral">{t.partyType[party.type]}</Badge>}
                      right={
                        due > 0n || payable > 0n ? (
                          <>
                            <MoneyText value={due > 0n ? due : payable} size="sm" tone="due" />
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {due > 0n ? t.fields.dueAmount : t.masterData.payable}
                            </p>
                          </>
                        ) : null
                      }
                    />
                  );
                })}
              </MobileCards>
            </Card>
          ) : null}

          {results.products.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Boxes className="size-4 text-primary-ink" aria-hidden />
                    {t.nav.inventory}
                  </span>
                </CardTitle>
              </CardHeader>
              <MobileCards className="md:flex">
                {results.products.map((product) => (
                  <MobileRow
                    key={product.id}
                    href={`/inventory/${product.id}`}
                    title={product.nameBn}
                    subtitle={t.masterData.stockIs(
                      `${formatQty(qtyFromDb(product.quantity))} ${product.unitSymbol}`,
                    )}
                    right={
                      <>
                        <MoneyText value={moneyFromDb(product.salePrice)} size="sm" />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.fields.salePrice}
                        </p>
                      </>
                    }
                  />
                ))}
              </MobileCards>
            </Card>
          ) : null}

          {results.transactions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <ArrowLeftRight className="size-4 text-primary-ink" aria-hidden />
                    {t.nav.transactions}
                  </span>
                </CardTitle>
                <Link href="/transactions" className="text-sm text-primary-ink hover:underline">
                  {t.actions.viewAll}
                </Link>
              </CardHeader>
              <MobileCards className="md:flex">
                {results.transactions.map((transaction) => (
                  <MobileRow
                    key={transaction.id}
                    href={`/transactions/${transaction.id}`}
                    title={`${t.transactionType[transaction.type]} · ${transaction.voucherNo}`}
                    subtitle={[
                      formatDateShort(transaction.date),
                      transaction.partyName,
                      transaction.memoNo ? t.masterData.memoIs(transaction.memoNo) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    meta={
                      transaction.status === "cancelled" ? (
                        <Badge tone="neutral">{t.transactionStatus.cancelled}</Badge>
                      ) : null
                    }
                    right={<MoneyText value={moneyFromDb(transaction.total)} size="sm" />}
                  />
                ))}
              </MobileCards>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
