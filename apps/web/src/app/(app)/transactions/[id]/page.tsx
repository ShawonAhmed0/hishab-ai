import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { can, getTransactionDetail } from "@hishabai/core";
import { formatQty, isTransactionLineRole, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { requireSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { CancelTransactionButton } from "./cancel-button";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, t] = await Promise.all([requireSession(), dict()]);
  const { id } = await params;
  const detail = await getTransactionDetail(session, id);
  if (!detail) notFound();

  const { transaction, partyName, createdByName, lines, payments, ledger, movements } = detail;
  const cancelled = transaction.status === "cancelled";

  const previousDue = moneyFromDb(transaction.previousDue);
  const currentBill = moneyFromDb(transaction.total);
  const paid = moneyFromDb(transaction.paidAmount);
  const newDue = moneyFromDb(transaction.previousDue) + moneyFromDb(transaction.dueAmount);

  // উৎপাদন, স্টক সমন্বয় and অন্যান্য settle within the business: no party, no
  // bill, no balance carried forward. Four zeroes under "বকেয়া বিবরণী" would
  // read as an entry that failed to register rather than one that never had a
  // due to begin with.
  const hasParty = partyName !== null;
  const showRole = lines.some((line) => line.role !== "item");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild aria-label={t.actions.back}>
            <Link href="/transactions">
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <div>
            <h1 className="num text-2xl font-bold tracking-tight">{transaction.voucherNo}</h1>
            <p className="text-sm text-muted-foreground">
              {t.transactionType[transaction.type]} · {formatDate(transaction.date, t)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {cancelled ? (
            <Badge tone="neutral">{t.transactionStatus.cancelled}</Badge>
          ) : can(session, "transaction.cancel") ? (
            <CancelTransactionButton
              transactionId={transaction.id}
              voucherNo={transaction.voucherNo}
            />
          ) : null}
        </div>
      </div>

      {cancelled ? (
        <div role="status" className="rounded-lg border border-border bg-surface-sunken p-3 text-sm">
          {t.transactions.cancelledNotice(transaction.cancelReason)}
        </div>
      ) : null}

      {/* ---- the arithmetic the user recognises (spec §13) ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{hasParty ? t.due.statement : t.transactions.summary}</CardTitle>
          <Button variant="ghost" size="sm" className="no-print" asChild>
            <a href="?print=1">
              <Printer className="size-4" aria-hidden />
              {t.actions.print}
            </a>
          </Button>
        </CardHeader>
        <CardBody>
          {!hasParty ? (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted-foreground">{t.fields.grandTotal}</dt>
                <dd className="mt-1">
                  <MoneyText value={currentBill} size="lg" />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t.due.payment}</dt>
                <dd className="mt-1">
                  <MoneyText value={paid} size="lg" tone={paid > 0n ? "debit" : "neutral"} />
                </dd>
              </div>
            </dl>
          ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">{t.due.previousDue}</dt>
              <dd className="mt-1">
                <MoneyText value={previousDue} size="lg" />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t.due.currentBill}</dt>
              <dd className="mt-1">
                <MoneyText value={currentBill} size="lg" />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{t.due.payment}</dt>
              <dd className="mt-1">
                <MoneyText value={paid} size="lg" tone="credit" />
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">{t.due.newDue}</dt>
              <dd className="mt-1">
                <MoneyText
                  value={newDue as typeof previousDue}
                  size="xl"
                  tone={newDue > 0n ? "due" : "neutral"}
                />
              </dd>
            </div>
          </dl>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t.transactions.details}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              {hasParty ? <Detail label={t.fields.party} value={partyName} /> : null}
              <Detail label={t.fields.memoNo} value={transaction.memoNo ?? "—"} />
              <Detail
                label={t.transactions.source}
                value={t.transactionSource[transaction.source]}
              />
              <Detail label={t.transactions.createdBy} value={createdByName ?? "—"} />
              <Detail
                label={t.transactions.createdAt}
                value={new Date(transaction.createdAt).toLocaleString("en-GB", {
                  timeZone: "Asia/Dhaka",
                })}
              />
              {transaction.description ? (
                <Detail
                  label={t.fields.description}
                  value={transaction.description}
                  className="col-span-2 sm:col-span-3"
                />
              ) : null}
            </dl>

            {lines.length > 0 ? (
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.product}</TH>
                    {/* A production voucher lists কাঁচামাল and উৎপাদিত পণ্য in
                        the same table; without this column it reads as one
                        undifferentiated list of products. */}
                    {showRole ? <TH>{t.fields.lineRole}</TH> : null}
                    <TH numeric>{t.fields.quantity}</TH>
                    <TH numeric>{t.fields.rate}</TH>
                    <TH numeric>{t.fields.lineTotal}</TH>
                  </TR>
                </THead>
                <tbody>
                  {lines.map((line) => {
                    const rate = moneyFromDb(line.rate);
                    // Production and adjustment lines quote no price: the
                    // engine costs them from the running average. A value is
                    // still allocated to the output, and it is the one the
                    // journal used, so it is read from there rather than from
                    // `amount`, which those lines never carry.
                    const value = moneyFromDb(line.amount) || moneyFromDb(line.allocatedCost);

                    return (
                      <TR key={line.id}>
                        <TD>{line.productName ?? "—"}</TD>
                        {showRole ? (
                          <TD className="text-muted-foreground">
                            {isTransactionLineRole(line.role) ? t.transactionLineRole[line.role] : line.role}
                          </TD>
                        ) : null}
                        <TD numeric className="num">
                          {formatQty(qtyFromDb(line.quantity), {
                            ...(line.unitSymbol ? { unit: line.unitSymbol } : {}),
                          })}
                        </TD>
                        <TD numeric>
                          {rate === 0n ? (
                            <span className="text-subtle-foreground">—</span>
                          ) : (
                            <MoneyText value={rate} size="sm" symbol={false} />
                          )}
                        </TD>
                        <TD numeric>
                          {value === 0n ? (
                            <span className="text-subtle-foreground">—</span>
                          ) : (
                            <MoneyText value={value} size="sm" symbol={false} />
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </TableScroll>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          {payments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.fields.paymentMethod}</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border">
                {payments.map((payment) => (
                  <li key={payment.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{payment.walletName}</span>
                      <MoneyText
                        value={moneyFromDb(payment.amount)}
                        size="sm"
                        tone={payment.direction === "in" ? "credit" : "debit"}
                      />
                    </div>
                    {payment.handledByName ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.fields.handledBy}: {payment.handledByName}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {movements.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.transactions.stockEffect}</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border">
                {movements.map((movement) => (
                  <li key={movement.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{movement.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.stockMovementType[
                          movement.movementType as keyof typeof t.stockMovementType
                        ] ?? movement.movementType}
                      </p>
                    </div>
                    <span
                      className={
                        movement.direction === "in"
                          ? "num text-sm text-credit"
                          : "num text-sm text-debit"
                      }
                    >
                      {movement.direction === "in" ? "+" : "−"}
                      {formatQty(qtyFromDb(movement.quantity))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      {/* The ledger is available but never required — spec §26. */}
      {can(session, "report.viewFinancial") ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.transactions.ledger}</CardTitle>
            <span className="text-xs text-muted-foreground">{t.transactions.ledgerNote}</span>
          </CardHeader>
          <TableScroll>
            <THead>
              <TR>
                <TH>{t.transactions.accountColumn}</TH>
                <TH>{t.transactions.narrationColumn}</TH>
                <TH numeric>{t.transactions.debitColumn}</TH>
                <TH numeric>{t.transactions.creditColumn}</TH>
              </TR>
            </THead>
            <tbody>
              {ledger.map((line) => (
                <TR key={line.id}>
                  <TD>
                    <span className="num text-muted-foreground">{line.accountCode}</span>{" "}
                    {line.accountName}
                  </TD>
                  <TD className="text-muted-foreground">{line.narration ?? "—"}</TD>
                  <TD numeric>
                    {moneyFromDb(line.debit) > 0n ? (
                      <MoneyText value={moneyFromDb(line.debit)} size="sm" symbol={false} />
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD numeric>
                    {moneyFromDb(line.credit) > 0n ? (
                      <MoneyText value={moneyFromDb(line.credit)} size="sm" symbol={false} />
                    ) : (
                      "—"
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableScroll>
        </Card>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
