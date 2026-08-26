import Link from "next/link";
import { HeartPulse, PlusCircle, Users, UserCheck, Wallet } from "lucide-react";
import { can, getParties, getUsers } from "@hishabai/core";
import { moneyFromDb } from "@hishabai/shared";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { FilterBar, FilterCheck, FilterField, FilterInput } from "@/components/ui/filter-bar";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";
import { AddPartyPanel } from "@/components/master-data/create-forms";

export async function generateMetadata() {
  return { title: (await dict()).nav.customers };
}

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

  const [
    {
      session,
      data: { parties, summary },
    },
    t,
  ] = await Promise.all([
    sessionWithData((scope) =>
      getParties(scope, {
        type: "customer",
        ...(params.q ? { search: params.q } : {}),
        dueOnly,
      }),
    ),
    dict(),
  ]);

  // R5.6 — who a new customer can be assigned to. Only worth asking when
  // somebody else works here; `getUsers` needs the permission the add form
  // needs anyway.
  const canManage = can(session, "party.manage");
  const assignees = canManage
    ? (await getUsers(session)).members
        .filter((member) => member.isActive)
        .map((member) => ({ userId: member.userId, fullName: member.fullName }))
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.nav.customers}</h1>
          <p className="text-sm text-muted-foreground">{t.masterData.customersHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* R5.5 — the win-back list is reachable from here, which is where
              the sales team already is when they ask who to ring. */}
          <Button asChild variant="secondary">
            <Link href="/customers/health">
              <HeartPulse className="size-4" aria-hidden />
              {t.nav.customerHealth}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/entry">
              <PlusCircle className="size-4" aria-hidden />
              {t.nav.newEntry}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t.dashboard.customerDue}
          value={moneyFromDb(summary.totalReceivable)}
          tone="due"
          icon={Wallet}
        />
        <CountTile
          label={t.masterData.customerCount}
          value={summary.partyCount}
          suffix={t.masterData.people}
          icon={Users}
        />
        <CountTile
          label={t.masterData.withDues}
          value={summary.withDueCount}
          suffix={t.masterData.people}
          tone={summary.withDueCount > 0 ? "due" : "neutral"}
          icon={UserCheck}
          href="/customers?due=1"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.masterData.customerCountTitle(String(parties.length))}</CardTitle>
        </CardHeader>

        {canManage ? (
          <CardBody className="pt-0">
            <AddPartyPanel type="customer" assignees={assignees} />
          </CardBody>
        ) : null}

        <FilterBar
          action="/customers"
          active={Boolean(params.q) || dueOnly}
          submitLabel={t.actions.filter}
          clearLabel={t.actions.clearFilters}
        >
          <FilterField className="sm:col-span-2 lg:col-span-3" label={t.actions.search}>
            <FilterInput
              name="q"
              type="search"
              defaultValue={params.q ?? ""}
              placeholder={t.masterData.nameOrPhone}
            />
          </FilterField>

          <FilterCheck
            className="sm:col-span-2 lg:col-span-4"
            name="due"
            value="1"
            defaultChecked={dueOnly}
            label={t.masterData.onlyWithDues}
          />
        </FilterBar>

        {parties.length === 0 ? (
          <EmptyState
            icon={Users}
            title={dueOnly ? t.emptyStates.noDues : t.emptyStates.noCustomers}
            hint={t.masterData.addCustomerHint}
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
                    <TH numeric>{t.masterData.totalSalesColumn}</TH>
                    <TH numeric>{t.masterData.totalPaidColumn}</TH>
                    <TH numeric>{t.dashboard.customerDue}</TH>
                    <TH>{t.masterData.lastEntryColumn}</TH>
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
                    subtitle={party.phone ?? t.masterData.noPhone}
                    right={
                      due > 0n ? (
                        <>
                          <MoneyText value={due} size="sm" tone="due" />
                          <p className="mt-0.5 text-xs text-muted-foreground">{t.fields.dueAmount}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t.masterData.noDue}</span>
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
