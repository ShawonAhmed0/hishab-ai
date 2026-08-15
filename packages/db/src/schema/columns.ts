import { sql } from "drizzle-orm";
import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Column shapes reused across every table.
 *
 * `numeric(18,4)` for money and `numeric(24,6)` for quantity: Postgres numeric
 * is exact, and drizzle hands it back as a string, which is precisely what the
 * fixed-point layer in @hishabai/shared wants to parse. No column in this
 * database is ever `double precision`.
 */
export const moneyColumn = (name: string) =>
  numeric(name, { precision: 18, scale: 4 });

export const qtyColumn = (name: string) => numeric(name, { precision: 24, scale: 6 });

export const primaryId = () =>
  uuid("id").primaryKey().default(sql`gen_random_uuid()`);

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Nullable moment — a cancellation date, a last-seen date. */
export const nullableAt = (name: string) =>
  timestamp(name, { withTimezone: true });

/** Present moment, required — when a payment or movement actually happened. */
export const occurredAt = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** Zero as the database sees it — used for every balance default. */
export const ZERO_NUMERIC = "0";
