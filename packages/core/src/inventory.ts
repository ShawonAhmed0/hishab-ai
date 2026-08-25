/**
 * ইনভেন্টরি — what is on hand, what it is worth, and how it got there.
 *
 * Nothing here computes stock. The posting engine already stamped every
 * movement with the quantity, average cost and stock value that followed it, so
 * this reads that history back rather than re-deriving it. A stock screen that
 * recalculated its own numbers could disagree with the ledger, which is the one
 * thing it must never do.
 */
import { sql } from "drizzle-orm";
import { raw, tenantQuery, tenantRead, token, withTenant } from "@hishabai/db";
import type { ProductKind, StockMovementType } from "@hishabai/shared";
import type { TenantScope } from "./session";

export interface InventoryProduct {
  id: string;
  nameBn: string;
  nameEn: string | null;
  sku: string | null;
  kind: ProductKind;
  unitSymbol: string;
  unitNameBn: string;
  /** Qty scale (6dp) as a string, like every quantity crossing this boundary. */
  quantity: string;
  avgCost: string;
  value: string;
  minStockLevel: string;
  salePrice: string;
  purchasePrice: string;
}

export interface InventorySummary {
  productCount: number;
  /** Money scale. Must agree with the inventory control account. */
  totalValue: string;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface InventoryView {
  products: InventoryProduct[];
  summary: InventorySummary;
  /** The create form's dropdowns, carried on the same trip as the list. */
  units: { id: string; nameBn: string; symbol: string }[];
  categories: { id: string; nameBn: string }[];
}

export interface InventoryFilter {
  kind?: ProductKind;
  search?: string;
  /** Only items at or below their minimum level — the reorder list. */
  lowOnly?: boolean;
}

/**
 * The summary counts every active product, not just the filtered rows.
 *
 * Filtering to কাঁচামাল and seeing "মোট স্টক ভ্যালু" drop would read as stock
 * having disappeared. The tiles describe the business; the table describes the
 * filter.
 */
const SUMMARY = `
  (select json_build_object(
     'productCount', count(*),
     'totalValue', coalesce(sum(coalesce(ps.value, 0)), 0)::text,
     'lowStockCount', count(*) filter (
       where pr.min_stock_level > 0 and coalesce(ps.quantity, 0) <= pr.min_stock_level),
     'outOfStockCount', count(*) filter (where coalesce(ps.quantity, 0) <= 0))
     from products pr
     left join product_stock ps
       on ps.product_id = pr.id and ps.company_id = pr.company_id
    where pr.company_id = app.current_company_id() and pr.is_active) as summary`;

/**
 * What the "নতুন পণ্য" form has to offer. Same fragment in both query paths,
 * for the same reason `PRODUCT_COLUMNS` is: two copies drift.
 */
const CHOICES = `
  (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
     select id, name_bn as "nameBn", symbol from units
      where company_id = app.current_company_id() and is_active) t) as units,
  (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
     select id, name_bn as "nameBn" from product_categories
      where company_id = app.current_company_id() and is_active) t) as categories`;

const PRODUCT_COLUMNS = `
  pr.id, pr.name_bn as "nameBn", pr.name_en as "nameEn", pr.sku,
  pr.kind::text as kind,
  u.symbol as "unitSymbol", u.name_bn as "unitNameBn",
  coalesce(ps.quantity, 0)::text as quantity,
  coalesce(ps.avg_cost, 0)::text as "avgCost",
  coalesce(ps.value, 0)::text as value,
  pr.min_stock_level::text as "minStockLevel",
  pr.sale_price::text as "salePrice",
  pr.purchase_price::text as "purchasePrice"`;

export async function getInventory(
  scope: TenantScope,
  filter: InventoryFilter = {},
): Promise<InventoryView> {
  // Free text has to be bound by the driver, so a search costs the transaction.
  // Browsing and filtering — the common case — stays on the one-trip read.
  if (filter.search) return searchInventory(scope, filter);

  const where = [tenantQuery`pr.company_id = app.current_company_id()`, tenantQuery`pr.is_active`];
  if (filter.kind) where.push(tenantQuery`pr.kind = ${token(filter.kind)}`);
  if (filter.lowOnly) {
    where.push(
      tenantQuery`pr.min_stock_level > 0 and coalesce(ps.quantity, 0) <= pr.min_stock_level`,
    );
  }

  const rows = await tenantRead<{
    products: InventoryProduct[] | null;
    summary: InventorySummary | null;
    units: InventoryView["units"] | null;
    categories: InventoryView["categories"] | null;
  }>(
    scope,
    tenantQuery`
      select
        (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
           select ${raw(PRODUCT_COLUMNS)}
             from products pr
             join units u on u.id = pr.unit_id
             left join product_stock ps
               on ps.product_id = pr.id and ps.company_id = pr.company_id
            where ${raw(where.join(" and "))}
         ) t) as products,
        ${raw(SUMMARY)},
        ${raw(CHOICES)}
    `,
  );

  return {
    products: rows[0]?.products ?? [],
    summary: rows[0]?.summary ?? emptySummary(),
    units: rows[0]?.units ?? [],
    categories: rows[0]?.categories ?? [],
  };
}

function emptySummary(): InventorySummary {
  return { productCount: 0, totalValue: "0", lowStockCount: 0, outOfStockCount: 0 };
}

/**
 * The bound-parameter path, for when the user is searching by name or SKU.
 *
 * Same column list as the fast path on purpose — two copies drift, and the
 * first symptom is a stock figure that changes depending on how you got to it.
 */
async function searchInventory(
  scope: TenantScope,
  filter: InventoryFilter,
): Promise<InventoryView> {
  return withTenant(scope, async (tx) => {
    const pattern = `%${filter.search}%`;
    const kindClause = filter.kind ? sql`and pr.kind = ${filter.kind}` : sql``;
    const lowClause = filter.lowOnly
      ? sql.raw("and pr.min_stock_level > 0 and coalesce(ps.quantity, 0) <= pr.min_stock_level")
      : sql``;

    const rows = (await tx.execute(sql`
      select ${sql.raw(PRODUCT_COLUMNS)}
        from products pr
        join units u on u.id = pr.unit_id
        left join product_stock ps
          on ps.product_id = pr.id and ps.company_id = pr.company_id
       where pr.company_id = app.current_company_id()
         and pr.is_active
         and (pr.name_bn ilike ${pattern}
              or pr.name_en ilike ${pattern}
              or pr.sku ilike ${pattern})
         ${kindClause}
         ${lowClause}
       order by pr.name_bn
    `)) as unknown as InventoryProduct[];

    const summaryRows = (await tx.execute(
      sql.raw(`select ${SUMMARY}, ${CHOICES}`),
    )) as unknown as {
      summary: InventorySummary | null;
      units: InventoryView["units"] | null;
      categories: InventoryView["categories"] | null;
    }[];

    return {
      products: rows,
      summary: summaryRows[0]?.summary ?? emptySummary(),
      units: summaryRows[0]?.units ?? [],
      categories: summaryRows[0]?.categories ?? [],
    };
  });
}

export interface StockMovementRow {
  id: string;
  date: string;
  movementType: StockMovementType;
  /** "in" or "out". */
  direction: string;
  quantity: string;
  rate: string;
  value: string;
  quantityAfter: string;
  avgCostAfter: string;
  stockValueAfter: string;
  voucherNo: string | null;
  transactionId: string | null;
  partyName: string | null;
}

export interface ProductDetailView {
  product: InventoryProduct;
  movements: StockMovementRow[];
}

/**
 * One product with the movement history behind its current figure.
 *
 * `quantity_after` and `avg_cost_after` come straight off each row, so the
 * table reads as an audit trail: every line shows what the balance became, and
 * the newest line has to equal the headline figure.
 *
 * That only holds when the rows are read in **posting** order, which is what
 * those stamps were computed in — so the sort is `created_at`, not
 * `occurred_at`. The two used to be the same thing, because `occurred_at` was
 * left to its `now()` default; it now carries the entry's own date, so a
 * back-dated চালান sorts into the middle of the history while its stamp was
 * calculated against the stock as it stood when it was typed. Sorting by date
 * would leave the balance column jumping backwards and forwards for no reason
 * a reader could see.
 *
 * The date shown is still the entry's. A log of what was recorded, in the order
 * it was recorded, each line saying when it actually happened.
 */
export async function getProductDetail(
  scope: TenantScope,
  productId: string,
): Promise<ProductDetailView | null> {
  const rows = await tenantRead<{
    product: InventoryProduct | null;
    movements: StockMovementRow[] | null;
  }>(
    scope,
    tenantQuery`
      select
        (select row_to_json(t) from (
           select ${raw(PRODUCT_COLUMNS)}
             from products pr
             join units u on u.id = pr.unit_id
             left join product_stock ps
               on ps.product_id = pr.id and ps.company_id = pr.company_id
            where pr.company_id = app.current_company_id()
              and pr.id = ${productId}::uuid
         ) t) as product,

        (select coalesce(json_agg(t order by t.sort_at desc, t.id desc), '[]'::json) from (
           select sm.id,
                  sm.occurred_at::date::text as date,
                  sm.movement_type as "movementType",
                  sm.direction,
                  sm.quantity::text as quantity,
                  sm.rate::text as rate,
                  sm.value::text as value,
                  sm.quantity_after::text as "quantityAfter",
                  sm.avg_cost_after::text as "avgCostAfter",
                  sm.stock_value_after::text as "stockValueAfter",
                  tr.voucher_no as "voucherNo",
                  sm.transaction_id as "transactionId",
                  p.name as "partyName",
                  sm.created_at as sort_at
             from stock_movements sm
             left join transactions tr on tr.id = sm.transaction_id
             left join parties p on p.id = tr.party_id
            where sm.company_id = app.current_company_id()
              and sm.product_id = ${productId}::uuid
            order by sm.created_at desc, sm.id desc
            limit 200
         ) t) as movements
    `,
  );

  const product = rows[0]?.product;
  if (!product) return null;

  return { product, movements: rows[0]?.movements ?? [] };
}
