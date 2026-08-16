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
 * Whether the driver may use prepared statements — worth one round trip in two
 * on every query that takes a parameter.
 *
 * Without them postgres.js has to Parse the statement, wait for the server to
 * describe it, and only then Bind and Execute. That is two network trips for
 * what should be one, and it applies to *every* parameterised query in the
 * application. Measured against Supavisor: 244ms with them off, 122ms with
 * them on, for `select $1::int`.
 *
 * They are safe in **session mode** (port 5432), where the pooler hands out a
 * dedicated Postgres backend for the life of the connection, so a statement
 * prepared on it is still there for the next query. In **transaction mode**
 * (port 6543) a connection is handed to a different backend between
 * statements, and a prepared statement would vanish underneath us — hence the
 * blanket "the pooler does not support prepared statements" advice, which is
 * only true for that mode.
 *
 * Defaulting off for anything we cannot positively identify as session mode
 * keeps the failure direction right: a needless round trip, never a runtime
 * "prepared statement does not exist".
 */
function supportsPreparedStatements(url: string): boolean {
  const override = process.env["DATABASE_PREPARE"];
  if (override) return override === "true";

  try {
    const { port, hostname } = new URL(url);
    // Direct (non-pooled) Postgres is always safe.
    if (!hostname.includes("pooler.supabase.com")) return true;
    return port === "5432";
  } catch {
    return false;
  }
}

/**
 * Turns prepared statements back on for the queries Drizzle sends.
 *
 * Drizzle runs *everything* through `client.unsafe(query, params)`, and
 * postgres.js hard-codes `prepare: false` inside `unsafe` regardless of what
 * the connection was configured with. So the `prepare` option alone buys
 * nothing here — the driver still pays a Parse/Describe trip before it can
 * Bind and Execute, doubling the latency of every parameterised query.
 *
 * The proxy only re-supplies the option Drizzle never passes. `begin` and
 * `savepoint` hand back a scoped client of their own, so those are re-wrapped
 * too or transactions would quietly fall back to the slow path.
 */
function withPreparedStatements(client: postgres.Sql): postgres.Sql {
  const wrap = (target: postgres.Sql): postgres.Sql =>
    new Proxy(target, {
      get(object, property, receiver) {
        if (property === "unsafe") {
          return (query: string, params: unknown[] = [], options: object = {}) =>
            (object as postgres.Sql).unsafe(query, params as never, {
              prepare: true,
              ...options,
            } as never);
        }

        // begin(fn) and begin(options, fn) — the callback receives the scoped
        // client, which needs the same treatment.
        if (property === "begin" || property === "savepoint") {
          return (...args: unknown[]) => {
            const index = args.findIndex((argument) => typeof argument === "function");
            if (index === -1) return (object as never as Record<string, Function>)[property]!(...args);

            const callback = args[index] as (scoped: postgres.Sql) => unknown;
            const patched = [...args];
            patched[index] = (scoped: postgres.Sql) => callback(wrap(scoped));
            return (object as never as Record<string, Function>)[property]!(...patched);
          };
        }

        return Reflect.get(object, property, receiver);
      },
    });

  return wrap(client);
}

/**
 * Lazy so that importing this module during a build — where no database is
 * reachable and none is needed — does not throw.
 */
export function getDb(): Database {
  if (!cache.database) {
    const url = connectionString();
    const prepare = supportsPreparedStatements(url);

    cache.client = postgres(url, {
      // Supavisor session mode caps a project at a small number of client
      // connections; a generous per-process pool exhausts it with two users.
      max: Number(process.env["DATABASE_POOL_MAX"] ?? 5),
      prepare,
      onnotice: () => {},
    });

    cache.database = drizzle(prepare ? withPreparedStatements(cache.client) : cache.client, {
      schema,
    });
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

// ---------------------------------------------------------------------------
// One-round-trip tenant reads
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The only values allowed to be written into a `tenantRead` statement.
 *
 * These queries go over the simple query protocol, which has no bind
 * parameters — so anything that varies has to be part of the SQL text. Rather
 * than hand-roll string escaping, this refuses everything that is not
 * unambiguously safe to write literally: a UUID, an ISO date, or an integer.
 * There is no escaping to get wrong because nothing that would need escaping
 * gets through.
 *
 * Free text (a search box, a name) is deliberately not representable here.
 * Those queries keep using `withTenant`, where the driver binds them properly.
 */
export type TenantLiteral = string | number | TenantFragment;

/** SQL that is already text, not a value to be quoted. */
class TenantFragment {
  constructor(readonly sql: string) {}
}

/**
 * A bare `snake_case` token, for an enum value that has already been checked
 * against a constant list. It cannot contain a quote, space or semicolon, so
 * there is nothing to break out of.
 */
export function token(value: string): TenantFragment {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`tenant read: ${JSON.stringify(value)} is not a bare token`);
  }
  return new TenantFragment(`'${value}'`);
}

/**
 * SQL assembled from other `tenantQuery` fragments — composing a where clause
 * out of optional filters, not a place to put a request value.
 */
export function raw(sql: string): TenantFragment {
  return new TenantFragment(sql);
}

function literal(value: TenantLiteral): string {
  if (value instanceof TenantFragment) return value.sql;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`tenant read: ${value} is not an integer`);
    }
    return String(value);
  }
  if (UUID.test(value) || ISO_DATE.test(value)) return `'${value}'`;
  throw new Error(
    "tenant read: only UUIDs, ISO dates and integers may be interpolated — " +
      "use withTenant for anything else",
  );
}

/** Builds the statement text for `tenantRead`, validating every value. */
export function tenantQuery(
  strings: TemplateStringsArray,
  ...values: TenantLiteral[]
): string {
  return strings.reduce(
    (out, part, index) =>
      out + part + (index < values.length ? literal(values[index]!) : ""),
    "",
  );
}

/**
 * A tenant-scoped read in **one** network round trip.
 *
 * `withTenant` costs four — BEGIN, the set_config, the query, COMMIT — and
 * against a database in another region that is most of a page load spent
 * waiting rather than working. Postgres runs a multi-statement simple query as
 * a single implicit transaction, so sending the context and the query as one
 * batch keeps `set_config(..., true)` correctly scoped: measured, the setting
 * is gone again by the next query on the same pooled connection.
 *
 * Isolation is unchanged. The statement never names a company — it reads
 * `app.current_company_id()` — and `tenant_isolation` still requires
 * `app.is_member(company_id)`, so a company id from a stale or tampered cookie
 * returns zero rows exactly as before.
 *
 * Reads only. Writes stay on `withTenant`, where they get real transaction
 * control and bound parameters.
 */
export async function tenantRead<T>(
  context: TenantContext,
  statement: string,
): Promise<T[]> {
  if (!UUID.test(context.userId) || !UUID.test(context.companyId)) {
    throw new Error("tenant read: userId and companyId must be UUIDs");
  }

  getDb(); // ensure the pool exists
  const client = cache.client!;

  const results = (await client
    .unsafe(
      `select set_config('app.user_id', '${context.userId}', true),
              set_config('app.company_id', '${context.companyId}', true);
       ${statement}`,
    )
    .simple()) as unknown;

  // A multi-statement batch comes back as one result set per statement; ours
  // is the last. A single-statement batch comes back as the rows themselves.
  if (Array.isArray(results)) {
    const last = results.at(-1);
    if (Array.isArray(last)) return last as T[];
    return results as T[];
  }
  return [];
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
