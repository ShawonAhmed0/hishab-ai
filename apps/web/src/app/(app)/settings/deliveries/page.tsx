import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Settings } from "lucide-react";
import { can, cloudApiConfigFromEnv, listDeliveries } from "@hishabai/core";
import type { DeliveryStatus, WhatsAppTemplateKey } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).delivery.title };
}

const STATUS_TONE: Record<DeliveryStatus, "credit" | "due" | "debit" | "neutral"> = {
  sent: "credit",
  pending: "due",
  failed: "debit",
  skipped: "neutral",
};

/**
 * হোয়াটসঅ্যাপ লগ — spec R4.6's "log delivery attempts and failures".
 *
 * The rows existed from the day the delivery layer did; this is the screen
 * that makes them answer the question somebody actually asks, which is never
 * "how many messages were sent" but "why did this customer never hear from
 * us?". So the failure reason is a column, not a detail view — a skipped row
 * whose reason is "no usable phone number" is a data-entry job for whoever is
 * reading, and burying it one click away is how it never gets done.
 */
export default async function DeliveryLogPage() {
  const [{ session, data }, t] = await Promise.all([
    sessionWithData((scope) => listDeliveries(scope, 100)),
    dict(),
  ]);

  // The nav does not link here without the permission, but a typed URL reaches
  // it — and this page shows customer phone numbers.
  if (!can(session, "settings.manage")) redirect("/dashboard");

  // Read on the server only: whether a token exists, never what it is.
  const configured = cloudApiConfigFromEnv() !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.delivery.title}</h1>
          <p className="text-sm text-muted-foreground">{t.delivery.hint}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/settings">
            <Settings className="size-4" aria-hidden />
            {t.nav.settings}
          </Link>
        </Button>
      </div>

      {/* Not an error: without credentials the app deliberately queues, logs
          and marks `skipped` rather than hoarding messages to deliver late. */}
      {!configured ? (
        <Card>
          <CardBody className="text-sm text-muted-foreground">
            {t.delivery.inertNotice}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.delivery.title}</CardTitle>
        </CardHeader>

        {data.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title={t.delivery.empty}
            hint={t.delivery.emptyHint}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.delivery.whenColumn}</TH>
                    <TH>{t.delivery.templateColumn}</TH>
                    <TH>{t.delivery.recipientColumn}</TH>
                    <TH>{t.delivery.messageColumn}</TH>
                    <TH>{t.delivery.statusColumn}</TH>
                    <TH numeric>{t.delivery.attemptsColumn}</TH>
                  </TR>
                </THead>
                <tbody>
                  {data.map((row) => (
                    <TR key={row.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(String(row.createdAt), t)}
                      </TD>
                      <TD>
                        {t.delivery.template[row.template as WhatsAppTemplateKey] ??
                          row.template}
                      </TD>
                      <TD className="num">
                        {row.recipient === "" ? (
                          <span className="text-muted-foreground">
                            {t.delivery.noRecipient}
                          </span>
                        ) : (
                          row.recipient
                        )}
                      </TD>
                      <TD className="max-w-[24rem] text-muted-foreground">
                        {row.preview}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[row.status]}>
                          {t.delivery.status[row.status]}
                        </Badge>
                        {/* The whole point of the screen. Meta's own words,
                            kept verbatim, because a paraphrase would lose the
                            one detail that explains the failure. */}
                        {row.lastError ? (
                          <p className="mt-1 max-w-[18rem] text-xs text-debit">
                            {row.lastError}
                          </p>
                        ) : null}
                      </TD>
                      <TD numeric className="num">
                        {row.attempts}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableScroll>
            </div>

            <MobileCards>
              {data.map((row) => (
                <MobileRow
                  key={row.id}
                  title={
                    t.delivery.template[row.template as WhatsAppTemplateKey] ?? row.template
                  }
                  subtitle={row.preview ?? ""}
                  meta={
                    <>
                      <Badge tone={STATUS_TONE[row.status]}>
                        {t.delivery.status[row.status]}
                      </Badge>
                      {row.lastError ? (
                        <span className="text-xs text-debit">{row.lastError}</span>
                      ) : null}
                    </>
                  }
                  right={
                    <span className="num text-xs text-muted-foreground">
                      {row.recipient === "" ? t.delivery.noRecipient : row.recipient}
                    </span>
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
