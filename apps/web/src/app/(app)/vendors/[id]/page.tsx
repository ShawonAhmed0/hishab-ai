import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { getPartyLedger } from "@hishabai/core";
import { moneyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { PrintButton } from "@/components/ui/print-button";
import { StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TFoot, TH, THead, TR, TableScroll, TotalRow } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

export default async function VendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // The payable half: what we owe them, not the net of both directions — a
  // party marked 'both' has a customer profile for the other side.
  const [{ data }, t] = await Promise.all([
    sessionWithData((scope) => getPartyLedger(scope, id, "payable")),
    dict(),
  ]);

  // Missing and not-yours give the same answer — RLS returns no row either way.
  if (!data) notFound();

  const { party, entries } = data;
  const payable = moneyFromDb(party.payable);

  return (
    <div className="space-y-5">
      <div className="no-print">
        <Link
          href="/vendors"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t.nav.vendors}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{party.name}</h1>
            <Badge tone="neutral">{t.partyType[party.type]}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {party.phone ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" aria-hidden />
                <span className="num">{party.phone}</span>
              </span>
            ) : null}
            {party.address ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden />
                {party.address}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2">
          <PrintButton label={t.masterData.payableStatementPrint} />
          <Button asChild size="sm" className="no-print">
            <Link href="/entry">{t.nav.newEntry}</Link>
          </Button>
        </div>
      </div>

      {/* Spec §13, mirrored: total billed by them, total paid, still owed. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t.masterData.totalPurchasesColumn}
          value={moneyFromDb(party.totalPurchases)}
          icon={ShoppingCart}
          footnote={t.masterData.totalBought}
        />
        <StatTile
          label={t.masterData.totalPaidColumn}
          value={moneyFromDb(party.totalPaid)}
          tone="debit"
          icon={Receipt}
          footnote={t.masterData.totalPaidHint}
        />
        <StatTile
          label={t.masterData.payable}
          value={payable}
          tone={payable > 0n ? "due" : "neutral"}
          icon={Wallet}
          footnote={payable > 0n ? t.masterData.stillToPay : t.masterData.allSettled}
        />
      </div>

      <Card className="card">
        <CardHeader>
          <div>
            <CardTitle>{t.masterData.payableStatement}</CardTitle>
            {/* Only meaningful on paper, where the reader has no company switcher. */}
            <p className="hidden text-xs text-muted-foreground print:block">
              {party.name} · {new Date().toLocaleDateString("en-GB")}
            </p>
          </div>
          <span className="text-xs text-muted-foreground no-print">
            {t.masterData.statementNote}
          </span>
        </CardHeader>

        {entries.length === 0 ? (
          <EmptyState
            title={t.emptyStates.noTransactions}
            hint={t.masterData.firstPurchaseHint}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.date}</TH>
                    <TH>{t.fields.voucherNo}</TH>
                    <TH>{t.fields.description}</TH>
                    <TH numeric>{t.masterData.billColumn}</TH>
                    <TH numeric>{t.due.payment}</TH>
                    <TH numeric>{t.masterData.balanceColumn}</TH>
                  </TR>
                </THead>
                <tbody>
                  {entries.map((entry) => {
                    // Flipped against the customer statement: a vendor's bill
                    // credits payable, and paying it debits the account down.
                    const bill = moneyFromDb(entry.credit);
                    const paid = moneyFromDb(entry.debit);
                    const balance = moneyFromDb(entry.balance);

                    return (
                      <TR
                        key={entry.id}
                        className={entry.status === "cancelled" ? "opacity-60" : ""}
                      >
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
                        <TD className="max-w-[18rem] truncate text-muted-foreground">
                          {entry.narration ??
                            (entry.transactionType
                              ? t.transactionType[entry.transactionType]
                              : "—")}
                          {entry.status === "cancelled" ? (
                            <Badge tone="neutral" className="ml-1">
                              {t.transactionStatus.cancelled}
                            </Badge>
                          ) : null}
                        </TD>
                        <TD numeric>
                          {bill > 0n ? (
                            <MoneyText value={bill} size="sm" symbol={false} />
                          ) : (
                            <span className="text-subtle-foreground">—</span>
                          )}
                        </TD>
                        <TD numeric>
                          {paid > 0n ? (
                            <MoneyText value={paid} size="sm" symbol={false} tone="debit" />
                          ) : (
                            <span className="text-subtle-foreground">—</span>
                          )}
                        </TD>
                        <TD numeric className="font-medium">
                          <MoneyText
                            value={balance}
                            size="sm"
                            symbol={false}
                            tone={balance > 0n ? "due" : "neutral"}
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
                <TFoot>
                  <TotalRow>
                    <TD className="font-semibold" />
                    <TD />
                    <TD className="font-semibold">{t.masterData.currentPayable}</TD>
                    <TD />
                    <TD />
                    <TD numeric>
                      <MoneyText
                        value={payable}
                        size="sm"
                        tone={payable > 0n ? "due" : "neutral"}
                        className="font-bold"
                      />
                    </TD>
                  </TotalRow>
                </TFoot>
              </TableScroll>
            </div>

            <MobileCards>
              {entries.map((entry) => {
                const bill = moneyFromDb(entry.credit);
                const paid = moneyFromDb(entry.debit);
                const balance = moneyFromDb(entry.balance);
                const isBill = bill > 0n;

                return (
                  <MobileRow
                    key={entry.id}
                    title={
                      isBill
                        ? (entry.transactionType
                            ? t.transactionType[entry.transactionType]
                            : t.masterData.billColumn)
                        : t.due.payment
                    }
                    subtitle={`${formatDateShort(entry.date)}${
                      entry.voucherNo ? ` · ${entry.voucherNo}` : ""
                    }`}
                    right={
                      <>
                        <MoneyText
                          value={isBill ? bill : paid}
                          size="sm"
                          tone={isBill ? "neutral" : "debit"}
                          signed={false}
                        />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.masterData.balanceColumn}{" "}
                          <MoneyText value={balance} size="sm" symbol={false} tone="due" />
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

      <p className="hidden text-xs text-muted-foreground print:block">
        {t.masterData.statementFooter}
      </p>
    </div>
  );
}
