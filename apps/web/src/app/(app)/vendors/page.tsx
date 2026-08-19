import Link from "next/link";
import { PlusCircle, Truck, UserCheck, Wallet } from "lucide-react";
import { can, getParties } from "@hishabai/core";
import { moneyFromDb } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { AddPartyPanel } from "@/components/master-data/create-forms";
import { formatDateShort } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).nav.vendors };
}

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

  const [
    {
      session,
      data: { parties, summary },
    },
    t,
  ] = await Promise.all([
    sessionWithData((scope) =>
      getParties(scope, {
        type: "vendor",
        ...(params.q ? { search: params.q } : {}),
        dueOnly,
      }),
    ),
    dict(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.nav.vendors}</h1>
          <p className="text-sm text-muted-foreground">{t.masterData.vendorsHint}</p>
        </div>
        <Button asChild>
          <Link href="/entry">
            <PlusCircle className="size-4" aria-hidden />
            {t.nav.newEntry}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t.dashboard.vendorPayable}
          value={moneyFromDb(summary.totalPayable)}
          tone="due"
          icon={Wallet}
        />
        <CountTile
          label={t.masterData.vendorCount}
          value={summary.partyCount}
          suffix={t.masterData.people}
          icon={Truck}
        />
        <CountTile
          label={t.masterData.withPayables}
          value={summary.withDueCount}
          suffix={t.masterData.people}
          tone={summary.withDueCount > 0 ? "due" : "neutral"}
          icon={UserCheck}
          href="/vendors?due=1"
        />
      </div>

      <Card>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-medium">{t.actions.search}</span>
              <input
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder={t.masterData.nameOrPhone}
                className="h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>

            <div className="flex items-end">
              <Button type="submit" block>
                {t.actions.filter}
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
              {t.masterData.onlyWithPayables}
            </label>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.masterData.vendorCountTitle(String(parties.length))}</CardTitle>
        </CardHeader>

        {can(session, "party.manage") ? (
          <CardBody className="pt-0">
            <AddPartyPanel type="vendor" />
          </CardBody>
        ) : null}

        {parties.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={dueOnly ? t.masterData.noPayables : t.emptyStates.noVendors}
            hint={t.masterData.addVendorHint}
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
                    <TH>{t.fields.name}</TH>
                    <TH>{t.fields.phone}</TH>
                    <TH numeric>{t.masterData.totalPurchasesColumn}</TH>
                    <TH numeric>{t.masterData.totalPaidColumn}</TH>
                    <TH numeric>{t.dashboard.vendorPayable}</TH>
                    <TH>{t.masterData.lastEntryColumn}</TH>
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
                    subtitle={party.phone ?? t.masterData.noPhone}
                    right={
                      payable > 0n ? (
                        <>
                          <MoneyText value={payable} size="sm" tone="due" />
                          <p className="mt-0.5 text-xs text-muted-foreground">{t.masterData.payable}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t.masterData.noPayable}</span>
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
