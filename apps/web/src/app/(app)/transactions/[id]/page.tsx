import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { can, getTransactionDetail } from "@hishabai/core";
import { bn, formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { requireSession } from "@/lib/session";
import { formatDateBn } from "@/lib/utils";
import { CancelTransactionButton } from "./cancel-button";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getTransactionDetail(session, id);
  if (!detail) notFound();

  const { transaction, partyName, createdByName, lines, payments, ledger, movements } = detail;
  const cancelled = transaction.status === "cancelled";

  const previousDue = moneyFromDb(transaction.previousDue);
  const currentBill = moneyFromDb(transaction.total);
  const paid = moneyFromDb(transaction.paidAmount);
  const newDue = moneyFromDb(transaction.previousDue) + moneyFromDb(transaction.dueAmount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild aria-label={bn.actions.back}>
            <Link href="/transactions">
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <div>
            <h1 className="num text-2xl font-bold tracking-tight">{transaction.voucherNo}</h1>
            <p className="text-sm text-muted-foreground">
              {bn.transactionType[transaction.type]} · {formatDateBn(transaction.date)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {cancelled ? (
            <Badge tone="neutral">{bn.transactionStatus.cancelled}</Badge>
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
          এই লেনদেনটি বাতিল করা হয়েছে
          {transaction.cancelReason ? ` — ${transaction.cancelReason}` : ""}। মূল এন্ট্রি
          মোছা হয়নি; এর প্রভাব একটি বিপরীত এন্ট্রি দিয়ে বাতিল করা হয়েছে।
        </div>
      ) : null}

      {/* ---- the arithmetic the user recognises (spec §13) ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{bn.due.statement}</CardTitle>
          <Button variant="ghost" size="sm" className="no-print" asChild>
            <a href="?print=1">
              <Printer className="size-4" aria-hidden />
              {bn.actions.print}
            </a>
          </Button>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted-foreground">{bn.due.previousDue}</dt>
              <dd className="mt-1">
                <MoneyText value={previousDue} size="lg" />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{bn.due.currentBill}</dt>
              <dd className="mt-1">
                <MoneyText value={currentBill} size="lg" />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">{bn.due.payment}</dt>
              <dd className="mt-1">
                <MoneyText value={paid} size="lg" tone="credit" />
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">{bn.due.newDue}</dt>
              <dd className="mt-1">
                <MoneyText
                  value={newDue as typeof previousDue}
                  size="xl"
                  tone={newDue > 0n ? "due" : "neutral"}
                />
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>বিস্তারিত</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Detail label={bn.fields.party} value={partyName ?? "—"} />
              <Detail label={bn.fields.memoNo} value={transaction.memoNo ?? "—"} />
              <Detail
                label="উৎস"
                value={bn.transactionSource[transaction.source]}
              />
              <Detail label="তৈরি করেছেন" value={createdByName ?? "—"} />
              <Detail
                label="তৈরির সময়"
                value={new Date(transaction.createdAt).toLocaleString("en-GB", {
                  timeZone: "Asia/Dhaka",
                })}
              />
              {transaction.description ? (
                <Detail
                  label={bn.fields.description}
                  value={transaction.description}
                  className="col-span-2 sm:col-span-3"
                />
              ) : null}
            </dl>

            {lines.length > 0 ? (
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{bn.fields.product}</TH>
                    <TH numeric>{bn.fields.quantity}</TH>
                    <TH numeric>{bn.fields.rate}</TH>
                    <TH numeric>{bn.fields.lineTotal}</TH>
                  </TR>
                </THead>
                <tbody>
                  {lines.map((line) => (
                    <TR key={line.id}>
                      <TD>{line.productName ?? "—"}</TD>
                      <TD numeric className="num">
                        {formatQty(qtyFromDb(line.quantity), {
                          ...(line.unitSymbol ? { unit: line.unitSymbol } : {}),
                        })}
                      </TD>
                      <TD numeric>
                        <MoneyText value={moneyFromDb(line.rate)} size="sm" symbol={false} />
                      </TD>
                      <TD numeric>
                        <MoneyText value={moneyFromDb(line.amount)} size="sm" symbol={false} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableScroll>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          {payments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{bn.fields.paymentMethod}</CardTitle>
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
                        {bn.fields.handledBy}: {payment.handledByName}
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
                <CardTitle>স্টক প্রভাব</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border">
                {movements.map((movement) => (
                  <li key={movement.id} className="flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{movement.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {bn.stockMovementType[
                          movement.movementType as keyof typeof bn.stockMovementType
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
            <CardTitle>হিসাবের খাতা</CardTitle>
            <span className="text-xs text-muted-foreground">
              স্বয়ংক্রিয়ভাবে তৈরি — কিছু লিখতে হয়নি
            </span>
          </CardHeader>
          <TableScroll>
            <THead>
              <TR>
                <TH>হিসাব</TH>
                <TH>বিবরণ</TH>
                <TH numeric>ডেবিট</TH>
                <TH numeric>ক্রেডিট</TH>
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
