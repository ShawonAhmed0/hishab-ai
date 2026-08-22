/**
 * Everything the user is asked about before an entry posts — spec R2.1, R2.2
 * and R4.2.
 *
 * One module and, more to the point, **one query**: inside the posting
 * transaction every statement is a serial round trip, and all of these
 * questions are about the same thing — what this party's recent entries look
 * like. Asking them separately would cost three trips to say the same sentence.
 *
 * The same entry, twice — spec R2.1 and R2.2.
 *
 * Two different problems that share one query:
 *
 *   - **The same চালান number.** A refusal. The number is on the piece of
 *     paper; if it is already in the books, this entry is that entry. Backed
 *     by a real unique index (`transactions_memo_unique_idx` in
 *     `02_integrity.sql`), because an application check loses the race with a
 *     double-tapped save button.
 *   - **The same everything else.** A question. Same party, same day, same
 *     products, same total — probably a double save, but a customer ordering
 *     the same ten sacks twice on a Thursday is an ordinary Thursday, so this
 *     one confirms and proceeds rather than blocking.
 *
 * One query for both. It runs inside the posting transaction, where every
 * statement is a serial round trip, so a second probe would cost a second one.
 */
import { sql } from "drizzle-orm";
import type { Transaction as Tx } from "@hishabai/db";
import {
  DEFAULT_CONFIRM_POLICY,
  ZERO,
  cmpMoney,
  formatMoney,
  money,
  moneyFromDb,
  moneyToDb,
  scaleMoney,
  type BlockedReason,
  type ConfirmPolicy,
  type Money,
  type TransactionInput,
} from "@hishabai/shared";

/** The already-saved entry this one looks like. */
export interface DuplicateCandidate {
  id: string;
  voucherNo: string;
  /** ISO instant it was saved, formatted by whoever shows it. */
  savedAt: string;
  total: string;
}

export class DuplicateMemoError extends Error {
  readonly reason: BlockedReason;
  constructor(memoNo: string, voucher?: string) {
    super(`Memo ${memoNo} already exists${voucher ? ` on ${voucher}` : ""}`);
    this.name = "DuplicateMemoError";
    this.reason = voucher
      ? { rule: "duplicateMemo", memoNo, voucher }
      : { rule: "duplicateMemoNumber", memoNo };
  }
}

/**
 * The unique index firing, rather than the probe above catching it.
 *
 * Two saves of the same চালান arriving together both read an empty table and
 * both proceed; the index is what actually stops the second one. postgres.js
 * puts the index name in `constraint_name`, and matching on it rather than on
 * `23505` alone keeps an unrelated unique violation from being reported as a
 * duplicate memo.
 */
export function isDuplicateMemoViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; constraint_name?: unknown };
  return e.code === "23505" && e.constraint_name === "transactions_memo_unique_idx";
}

/**
 * Thrown when the entry looks like one already saved and the caller has not
 * said to go ahead. Carries the candidate so the dialog can link to it.
 */
export class ProbableDuplicateError extends Error {
  readonly candidate: DuplicateCandidate;
  constructor(candidate: DuplicateCandidate) {
    super(`Probable duplicate of ${candidate.voucherNo}`);
    this.name = "ProbableDuplicateError";
    this.candidate = candidate;
  }
}

/** Why the amount looked wrong, so the dialog can say which it was. */
export interface UnusualAmount {
  /** The entry's total, formatted. */
  total: string;
  /** What this party usually spends, formatted — absent for a new party. */
  usual?: string;
  trigger: "absolute" | "multiple";
}

/**
 * The typo guard — spec R4.2. A question, never a refusal: a genuinely large
 * order is a good day, not a mistake.
 */
export class UnusualAmountError extends Error {
  readonly detail: UnusualAmount;
  constructor(detail: UnusualAmount) {
    super(`Unusual amount ${detail.total} (${detail.trigger})`);
    this.name = "UnusualAmountError";
    this.detail = detail;
  }
}

/**
 * The products the entry names.
 *
 * Unordered: both sides of the comparison are sorted by Postgres, in the same
 * collation, rather than one here and one there — sorting uuid text in JS and
 * in the database is the kind of agreement that holds until a collation
 * changes underneath it.
 */
function productSet(input: TransactionInput): string[] {
  const ids = new Set<string>();
  if ("lines" in input) for (const line of input.lines) ids.add(line.productId);
  if (input.type === "production") {
    for (const line of input.inputs) ids.add(line.productId);
    for (const line of input.outputs) ids.add(line.productId);
  }
  if (input.type === "stock_adjustment") {
    for (const line of input.adjustments) ids.add(line.productId);
  }
  return [...ids];
}

/**
 * Candidate columns are nullable: the baseline row comes back on its own when
 * there is no candidate to join to it.
 */
interface Row extends Record<string, unknown> {
  id: string | null;
  voucher_no: string | null;
  created_at: string | null;
  total: string | null;
  memo_no: string | null;
  memo_match: boolean | null;
  looks_identical: boolean | null;
  /** This party's average over their last few entries of this type. */
  baseline: string | null;
}

/**
 * Refuses a repeated চালান number, and reports a probable duplicate.
 *
 * `is not distinct from` rather than `=` on the party: two আয় entries with no
 * party at all still have to be compared, and `null = null` is null.
 */
