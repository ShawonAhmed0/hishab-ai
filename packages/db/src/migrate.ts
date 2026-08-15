/**
 * Applies drizzle's generated table migrations, then the hand-written SQL that
 * drizzle-kit cannot express: row-level security, the balance triggers, the
 * balanced-entry constraint and the company bootstrap function.
 *
 * The hand-written files are idempotent (`create or replace`, `drop … if
 * exists`) so re-running them after a schema change is always safe.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "./client";

const here = fileURLToPath(new URL(".", import.meta.url));

async function main(): Promise<void> {
  // DDL needs the owner. The runtime role deliberately cannot create tables or
  // alter policies — see 04_grants.sql.
  const adminUrl = process.env["SUPABASE_DB_ADMIN_URL"];
  if (adminUrl) process.env["DATABASE_URL"] = adminUrl;

  const db = getDb();

  console.log("→ applying table migrations");
  await migrate(db, { migrationsFolder: join(here, "..", "migrations") });

  const sqlDir = join(here, "sql");
  const files = (await readdir(sqlDir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`→ applying ${file}`);
    const contents = await readFile(join(sqlDir, file), "utf8");
    await db.execute(sql.raw(contents));
  }

  console.log("✓ database is up to date");
  await closeDb();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});
