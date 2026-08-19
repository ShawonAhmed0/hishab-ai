/**
 * The authorised override — spec R1.2.
 *
 * Since Phase 1 a handful of rules refuse an entry outright rather than
 * warning about it. That is only defensible if there is a way past them, and
 * the way past has three parts, all of which have to hold:
 *
 *   1. the session's role is admin;
 *   2. the person at the keyboard re-types a PIN *now* — a role check alone
 *      proves only that an admin logged in at some point today, and the
 *      screen may well be sitting unlocked on the counter;
 *   3. the fact is written to `audit_logs`, with the rule and the numbers.
 *
 * The PIN is verified here, on the server, against a hash that never leaves
 * it. There is no endpoint that returns it and no server component that
 * renders it — `hasOverridePin` answers whether one is set, and nothing else.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { overrideCredentials, withTenant, type Transaction as Tx } from "@hishabai/db";
import {
  blockedMessage,
  bn,
  isOverridable,
  overridePinSchema,
  type BlockedReason,
  type OverridableRule,
} from "@hishabai/shared";
import { requirePermission, type Session } from "./session";
import { writeAudit } from "./audit";

/**
 * scrypt with the parameters Node documents as interactive-login cost.
 *
 * Not bcrypt or argon2: both are native dependencies, and this is a four-digit
 * secret behind an already-authenticated session with a server-side attempt
 * path — the work factor is here to make a leaked table useless, not to hold
 * off an online guesser.
 */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(pin.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Constant-time, and false rather than throwing on a malformed stored value.
 *
 * A row that cannot be parsed is a row nobody can authenticate against, which
 * is the safe reading of it — throwing would turn a corrupt hash into a 500 on
 * a screen the user cannot get out of.
 */
export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
    return false;
  }

  const expected = Buffer.from(hash, "base64");
  let derived: Buffer;
  try {
    derived = scryptSync(pin.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, cost);
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export class OverrideError extends Error {
  readonly messageBn: string;
  readonly kind: "not_admin" | "no_pin" | "wrong_pin" | "not_overridable";

  constructor(kind: OverrideError["kind"], messageBn: string, messageEn: string) {
    super(messageEn);
    this.name = "OverrideError";
    this.kind = kind;
    this.messageBn = messageBn;
  }
}

/**
 * What the client sends alongside an entry it wants pushed through.
 *
 * `rules` is the list the person has actually been shown and agreed to, not a
 * blanket permission. An admin who was told "the wallet does not hold this"
 * and typed their PIN has authorised *that*; if the same entry then turns out
 * to bankrupt the company, they get told and asked again. One PIN, one dialog,
 * one rule — and the audit log has a row for each.
 */
export interface OverrideRequest {
  pin: string;
  rules: readonly OverridableRule[];
}

/**
 * Does this admin have a PIN set? The only question about it the client may
 * ask, and it is answered with a boolean.
 */
export async function hasOverridePin(tx: Tx, session: Session): Promise<boolean> {
  const [row] = await tx
    .select({ userId: overrideCredentials.userId })
    .from(overrideCredentials)
    .where(
      and(
        eq(overrideCredentials.companyId, session.companyId),
        eq(overrideCredentials.userId, session.userId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Proves the person at the keyboard may push past `rule`, and records that
 * they did.
 *
 * Called from inside the posting transaction, so an entry that rolls back for
 * some later reason leaves no audit row claiming an override that never took
 * effect — the same reasoning as `recordPostingWarnings`.
 */
export async function authoriseOverride(
  tx: Tx,
  session: Session,
  args: { request: OverrideRequest; reason: BlockedReason; transactionId?: string },
): Promise<OverridableRule> {
  const { request, reason } = args;

  if (!isOverridable(reason.rule)) {
    throw new OverrideError(
      "not_overridable",
      "এই বাধাটি এড়ানো যায় না।",
      `Rule ${reason.rule} cannot be overridden`,
    );
  }

  if (session.role !== "admin") {
    throw new OverrideError(
      "not_admin",
      "শুধু অ্যাডমিন এই বাধা এড়াতে পারেন।",
      "Only an admin may override a posting rule",
    );
  }

  const [row] = await tx
    .select({ pinHash: overrideCredentials.pinHash })
    .from(overrideCredentials)
    .where(
      and(
        eq(overrideCredentials.companyId, session.companyId),
        eq(overrideCredentials.userId, session.userId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new OverrideError(
      "no_pin",
      "ওভাররাইড PIN এখনো সেট করা হয়নি। সেটিংস থেকে সেট করুন।",
      "No override PIN is set for this admin",
    );
  }

  // Normalised here rather than at the boundary: ১২৩৪ typed on a Bengali
  // keyboard and 1234 typed on an English one are the same PIN.
  const parsed = overridePinSchema.safeParse(request.pin);
  if (!parsed.success || !verifyPin(parsed.data, row.pinHash)) {
    throw new OverrideError("wrong_pin", "PIN মেলেনি।", "Override PIN did not match");
  }

  await writeAudit(tx, session, {
    action: "override",
    entityType: "transaction",
    ...(args.transactionId ? { entityId: args.transactionId } : {}),
    // Bengali here on purpose: the audit row has no request locale, and the
    // log is read long after the session that wrote it has gone.
    summaryBn: `নিয়ম এড়ানো হয়েছে — ${blockedMessage(reason, bn)}`,
    after: { ...reason },
  });

  return reason.rule;
}

/**
 * Sets or replaces the caller's own override PIN.
 *
 * Only ever the caller's own: there is no path here that writes somebody
 * else's, because a PIN an admin did not choose themselves proves nothing
 * about who is standing at the keyboard.
 */
export async function setOverridePin(tx: Tx, session: Session, rawPin: unknown): Promise<void> {
  requirePermission(session, "settings.manage");
  if (session.role !== "admin") {
    throw new OverrideError(
      "not_admin",
      "শুধু অ্যাডমিন ওভাররাইড PIN সেট করতে পারেন।",
      "Only an admin may set an override PIN",
    );
  }

  const hash = hashPin(overridePinSchema.parse(rawPin));
  await tx
    .insert(overrideCredentials)
    .values({ companyId: session.companyId, userId: session.userId, pinHash: hash })
    .onConflictDoUpdate({
      target: [overrideCredentials.companyId, overrideCredentials.userId],
      set: { pinHash: hash, updatedAt: new Date() },
    });

  await writeAudit(tx, session, {
    action: "update",
    entityType: "override_credential",
    entityId: session.userId,
    summaryBn: "ওভাররাইড PIN সেট করা হয়েছে",
  });
}

/** `setOverridePin` with its own transaction, for the settings screen. */
export async function updateOverridePin(session: Session, rawPin: unknown): Promise<void> {
  await withTenant(session, (tx) => setOverridePin(tx, session, rawPin));
}

/**
 * Whether the caller has a PIN set — the only thing about it a page may read.
 *
 * Not the hash, not the length, not when it was set: a boolean is everything
 * the settings card needs to decide between "set one" and "change it".
 */
export async function overridePinIsSet(session: Session): Promise<boolean> {
  return withTenant(session, (tx) => hasOverridePin(tx, session));
}