export async function checkForDuplicates(
  tx: Tx,
  args: {
    companyId: string;
    input: TransactionInput;
    /** The engine's total, not the browser's. */
    total: Money;
    /** Set once the user has seen the probable-duplicate dialog and said yes. */
    confirmDuplicate?: boolean;
    /** Set once they have seen the typo guard and said the figure is right. */
    confirmUnusual?: boolean;
    policy?: ConfirmPolicy;
  },
): Promise<void> {
  const { companyId, input } = args;
  const memoNo = input.memoNo ?? null;
  const partyId = "partyId" in input ? (input.partyId ?? null) : null;
  // Joined rather than bound as an array: the driver sends a one-element JS
  // array as a scalar, which Postgres then refuses to read as text[]. The ids
  // are uuids the schema has already validated, so there is nothing in them a
  // comma could split wrongly.
  const products = productSet(input).join(",");
  const total = moneyToDb(args.total);

  const policy = args.policy ?? DEFAULT_CONFIRM_POLICY;
  const guarding = !args.confirmUnusual && (policy.largeAmount > 0 || policy.largeMultiple > 0);

  // Nothing left to ask about: no number that could repeat, no duplicate to
  // raise, and no figure to sanity-check.
  if (memoNo === null && args.confirmDuplicate && !guarding) return;

  // One statement, two questions. `baseline` is joined on rather than selected
  // alongside the candidates, because it has to come back even when there are
  // no candidates at all — an entry with no duplicate still has a figure worth
  // sanity-checking.
  const rows = (await tx.execute<Row>(sql`
    with baseline as (
      select round(avg(recent.total), 4)::text as value
        from (
          select r.total
            from transactions r
           where r.company_id = ${companyId}::uuid
             and r.party_id is not distinct from ${partyId}::uuid
             and r.type = ${input.type}::transaction_type
             and r.status <> 'cancelled'
             and r.reversal_of_id is null
           order by r.date desc, r.created_at desc
           limit 10
        ) recent
    ),
    candidates as (
      select
          t.id,
          t.voucher_no,
          -- ISO with an explicit Z. A plain cast to text on a timestamptz
          -- gives "2026-08-20 00:31:12+00", which is neither ISO nor parsed
          -- the same way by every JS engine.
          to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
          t.total::text as total,
          t.memo_no,
          (${memoNo}::text is not null and t.memo_no = ${memoNo}::text) as memo_match,
          (
            t.type = ${input.type}::transaction_type
            and t.date = ${input.date}::date
            and t.total = ${total}::numeric
            and coalesce((
                  select array_agg(distinct tl.product_id::text order by tl.product_id::text)
                    from transaction_lines tl
                   where tl.transaction_id = t.id
                     and tl.product_id is not null
                ), array[]::text[])
                = coalesce((
                  select array_agg(distinct x order by x)
                    from unnest(string_to_array(nullif(${products}::text, ''), ',')) as x
                ), array[]::text[])
          ) as looks_identical
        from transactions t
       where t.company_id = ${companyId}::uuid
         and t.status <> 'cancelled'
         and t.reversal_of_id is null
         and t.party_id is not distinct from ${partyId}::uuid
         and (
               (${memoNo}::text is not null and t.memo_no = ${memoNo}::text)
               or (
                 t.type = ${input.type}::transaction_type
                 and t.date = ${input.date}::date
                 and t.total = ${total}::numeric
               )
             )
       order by memo_match desc, t.created_at desc
       limit 5
    )
    select c.*, b.value as baseline
      from baseline b
      left join candidates c on true
  `)) as unknown as Row[];

  const repeated = rows.find((row) => row.memo_match === true);
  if (repeated) throw new DuplicateMemoError(memoNo!, repeated.voucher_no ?? "");

  if (args.confirmDuplicate) return;

  if (!args.confirmDuplicate) {
    const identical = rows.find((row) => row.looks_identical === true);
    if (identical) {
      throw new ProbableDuplicateError({
        id: identical.id!,
        voucherNo: identical.voucher_no!,
        savedAt: identical.created_at!,
        total: identical.total!,
      });
    }
  }

  if (guarding) assertAmountLooksRight(args.total, rows[0]?.baseline ?? null, policy);
}

/**
 * The typo guard — spec R4.2.
 *
 * Two triggers rather than one number. The absolute figure is what catches
 * ৳1,00,000 typed where ৳10,000 was meant for a customer nobody has any
 * history for; the multiple is what catches the same slip at a business where
 * ৳1,00,000 is an ordinary Tuesday and an absolute threshold would either nag
 * all day or be set so high it never fires.
 *
 * The multiple wins when both fire, because "eight times what they usually
 * spend" tells the person more than "over a lakh" does.
 */
function assertAmountLooksRight(
  total: Money,
  baselineRaw: string | null,
  policy: ConfirmPolicy,
): void {
  const baseline = baselineRaw === null ? null : moneyFromDb(baselineRaw);

  if (baseline !== null && baseline > ZERO && policy.largeMultiple > 0) {
    const ceiling = scaleMoney(baseline, BigInt(Math.round(policy.largeMultiple * 100)), 100n);
    if (cmpMoney(total, ceiling) > 0) {
      throw new UnusualAmountError({
        total: formatMoney(total),
        usual: formatMoney(baseline),
        trigger: "multiple",
      });
    }
  }

  if (policy.largeAmount > 0) {
    const ceiling = money(String(policy.largeAmount));
    if (cmpMoney(total, ceiling) > 0) {
      throw new UnusualAmountError({ total: formatMoney(total), trigger: "absolute" });
    }
  }
}
