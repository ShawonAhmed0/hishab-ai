import Link from "next/link";
import { PhoneCall, UserCheck, UserX, Users } from "lucide-react";
import { dailyAlertsFrom, getCustomerHealth, reactivationList } from "@hishabai/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { DailyAlertBlock, FollowUpList, StatusBadge } from "@/components/customers/health";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).activity.title };
}

/**
 * কাস্টমারের অবস্থা — spec R5.4, R5.5 and R5.6 on one screen.
 *
 * The daily block, the win-back list and the call list are three slices of a
 * single derivation, so they are three views of one read rather than three
 * queries. `?only=reactivation` is R5.5's dedicated filtered view; without it
 * the table is every customer, which is what the traffic light is for.
 */
export default async function CustomerHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ only?: string }>;
}) {
  const params = await searchParams;
  const winBackOnly = params.only === "reactivation";

  const [{ data: view }, t] = await Promise.all([
    sessionWithData(getCustomerHealth),
    dict(),
  ]);

  const alerts = dailyAlertsFrom(view);
  const winBack = reactivationList(view);
  const rows = winBackOnly ? winBack : view.customers;

  const counts = {
    doubtful: view.customers.filter((c) => c.status === "doubtful").length,
    critical: view.customers.filter((c) => c.status === "critical").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.activity.title}</h1>
          <p className="text-sm text-muted-foreground">{t.activity.hint}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/customers">{t.nav.customers}</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CountTile
          label={t.activity.status.doubtful}
          value={counts.doubtful}
          tone={counts.doubtful > 0 ? "due" : "neutral"}
          icon={UserCheck}
        />
        <CountTile
          label={t.activity.status.critical}
          value={counts.critical}
          tone={counts.critical > 0 ? "debit" : "neutral"}
          icon={UserX}
        />
        <CountTile
          label={t.activity.reactivation}
          value={winBack.length}
          tone={winBack.length > 0 ? "due" : "neutral"}
          icon={PhoneCall}
          href="/customers/health?only=reactivation"
          footnote={t.activity.reactivationHint}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DailyAlertBlock alerts={alerts} t={t} />
        <FollowUpList customers={alerts.followUps} t={t} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {winBackOnly ? t.activity.reactivation : t.activity.customerCount(String(rows.length))}
          </CardTitle>
          <Link
            href={winBackOnly ? "/customers/health" : "/customers/health?only=reactivation"}
            className="text-sm text-primary hover:underline"
          >
            {winBackOnly ? t.actions.viewAll : t.activity.onlyReactivation}
          </Link>
        </CardHeader>

        <CardBody className="pt-0">
          <p className="text-xs text-muted-foreground">
            {t.activity.dailyHint(formatDateShort(view.today))}
          </p>
        </CardBody>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={winBackOnly ? t.activity.noReactivation : t.emptyStates.noCustomers}
            hint={winBackOnly ? t.activity.reactivationHint : t.masterData.addCustomerHint}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.name}</TH>
                    <TH>{t.activity.statusColumn}</TH>
                    <TH>{t.activity.lastOrder}</TH>
                    <TH numeric>{t.activity.orderCount}</TH>
                    <TH numeric>{t.activity.recentVolume}</TH>
                    <TH numeric>{t.activity.baselineVolume}</TH>
                    <TH numeric>{t.dashboard.customerDue}</TH>
                  </TR>
                </THead>
                <tbody>
                  {rows.map((customer) => (
                    <TR key={customer.partyId}>
                      <TD>
                        <Link
                          href={`/customers/${customer.partyId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {customer.name}
                        </Link>
                        {customer.phone ? (
                          <a
                            href={`tel:${customer.phone}`}
                            className="num ml-2 text-xs text-muted-foreground hover:underline"
                          >
                            {customer.phone}
                          </a>
                        ) : null}
                      </TD>
                      <TD>
                        <StatusBadge status={customer.status} t={t} />
                        {customer.volumeDrop ? (
                          <Badge tone="due" className="ml-1">
                            {t.activity.volumeDropBadge}
                          </Badge>
                        ) : null}
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {customer.lastOrderDate ? (
                          <>
                            {formatDateShort(customer.lastOrderDate)}
                            <span className="ml-1.5 text-xs">
                              {t.activity.daysSilent(String(customer.daysSince ?? 0))}
                            </span>
                          </>
                        ) : (
                          t.activity.neverOrdered
                        )}
                      </TD>
                      <TD numeric className="num">
                        {customer.orders}
                      </TD>
                      <TD numeric>
                        <MoneyText value={customer.recent} size="sm" symbol={false} />
                      </TD>
                      <TD numeric>
                        <MoneyText
                          value={customer.baseline}
                          size="sm"
                          symbol={false}
                          tone="neutral"
                        />
                      </TD>
                      <TD numeric>
                        <MoneyText
                          value={customer.receivable}
                          size="sm"
                          symbol={false}
                          tone={customer.receivable > 0n ? "due" : "neutral"}
                        />
                        {customer.ageing.band !== "healthy" ? (
                          <span className="mt-0.5 block text-xs text-due">
                            {t.activity.band[customer.ageing.band]} ·{" "}
                            {t.activity.overdueDays(String(customer.ageing.daysOverdue))}
                          </span>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableScroll>
            </div>

            <MobileCards>
              {rows.map((customer) => (
                <MobileRow
                  key={customer.partyId}
                  href={`/customers/${customer.partyId}`}
                  title={customer.name}
                  subtitle={
                    customer.lastOrderDate
                      ? t.activity.daysSilent(String(customer.daysSince ?? 0))
                      : t.activity.neverOrdered
                  }
                  meta={<StatusBadge status={customer.status} t={t} />}
                  right={
                    customer.receivable > 0n ? (
                      <>
                        <MoneyText value={customer.receivable} size="sm" tone="due" />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.fields.dueAmount}
                        </p>
                      </>
                    ) : (
                      <MoneyText value={customer.recent} size="sm" symbol={false} />
                    )
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
