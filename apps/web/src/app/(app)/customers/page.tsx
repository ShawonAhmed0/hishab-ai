import Link from "next/link";
import { PlusCircle, Users, UserCheck, Wallet } from "lucide-react";
import { getParties } from "@hishabai/core";
import { bn, moneyFromDb } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";
import { AddPartyPanel } from "@/components/master-data/create-forms";

export const metadata = { title: bn.nav.customers };

interface SearchParams {
  q?: string;
  due?: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const dueOnly = params.due === "1";

  const {
    data: { parties, summary },
  } = await sessionWithData((scope) =>
    getParties(scope, {
      type: "customer",
      ...(params.q ? { search: params.q } : {}),
      dueOnly,
    }),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{bn.nav.customers}</h1>
          <p className="text-sm text-muted-foreground">কার কাছে কত বকেয়া, এক নজরে</p>
        </div>
        <Button asChild>
          <Link href="/entry">
            <PlusCircle className="size-4" aria-hidden />
            {bn.nav.newEntry}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={bn.dashboard.customerDue}
          value={moneyFromDb(summary.totalReceivable)}
          tone="due"
          icon={Wallet}
        />
        <CountTile label="কাস্টমার সংখ্যা" value={summary.partyCount} suffix="জন" icon={Users} />
        <CountTile
          label="বকেয়া আছে যাদের"
          value={summary.withDueCount}
          suffix="জন"
          tone={summary.withDueCount > 0 ? "due" : "neutral"}
          icon={UserCheck}
          href="/customers?due=1"
        />
      </div>

      <Card>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-medium">{bn.actions.search}</span>
              <input
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="নাম বা মোবাইল নম্বর"
                className="h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>

            <div className="flex items-end">
              <Button type="submit" block>
                {bn.actions.filter}
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input
                type="checkbox"
                name="due"
                value="1"
                defaultChecked={dueOnly}
                className="size-4 cursor-pointer accent-[var(--color-primary)]"
              />
              শুধু যাদের বকেয়া আছে
            </label>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{parties.length} জন কাস্টমার</CardTitle>
        </CardHeader>

        <CardBody className="pt-0">
          <AddPartyPanel type="customer" />
        </CardBody>

        {parties.length === 0 ? (
          <EmptyState
            icon={Users}
            title={dueOnly ? "কারও বকেয়া নেই" : bn.emptyStates.noCustomers}
            hint="উপরে কাস্টমার যোগ করুন, বা বিক্রয় এন্ট্রির মধ্যেই যোগ করে নিন"
            action={
              <Button asChild size="sm">
                <Link href="/entry">{bn.nav.newEntry}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{bn.fields.name}</TH>
                    <TH>{bn.fields.phone}</TH>
                    <TH numeric>মোট বিক্রয়</TH>
                    <TH numeric>মোট পরিশোধ</TH>
                    <TH numeric>{bn.dashboard.customerDue}</TH>
                    <TH>শেষ লেনদেন</TH>
                  </TR>
                </THead>
                <tbody>
                  {parties.map((party) => {
                    const due = moneyFromDb(party.receivable);
                    return (
                      <TR key={party.id}>
                        <TD>
                          <Link
                            href={`/customers/${party.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {party.name}
                          </Link>
                        </TD>
                        <TD className="num text-muted-foreground">{party.phone ?? "—"}</TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(party.totalSales)}
                            size="sm"
                            symbol={false}
                          />
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(party.totalReceived)}
                            size="sm"
                            symbol={false}
                            tone="credit"
                          />
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={due}
                            size="sm"
                            symbol={false}
                            tone={due > 0n ? "due" : "neutral"}
                          />
                        </TD>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {party.lastTransactionAt
                            ? formatDateShort(party.lastTransactionAt.slice(0, 10))
                            : "—"}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </TableScroll>
            </div>

            <MobileCards>
              {parties.map((party) => {
                const due = moneyFromDb(party.receivable);
                return (
                  <MobileRow
                    key={party.id}
                    href={`/customers/${party.id}`}
                    title={party.name}
                    subtitle={party.phone ?? "মোবাইল নম্বর নেই"}
                    right={
                      due > 0n ? (
                        <>
                          <MoneyText value={due} size="sm" tone="due" />
                          <p className="mt-0.5 text-xs text-muted-foreground">বকেয়া</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">বকেয়া নেই</span>
                      )
                    }
                  />
                );
              })}
            </MobileCards>
          </>
        )}
      </Card>
    </div>
  );
}
