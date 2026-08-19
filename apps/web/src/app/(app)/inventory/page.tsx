import Link from "next/link";
import { AlertTriangle, Boxes, PackageX, Layers, PlusCircle } from "lucide-react";
import { can, getInventory } from "@hishabai/core";
import {
  PRODUCT_KINDS,
  formatQty,
  moneyFromDb,
  qtyFromDb,
  type ProductKind,
} from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { CountTile, StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { AddProductPanel } from "@/components/master-data/create-forms";

export async function generateMetadata() {
  return { title: (await dict()).nav.inventory };
}

interface SearchParams {
  kind?: string;
  q?: string;
  low?: string;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const kind = PRODUCT_KINDS.includes(params.kind as ProductKind)
    ? (params.kind as ProductKind)
    : undefined;
  const lowOnly = params.low === "1";

  const [
    {
      session,
      data: { products, summary, units, categories },
    },
    t,
  ] = await Promise.all([
    sessionWithData((scope) =>
      getInventory(scope, {
        ...(kind ? { kind } : {}),
        ...(params.q ? { search: params.q } : {}),
        lowOnly,
      }),
    ),
    dict(),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.nav.inventory}</h1>
          <p className="text-sm text-muted-foreground">{t.masterData.stockSelfUpdates}</p>
        </div>
        <Button asChild>
          <Link href="/entry">
            <PlusCircle className="size-4" aria-hidden />
            {t.nav.newEntry}
          </Link>
        </Button>
      </div>

      {/* Tiles describe the whole business; the table below describes the filter. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t.dashboard.stockValue}
          value={moneyFromDb(summary.totalValue)}
          icon={Boxes}
        />
        <CountTile
          label={t.masterData.productCountLabel}
          value={summary.productCount}
          suffix={t.masterData.countSuffix}
          icon={Layers}
        />
        <CountTile
          label={t.messages.lowStock}
          value={summary.lowStockCount}
          suffix={t.masterData.countSuffix}
          tone={summary.lowStockCount > 0 ? "due" : "neutral"}
          icon={AlertTriangle}
          href="/inventory?low=1"
        />
        <CountTile
          label={t.masterData.outOfStock}
          value={summary.outOfStockCount}
          suffix={t.masterData.countSuffix}
          tone={summary.outOfStockCount > 0 ? "debit" : "neutral"}
          icon={PackageX}
        />
      </div>

      <Card>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t.actions.search}</span>
              <input
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder={t.masterData.nameOrCode}
                className="h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{t.masterData.productKindLabel}</span>
              <select
                name="kind"
                defaultValue={params.kind ?? ""}
                className="h-11 cursor-pointer rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <option value="">{t.masterData.all}</option>
                {PRODUCT_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t.productKind[option]}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button type="submit" block>
                {t.actions.filter}
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <input
                type="checkbox"
                name="low"
                value="1"
                defaultChecked={lowOnly}
                className="size-4 cursor-pointer accent-[var(--color-primary)]"
              />
              {t.masterData.onlyLowStock}
            </label>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.masterData.productCountTitle(String(products.length))}</CardTitle>
        </CardHeader>

        {/* An operator can post entries but not invent master data, and a
            control they are not allowed to use is worse than no control. */}
        {can(session, "product.manage") ? (
          <CardBody className="pt-0">
            <AddProductPanel units={units} categories={categories} />
          </CardBody>
        ) : null}

        {products.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={t.emptyStates.noProducts}
            hint={t.masterData.addProductHint}
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
                    <TH>{t.fields.product}</TH>
                    <TH>{t.masterData.kindColumn}</TH>
                    <TH numeric>{t.masterData.stockColumn}</TH>
                    <TH numeric>{t.fields.avgCost}</TH>
                    <TH numeric>{t.masterData.stockValueColumn}</TH>
                    <TH numeric>{t.fields.minStock}</TH>
                    <TH numeric>{t.fields.salePrice}</TH>
                  </TR>
                </THead>
                <tbody>
                  {products.map((product) => {
                    const quantity = qtyFromDb(product.quantity);
                    const minimum = qtyFromDb(product.minStockLevel);
                    const low = minimum > 0n && quantity <= minimum;

                    return (
                      <TR key={product.id}>
                        <TD>
                          <Link
                            href={`/inventory/${product.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {product.nameBn}
                          </Link>
                          {product.sku ? (
                            <span className="num ml-2 text-xs text-subtle-foreground">
                              {product.sku}
                            </span>
                          ) : null}
                        </TD>
                        <TD className="text-muted-foreground">{t.productKind[product.kind]}</TD>
                        <TD numeric>
                          <span className={low ? "num text-due" : "num"}>
                            {formatQty(quantity, { unit: product.unitSymbol })}
                          </span>
                          {low ? (
                            <Badge tone="due" className="ml-2">
                              {quantity <= 0n ? t.masterData.empty : t.messages.lowStock}
                            </Badge>
                          ) : null}
                        </TD>
                        <TD numeric>
                          <MoneyText value={moneyFromDb(product.avgCost)} size="sm" symbol={false} />
                        </TD>
                        <TD numeric>
                          <MoneyText value={moneyFromDb(product.value)} size="sm" symbol={false} />
                        </TD>
                        <TD numeric className="text-muted-foreground">
                          {formatQty(minimum, { unit: product.unitSymbol })}
                        </TD>
                        <TD numeric>
                          <MoneyText
                            value={moneyFromDb(product.salePrice)}
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
              {products.map((product) => {
                const quantity = qtyFromDb(product.quantity);
                const minimum = qtyFromDb(product.minStockLevel);
                const low = minimum > 0n && quantity <= minimum;

                return (
                  <MobileRow
                    key={product.id}
                    href={`/inventory/${product.id}`}
                    title={product.nameBn}
                    subtitle={`${t.productKind[product.kind]} · ${formatQty(quantity, {
                      unit: product.unitSymbol,
                    })}`}
                    meta={
                      low ? (
                        <Badge tone="due">
                          {quantity <= 0n ? t.masterData.empty : t.messages.lowStock}
                        </Badge>
                      ) : null
                    }
                    right={
                      <>
                        <MoneyText value={moneyFromDb(product.value)} size="sm" />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.masterData.average}{" "}
                          <MoneyText
                            value={moneyFromDb(product.avgCost)}
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
