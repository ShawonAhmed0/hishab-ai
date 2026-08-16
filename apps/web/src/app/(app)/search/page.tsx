import Link from "next/link";
import { ArrowLeftRight, Boxes, SearchX, Users } from "lucide-react";
import { search } from "@hishabai/core";
import { bn, formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { MobileCards, MobileRow } from "@/components/ui/table";
import { requireSession } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

export const metadata = { title: bn.actions.search };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const session = await requireSession();
  const results = await search(session, q);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{bn.actions.search}</h1>
        <p className="text-sm text-muted-foreground">
          কাস্টমার, ভেন্ডর, পণ্য, ভাউচার ও মেমো — এক জায়গায়
        </p>
      </div>

      {/* The topbar box is hidden on phones, so the page carries its own. */}
      <Card>
        <CardBody>
          <form className="flex flex-wrap gap-3">
            <input
              name="q"
              type="search"
              defaultValue={results.query}
              autoFocus={!results.query}
              placeholder="নাম, নম্বর, ভাউচার বা অঙ্ক"
              className="h-11 min-w-[14rem] flex-1 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
            <button
              type="submit"
              className="h-11 rounded-md bg-primary px-5 font-medium text-on-primary"
            >
              {bn.actions.search}
            </button>
          </form>
        </CardBody>
      </Card>

      {!results.query ? (
        <Card>
          <EmptyState
            title="কী খুঁজছেন?"
            hint="কাস্টমারের নাম, মোবাইল নম্বর, পণ্যের নাম, ভাউচার নম্বর বা টাকার অঙ্ক লিখুন"
          />
        </Card>
      ) : results.total === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={`"${results.query}" খুঁজে পাওয়া যায়নি`}
            hint="বানান দেখে নিন, অথবা অন্য শব্দ দিয়ে চেষ্টা করুন"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="num">{results.total}</span> টি ফলাফল
          </p>

          {results.parties.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <span className="inline-flex items-center gap-2">
                    <Users className="size-4 text-primary" aria-hidden />
                    কাস্টমার ও ভেন্ডর
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
                      subtitle={party.phone ?? "মোবাইল নম্বর নেই"}
                      meta={<Badge tone="neutral">{bn.partyType[party.type]}</Badge>}
                      right={
                        due > 0n || payable > 0n ? (
                          <>
                            <MoneyText value={due > 0n ? due : payable} size="sm" tone="due" />
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {due > 0n ? "বকেয়া" : "পাওনা"}
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
                    <Boxes className="size-4 text-primary" aria-hidden />
                    {bn.nav.inventory}
                  </span>
                </CardTitle>
              </CardHeader>
              <MobileCards className="md:flex">
                {results.products.map((product) => (
                  <MobileRow
                    key={product.id}
                    href={`/inventory/${product.id}`}
                    title={product.nameBn}
                    subtitle={`স্টক ${formatQty(qtyFromDb(product.quantity))} ${product.unitSymbol}`}
                    right={
                      <>
                        <MoneyText value={moneyFromDb(product.salePrice)} size="sm" />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {bn.fields.salePrice}
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
                    <ArrowLeftRight className="size-4 text-primary" aria-hidden />
                    {bn.nav.transactions}
                  </span>
                </CardTitle>
                <Link href="/transactions" className="text-sm text-primary hover:underline">
                  {bn.actions.viewAll}
                </Link>
              </CardHeader>
              <MobileCards className="md:flex">
                {results.transactions.map((transaction) => (
                  <MobileRow
                    key={transaction.id}
                    href={`/transactions/${transaction.id}`}
                    title={`${bn.transactionType[transaction.type]} · ${transaction.voucherNo}`}
                    subtitle={[
                      formatDateShort(transaction.date),
                      transaction.partyName,
                      transaction.memoNo ? `মেমো ${transaction.memoNo}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    meta={
                      transaction.status === "cancelled" ? (
                        <Badge tone="neutral">{bn.transactionStatus.cancelled}</Badge>
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
