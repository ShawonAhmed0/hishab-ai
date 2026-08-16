import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Held on globalThis, not in a module variable.
 *
 * Next's dev server re-evaluates modules on every hot reload. A module-level
 * singleton therefore builds a *new* connection pool each time and never closes
 * the last one, which exhausts a Supavisor session-mode pool within a few
 * edits — and then every page fails with MaxClientsInSessionMode.
 */
const GLOBAL_KEY = Symbol.for("hishabai.db");

interface GlobalCache {
  client?: postgres.Sql;
  database?: Database;
}

const cache: GlobalCache = ((globalThis as Record<symbol, unknown>)[GLOBAL_KEY] ??= {}) as GlobalCache;

function connectionString(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add the Supabase connection string.",
    );
  }
  return url;
}

/**
 * Lazy so that importing this module during a build — where no database is
 * reachable and none is needed — does not throw.
 */
export function getDb(): Database {
  if (!cache.database) {
    cache.client = postgres(connectionString(), {
      // Supavisor session mode caps a project at a small number of client
      // connections; a generous per-process pool exhausts it with two users.
      max: Number(process.env["DATABASE_POOL_MAX"] ?? 5),
      // Supabase's pooler does not support prepared statements.
      prepare: false,
      onnotice: () => {},
    });
    cache.database = drizzle(cache.client, { schema });
  }
  return cache.database;
}

export async function closeDb(): Promise<void> {
  await cache.client?.end();
  cache.client = undefined;
  cache.database = undefined;
}

export interface TenantContext {
  userId: string;
  companyId: string;
}

/**
 * Run work inside one transaction, as one user, scoped to one company.
 *
 * `set_config(..., true)` is transaction-local, so the identity cannot survive
 * into the next borrower of a pooled connection. Every RLS policy in
 * 01_security.sql reads these two settings, which means a query that forgets
 * its `where company_id = …` returns nothing rather than someone else's rows.
 *
 * Both settings go in one statement on purpose. Every statement here is a
 * network round trip, and against a database in another region that is ~120ms
 * each — so this is a wrapper worth counting the statements in. The floor is
 * three: BEGIN, this, COMMIT. The work itself should aim for one more.
 */
export async function withTenant<T>(
  context: TenantContext,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${context.userId}, true),
                 set_config('app.company_id', ${context.companyId}, true)`,
    );
    return work(tx);
  });
}

/**
 * For the handful of operations that legitimately precede company selection:
 * signing in, listing which companies you belong to, creating the first one.
 * Sets the user but no company, so tenant policies still deny everything.
 */
export async function withUser<T>(
  userId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}

export { schema };
