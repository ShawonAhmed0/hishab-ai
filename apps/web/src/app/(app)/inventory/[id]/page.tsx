import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Boxes, Coins, Ruler } from "lucide-react";
import { getProductDetail } from "@hishabai/core";
import { formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

/** Movements that added stock, for colouring the quantity column. */
const INBOUND = new Set(["in"]);

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ data }, t] = await Promise.all([
    sessionWithData((scope) => getProductDetail(scope, id)),
    dict(),
  ]);

  // Not found and not-yours are deliberately the same answer: RLS returns no
  // row either way, and saying which it was would confirm the id exists.
  if (!data) notFound();

  const { product, movements } = data;
  const quantity = qtyFromDb(product.quantity);
  const minimum = qtyFromDb(product.minStockLevel);
  const low = minimum > 0n && quantity <= minimum;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/inventory"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t.nav.inventory}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{product.nameBn}</h1>
          <Badge tone="neutral">{t.productKind[product.kind]}</Badge>
          {low ? (
            <Badge tone="due">
              {quantity <= 0n ? t.masterData.outOfStock : t.messages.lowStock}
            </Badge>
          ) : null}
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          {product.nameEn ? `${product.nameEn} · ` : ""}
          {t.masterData.unitIs(product.unitNameBn)}
          {product.sku ? t.masterData.codeIs(product.sku) : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CountTile
          label={t.masterData.currentStock}
          value={formatQty(quantity, { unit: product.unitSymbol })}
          tone={low ? "due" : "neutral"}
          icon={Boxes}
        />
        <StatTile
          label={t.fields.avgCost}
          value={moneyFromDb(product.avgCost)}
          icon={Coins}
          footnote={t.masterData.weightedAverage}
        />
        <StatTile
          label={t.masterData.stockValueColumn}
          value={moneyFromDb(product.value)}
          icon={Boxes}
        />
        <CountTile
          label={t.fields.minStock}
          value={formatQty(minimum, { unit: product.unitSymbol })}
          icon={Ruler}
          footnote={
            low
              ? t.masterData.atThisLevel
              : minimum > 0n
                ? t.masterData.warnBelow
                : t.masterData.notSet
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.masterData.stockMovements}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {t.masterData.stockMovementsNote}
          </span>
        </CardHeader>

        {movements.length === 0 ? (
          <EmptyState
            title={t.masterData.noMovements}
            hint={t.masterData.noMovementsHint}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.date}</TH>
                    <TH>{t.masterData.kindColumn}</TH>
                    <TH>{t.fields.voucherNo}</TH>
                    <TH>{t.fields.party}</TH>
                    <TH numeric>{t.fields.quantity}</TH>
                    <TH numeric>{t.masterData.rateColumn}</TH>
                    <TH numeric>{t.masterData.balanceColumn}</TH>
                    <TH numeric>{t.fields.avgCost}</TH>
                    <TH numeric>{t.masterData.stockValueColumn}</TH>
                  </TR>
                </THead>
                <tbody>
                  {movements.map((movement) => {
                    const inbound = INBOUND.has(movement.direction);
                    return (
                      <TR key={movement.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {formatDateShort(movement.date)}
                        </TD>
                        <TD>
                          <Badge tone={inbound ? "credit" : "debit"}>
                            {t.stockMovementType[movement.movementType]}
                          </Badge>
                        </TD>
                        <TD>
                          {movement.transactionId ? (
                            <Link
                              href={`/transactions/${movement.transactionId}`}
                              className="num text-primary hover:underline"
                            >
                              {movement.voucherNo}
                            </Link>
                          ) : (
                            <span className="text-subtle-foreground">—</span>
                          )}
                        </TD>
                        <TD className="max-w-[12rem] truncate">{movement.partyName ?? "—"}</TD>
                        <TD numeric>
                          <span className={inbound ? "num text-credit" : "num text-debit"}>
                            {inbound ? "+" : "−"}
                            {formatQty(qtyFromDb(movement.quantity), {
                              unit: product.unitSymbol,
                            })}
                          </span>
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(movement.rate)}
                            size="sm"
                            symbol={false}
                          />
                        </TD>
                        <TD numeric className="font-medium">
                          {formatQty(qtyFromDb(movement.quantityAfter), {
                            unit: product.unitSymbol,
                          })}
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(movement.avgCostAfter)}
                            size="sm"
                            symbol={false}
                          />
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(movement.stockValueAfter)}
                            size="sm"
                            symbol={false}
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </TableScroll>
            </div>

            <MobileCards>
              {movements.map((movement) => {
                const inbound = INBOUND.has(movement.direction);
                return (
                  <MobileRow
                    key={movement.id}
                    title={t.stockMovementType[movement.movementType]}
                    subtitle={`${formatDateShort(movement.date)}${
                      movement.voucherNo ? ` · ${movement.voucherNo}` : ""
                    }`}
                    meta={
                      <span className="text-xs text-muted-foreground">
                        {t.masterData.balanceColumn}{" "}
                        {formatQty(qtyFromDb(movement.quantityAfter), {
                          unit: product.unitSymbol,
                        })}
                      </span>
                    }
                    right={
                      <>
                        <span
                          className={
                            inbound
                              ? "num inline-flex items-center gap-1 text-credit"
                              : "num inline-flex items-center gap-1 text-debit"
                          }
                        >
                          {inbound ? (
                            <ArrowDownLeft className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowUpRight className="size-3.5" aria-hidden />
                          )}
                          {formatQty(qtyFromDb(movement.quantity), {
                            unit: product.unitSymbol,
                          })}
                        </span>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.masterData.average}{" "}
                          <MoneyText
                            value={moneyFromDb(movement.avgCostAfter)}
                            size="sm"
                            symbol={false}
                          />
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
    </div>
  );
}
