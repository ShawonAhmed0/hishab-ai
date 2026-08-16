/**
 * One-time bootstrap of the runtime database role.
 *
 * Run once per environment:
 *   node --env-file=.env.local scripts/create-app-role.mjs
 *
 * Creates `hishabai_app` — a login role with NOBYPASSRLS — and rewrites
 * .env.local so DATABASE_URL points at it while the owner connection moves to
 * SUPABASE_DB_ADMIN_URL for migrations.
 *
 * This matters more than it looks: Supabase's `postgres` role has BYPASSRLS,
 * which silently defeats FORCE ROW LEVEL SECURITY. Every policy still reports
 * as enabled while enforcing nothing.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import postgres from "postgres";

const ENV_PATH = ".env.local";
const ROLE = "hishabai_app";

const adminUrl = process.env.SUPABASE_DB_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("Set DATABASE_URL (owner connection) before running this.");
  process.exit(1);
}

const admin = new URL(adminUrl);
if (admin.username.split(".")[0] === ROLE) {
  console.error(
    `DATABASE_URL already points at ${ROLE}. Set SUPABASE_DB_ADMIN_URL to the owner connection and re-run.`,
  );
  process.exit(1);
}

const password = randomBytes(24).toString("base64url");
const sql = postgres(adminUrl, { prepare: false, onnotice: () => {} });

try {
  const [{ rolname } = {}] = await sql.unsafe(
    `select rolname from pg_roles where rolname = '${ROLE}'`,
  );

  if (rolname) {
    await sql.unsafe(
      `alter role ${ROLE} with login nobypassrls password '${password}'`,
    );
    console.log(`↻ rotated password for existing role ${ROLE}`);
  } else {
    await sql.unsafe(
      `create role ${ROLE} with login nobypassrls password '${password}'`,
    );
    console.log(`✓ created role ${ROLE} (nobypassrls)`);
  }

  const [check] = await sql.unsafe(
    `select rolbypassrls, rolsuper from pg_roles where rolname = '${ROLE}'`,
  );
  if (check.rolbypassrls || check.rolsuper) {
    throw new Error(`${ROLE} must not be superuser or bypass RLS`);
  }
} finally {
  await sql.end();
}

// --- rewrite .env.local ------------------------------------------------------

if (!existsSync(ENV_PATH)) {
  console.error(`${ENV_PATH} not found.`);
  process.exit(1);
}
copyFileSync(ENV_PATH, `${ENV_PATH}.bak`);

// The pooler expects <role>.<project-ref> as the username.
const projectRef = admin.username.includes(".")
  ? admin.username.split(".").slice(1).join(".")
  : admin.hostname.split(".")[1];

const appUrl = `postgresql://${ROLE}.${projectRef}:${encodeURIComponent(password)}@${admin.host}${admin.pathname}`;

let text = readFileSync(ENV_PATH, "utf8");

/**
 * Set a key whether or not it is already in the file.
 *
 * The earlier version only ever *replaced* an existing line, so a fresh
 * .env.local — which is exactly what you have when setting up a new project,
 * and what the setup instructions tell you to write — came out with no
 * DATABASE_URL at all, while this script still reported success. The app then
 * failed at the first query and the integration tests quietly skipped
 * themselves.
 */
function setKey(source, key, value, comment) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, "m").test(source)) {
    return source.replace(new RegExp(`^${key}=.*$`, "m"), line);
  }
  const prefix = source.endsWith("\n") || source === "" ? "" : "\n";
  return `${source}${prefix}\n${comment ? `# ${comment}\n` : ""}${line}\n`;
}

text = setKey(
  text,
  "SUPABASE_DB_ADMIN_URL",
  adminUrl,
  "Owner connection — migrations only. Has BYPASSRLS, so never used at runtime.",
);
text = setKey(
  text,
  "DATABASE_URL",
  appUrl,
  "Runtime connection — NOBYPASSRLS, so row-level security actually applies.",
);

writeFileSync(ENV_PATH, text);

// Read it back rather than trusting the edit: reporting success for a file we
// did not actually change is how this went wrong before.
const written = readFileSync(ENV_PATH, "utf8");
for (const [key, expected] of [
  ["DATABASE_URL", appUrl],
  ["SUPABASE_DB_ADMIN_URL", adminUrl],
]) {
  if (!written.includes(`${key}=${expected}`)) {
    console.error(`✗ ${key} was not written to ${ENV_PATH}. Set it by hand.`);
    process.exit(1);
  }
}

console.log(`✓ ${ENV_PATH} updated (backup at ${ENV_PATH}.bak)`);
console.log(`  DATABASE_URL          → ${ROLE}@${admin.host}`);
console.log(`  SUPABASE_DB_ADMIN_URL → ${admin.username.split(".")[0]}@${admin.host}`);
console.log("\nNow run:  npm run db:migrate   (applies grants to the new role)");
