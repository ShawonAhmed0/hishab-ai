import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  ZERO_NUMERIC,
  createdAt,
  moneyColumn,
  occurredAt,
  primaryId,
  qtyColumn,
  updatedAt,
} from "./columns";
import { productKindEnum } from "./enums";
import { companies, profiles } from "./tenancy";

/** কেজি, পিস, রোল — configurable per company, spec §9. */
export const units = pgTable(
  "units",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    nameBn: varchar("name_bn", { length: 60 }).notNull(),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    /** How many decimals make sense: 3 for KG, 0 for পিস. */
    decimalPlaces: integer("decimal_places").notNull().default(3),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("units_company_symbol_idx").on(table.companyId, table.symbol)],
);

export const productCategories = pgTable(
  "product_categories",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    nameBn: varchar("name_bn", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [index("product_categories_company_idx").on(table.companyId)],
);

export const products = pgTable(
  "products",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 60 }),
    nameBn: varchar("name_bn", { length: 160 }).notNull(),
    nameEn: varchar("name_en", { length: 160 }),
    kind: productKindEnum("kind").notNull().default("finished_good"),
    categoryId: uuid("category_id").references(() => productCategories.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    purchasePrice: moneyColumn("purchase_price").notNull().default(ZERO_NUMERIC),
    salePrice: moneyColumn("sale_price").notNull().default(ZERO_NUMERIC),
    minStockLevel: qtyColumn("min_stock_level").notNull().default(ZERO_NUMERIC),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("products_company_kind_idx").on(table.companyId, table.kind, table.isActive),
    index("products_company_name_idx").on(table.companyId, table.nameBn),
    uniqueIndex("products_company_sku_idx").on(table.companyId, table.sku),
  ],
);

/**
 * Current stock, cached.
 *
 * Every value here is derivable from `stock_movements`, but the dashboard and
 * the entry form both need it on every keystroke, so it is maintained inside
 * the same transaction that writes the movement.
 */
export const productStock = pgTable(
  "product_stock",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: qtyColumn("quantity").notNull().default(ZERO_NUMERIC),
    /** Authoritative: this is what the inventory control account must agree with. */
    value: moneyColumn("value").notNull().default(ZERO_NUMERIC),
    /** Derived from value ÷ quantity, never carried forward independently. */
    avgCost: moneyColumn("avg_cost").notNull().default(ZERO_NUMERIC),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("product_stock_pk").on(table.companyId, table.productId),
    index("product_stock_quantity_idx").on(table.companyId, table.quantity),
  ],
);

/**
 * Every movement stamped with the running balance and average that resulted
 * from it, so stock history can be replayed and audited without recomputing
 * the whole chain.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    transactionId: uuid("transaction_id"),
    direction: varchar("direction", { length: 3 }).notNull(),
    movementType: varchar("movement_type", { length: 32 }).notNull(),
    quantity: qtyColumn("quantity").notNull(),
    rate: moneyColumn("rate").notNull().default(ZERO_NUMERIC),
    value: moneyColumn("value").notNull().default(ZERO_NUMERIC),
    quantityAfter: qtyColumn("quantity_after").notNull(),
    avgCostAfter: moneyColumn("avg_cost_after").notNull().default(ZERO_NUMERIC),
    stockValueAfter: moneyColumn("stock_value_after").notNull().default(ZERO_NUMERIC),
    occurredAt: occurredAt("occurred_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("stock_movements_product_idx").on(
      table.companyId,
      table.productId,
      table.occurredAt,
    ),
    index("stock_movements_transaction_idx").on(table.transactionId),
  ],
);

/** কাঁচামাল → উৎপাদিত পণ্য conversion rules, configurable per output product. */
export const productionRecipes = pgTable(
  "production_recipes",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    outputProductId: uuid("output_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    nameBn: varchar("name_bn", { length: 160 }),
    /** Expected good output as a percentage of input, e.g. 90 for the 450/500 case. */
    expectedYieldPercent: moneyColumn("expected_yield_percent"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("production_recipes_company_idx").on(table.companyId)],
);

export const productionRecipeInputs = pgTable(
  "production_recipe_inputs",
  {
    id: primaryId(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => productionRecipes.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantityPerUnit: qtyColumn("quantity_per_unit").notNull(),
  },
  (table) => [index("production_recipe_inputs_recipe_idx").on(table.recipeId)],
);

export const productsRelations = relations(products, ({ one }) => ({
  company: one(companies, {
    fields: [products.companyId],
    references: [companies.id],
  }),
  unit: one(units, { fields: [products.unitId], references: [units.id] }),
  category: one(productCategories, {
    fields: [products.categoryId],
    references: [productCategories.id],
  }),
  stock: one(productStock, {
    fields: [products.id],
    references: [productStock.productId],
  }),
}));

export type Unit = typeof units.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductStock = typeof productStock.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
