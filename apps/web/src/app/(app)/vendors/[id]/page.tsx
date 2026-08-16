import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { getPartyLedger } from "@hishabai/core";
import { bn, moneyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { PrintButton } from "@/components/ui/print-button";
import { StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
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
  const { data } = await sessionWithData((scope) => getPartyLedger(scope, id, "payable"));

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
          {bn.nav.vendors}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{party.name}</h1>
            <Badge tone="neutral">{bn.partyType[party.type]}</Badge>
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
          <PrintButton label="পাওনা বিবরণী প্রিন্ট" />
          <Button asChild size="sm" className="no-print">
            <Link href="/entry">{bn.nav.newEntry}</Link>
          </Button>
        </div>
      </div>

      {/* Spec §13, mirrored: total billed by them, total paid, still owed. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="মোট ক্রয়"
          value={moneyFromDb(party.totalPurchases)}
          icon={ShoppingCart}
          footnote="এই ভেন্ডরের কাছ থেকে মোট কেনা"
        />
        <StatTile
          label="মোট পরিশোধ"
          value={moneyFromDb(party.totalPaid)}
          tone="debit"
          icon={Receipt}
          footnote="যত টাকা দেওয়া হয়েছে"
        />
        <StatTile
          label="পাওনা"
          value={payable}
          tone={payable > 0n ? "due" : "neutral"}
          icon={Wallet}
          footnote={payable > 0n ? "এখনো দিতে হবে" : "সব পরিশোধ হয়েছে"}
        />
      </div>

      <Card className="card">
        <CardHeader>
          <div>
            <CardTitle>পাওনা বিবরণী</CardTitle>
            {/* Only meaningful on paper, where the reader has no company switcher. */}
            <p className="hidden text-xs text-muted-foreground print:block">
              {party.name} · {new Date().toLocaleDateString("en-GB")}
            </p>
          </div>
          <span className="text-xs text-muted-foreground no-print">
            বিল ও পরিশোধ আলাদা লাইনে, নিচে চলতি ব্যালেন্স
          </span>
        </CardHeader>

        {entries.length === 0 ? (
          <EmptyState
            title="এখনো কোনো লেনদেন নেই"
            hint="এই ভেন্ডরের প্রথম ক্রয় এন্ট্রি করলে বিবরণী তৈরি হবে"
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{bn.fields.date}</TH>
                    <TH>{bn.fields.voucherNo}</TH>
                    <TH>{bn.fields.description}</TH>
                    <TH numeric>বিল</TH>
                    <TH numeric>{bn.due.payment}</TH>
                    <TH numeric>ব্যালেন্স</TH>
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
                              ? bn.transactionType[entry.transactionType]
                              : "—")}
                          {entry.status === "cancelled" ? (
                            <Badge tone="neutral" className="ml-1">
                              {bn.transactionStatus.cancelled}
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
                <tfoot>
                  <TR className="border-t-2 border-border-strong bg-surface-sunken">
                    <TD className="font-semibold" />
                    <TD />
                    <TD className="font-semibold">বর্তমান পাওনা</TD>
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
                  </TR>
                </tfoot>
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
                            ? bn.transactionType[entry.transactionType]
                            : "বিল")
                        : bn.due.payment
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
                          ব্যালেন্স{" "}
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
        HishabAI থেকে তৈরি করা বিবরণী।
      </p>
    </div>
  );
}
