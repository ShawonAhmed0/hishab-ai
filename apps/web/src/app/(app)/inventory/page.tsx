import Link from "next/link";
import { AlertTriangle, Boxes, PackageX, Layers, PlusCircle } from "lucide-react";
import { getInventory } from "@hishabai/core";
import {
  PRODUCT_KINDS,
  bn,
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
import { sessionWithData } from "@/lib/session";
import { AddProductPanel } from "@/components/master-data/create-forms";

export const metadata = { title: bn.nav.inventory };

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

  const {
    data: { products, summary, units, categories },
  } = await sessionWithData((scope) =>
    getInventory(scope, {
      ...(kind ? { kind } : {}),
      ...(params.q ? { search: params.q } : {}),
      lowOnly,
    }),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{bn.nav.inventory}</h1>
          <p className="text-sm text-muted-foreground">
            স্টক প্রতিটি এন্ট্রির সাথে নিজে থেকেই আপডেট হয়
          </p>
        </div>
        <Button asChild>
          <Link href="/entry">
            <PlusCircle className="size-4" aria-hidden />
            {bn.nav.newEntry}
          </Link>
        </Button>
      </div>

      {/* Tiles describe the whole business; the table below describes the filter. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={bn.dashboard.stockValue}
          value={moneyFromDb(summary.totalValue)}
          icon={Boxes}
        />
        <CountTile label="পণ্যের সংখ্যা" value={summary.productCount} suffix="টি" icon={Layers} />
        <CountTile
          label={bn.messages.lowStock}
          value={summary.lowStockCount}
          suffix="টি"
          tone={summary.lowStockCount > 0 ? "due" : "neutral"}
          icon={AlertTriangle}
          href="/inventory?low=1"
        />
        <CountTile
          label="স্টক শেষ"
          value={summary.outOfStockCount}
          suffix="টি"
          tone={summary.outOfStockCount > 0 ? "debit" : "neutral"}
          icon={PackageX}
        />
      </div>

      <Card>
        <CardBody>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">{bn.actions.search}</span>
              <input
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="পণ্যের নাম বা কোড"
                className="h-11 rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">পণ্যের ধরন</span>
              <select
                name="kind"
                defaultValue={params.kind ?? ""}
                className="h-11 cursor-pointer rounded-md border border-border-strong bg-surface px-3 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <option value="">সব</option>
                {PRODUCT_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {bn.productKind[option]}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button type="submit" block>
                {bn.actions.filter}
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
              শুধু যেগুলোর স্টক সর্বনিম্নে নেমেছে
            </label>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{products.length} টি পণ্য</CardTitle>
        </CardHeader>

        <CardBody className="pt-0">
          <AddProductPanel units={units} categories={categories} />
        </CardBody>

        {products.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={bn.emptyStates.noProducts}
            hint="উপরে পণ্য যোগ করুন, বা ক্রয় এন্ট্রির মধ্যেই যোগ করে নিন"
            action={
              <Button asChild size="sm">
                <Link href="/entry">{bn.nav.newEntry}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{bn.fields.product}</TH>
                    <TH>ধরন</TH>
                    <TH numeric>স্টক</TH>
                    <TH numeric>{bn.fields.avgCost}</TH>
                    <TH numeric>স্টক ভ্যালু</TH>
                    <TH numeric>{bn.fields.minStock}</TH>
                    <TH numeric>{bn.fields.salePrice}</TH>
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
                        <TD className="text-muted-foreground">{bn.productKind[product.kind]}</TD>
                        <TD numeric>
                          <span className={low ? "num text-due" : "num"}>
                            {formatQty(quantity, { unit: product.unitSymbol })}
                          </span>
                          {low ? (
                            <Badge tone="due" className="ml-2">
                              {quantity <= 0n ? "শেষ" : bn.messages.lowStock}
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
                    subtitle={`${bn.productKind[product.kind]} · ${formatQty(quantity, {
                      unit: product.unitSymbol,
                    })}`}
                    meta={
                      low ? (
                        <Badge tone="due">
                          {quantity <= 0n ? "শেষ" : bn.messages.lowStock}
                        </Badge>
                      ) : null
                    }
                    right={
                      <>
                        <MoneyText value={moneyFromDb(product.value)} size="sm" />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          গড়{" "}
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
