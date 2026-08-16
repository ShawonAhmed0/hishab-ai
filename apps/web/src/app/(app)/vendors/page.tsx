import Link from "next/link";
import { PlusCircle, Truck, UserCheck, Wallet } from "lucide-react";
import { getParties } from "@hishabai/core";
import { bn, moneyFromDb } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { sessionWithData } from "@/lib/session";
import { AddPartyPanel } from "@/components/master-data/create-forms";
import { formatDateShort } from "@/lib/utils";

export const metadata = { title: bn.nav.vendors };

interface SearchParams {
  q?: string;
  due?: string;
}

export default async function VendorsPage({
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
      type: "vendor",
      ...(params.q ? { search: params.q } : {}),
      dueOnly,
    }),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{bn.nav.vendors}</h1>
          <p className="text-sm text-muted-foreground">কার পাওনা কত, এক নজরে</p>
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
          label={bn.dashboard.vendorPayable}
          value={moneyFromDb(summary.totalPayable)}
          tone="due"
          icon={Wallet}
        />
        <CountTile label="ভেন্ডর সংখ্যা" value={summary.partyCount} suffix="জন" icon={Truck} />
        <CountTile
          label="পাওনা আছে যাদের"
          value={summary.withDueCount}
          suffix="জন"
          tone={summary.withDueCount > 0 ? "due" : "neutral"}
          icon={UserCheck}
          href="/vendors?due=1"
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
              শুধু যাদের পাওনা আছে
            </label>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{parties.length} জন ভেন্ডর</CardTitle>
        </CardHeader>

        <CardBody className="pt-0">
          <AddPartyPanel type="vendor" />
        </CardBody>

        {parties.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={dueOnly ? "কারও পাওনা নেই" : bn.emptyStates.noVendors}
            hint="উপরে ভেন্ডর যোগ করুন, বা ক্রয় এন্ট্রির মধ্যেই যোগ করে নিন"
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
                    <TH numeric>মোট ক্রয়</TH>
                    <TH numeric>মোট পরিশোধ</TH>
                    <TH numeric>{bn.dashboard.vendorPayable}</TH>
                    <TH>শেষ লেনদেন</TH>
                  </TR>
                </THead>
                <tbody>
                  {parties.map((party) => {
                    const payable = moneyFromDb(party.payable);
                    return (
                      <TR key={party.id}>
                        <TD>
                          <Link
                            href={`/vendors/${party.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {party.name}
                          </Link>
                        </TD>
                        <TD className="num text-muted-foreground">{party.phone ?? "—"}</TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(party.totalPurchases)}
                            size="sm"
                            symbol={false}
                          />
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(party.totalPaid)}
                            size="sm"
                            symbol={false}
                            tone="debit"
                          />
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={payable}
                            size="sm"
                            symbol={false}
                            tone={payable > 0n ? "due" : "neutral"}
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
                const payable = moneyFromDb(party.payable);
                return (
                  <MobileRow
                    key={party.id}
                    href={`/vendors/${party.id}`}
                    title={party.name}
                    subtitle={party.phone ?? "মোবাইল নম্বর নেই"}
                    right={
                      payable > 0n ? (
                        <>
                          <MoneyText value={payable} size="sm" tone="due" />
                          <p className="mt-0.5 text-xs text-muted-foreground">পাওনা</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">পাওনা নেই</span>
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
