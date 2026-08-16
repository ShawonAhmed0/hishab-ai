/**
 * কাস্টমার ও ভেন্ডর — who owes what, and the statement that proves it.
 *
 * The statement is built from `journal_lines`, not from the transaction totals.
 * That matters: a sale posts the full bill to the party's control account and
 * the payment against it separately, so the ledger shows "বিল ৮০,০০০" and
 * "পরিশোধ ৫০,০০০" as two movements — which is what a customer expects to see
 * on a বকেয়া বিবরণী, and what spec §13 asks for. Reading the transaction rows
 * instead would collapse them into one net line and lose the receipt.
 */
import { sql } from "drizzle-orm";
import { raw, tenantQuery, tenantRead, token, withTenant } from "@hishabai/db";
import type { PartyType, TransactionType } from "@hishabai/shared";
import type { TenantScope } from "./session";

export interface PartyRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  type: PartyType;
  /** What they owe us. Money scale. */
  receivable: string;
  /** What we owe them. */
  payable: string;
  totalSales: string;
  totalPurchases: string;
  totalReceived: string;
  totalPaid: string;
  creditLimit: string | null;
  lastTransactionAt: string | null;
}

export interface PartySummary {
  partyCount: number;
  withDueCount: number;
  totalReceivable: string;
  totalPayable: string;
}

export interface PartyListView {
  parties: PartyRow[];
  summary: PartySummary;
}

export interface PartyFilter {
  /** 'customer' also matches parties marked 'both', and so does 'vendor'. */
  type?: "customer" | "vendor";
  search?: string;
  /** Only those carrying a balance — the chase list. */
  dueOnly?: boolean;
}

/**
 * Lifetime totals come from the journal, not from `party_balances`.
 *
 * That table has total_sales / total_purchases / total_received / total_paid
 * columns, but `app.apply_journal_line` only ever maintains `receivable` and
 * `payable` — the other four are written once as zero and never touched again.
 * Reading them would put a permanent ৳0 next to "মোট বিক্রয়" on every profile.
 *
 * Summing the control-account lines instead gives the same four numbers from
 * the ledger that produced the balance, so they cannot disagree with it. One
 * grouped scan, joined once, rather than a subquery per party.
 */
const PARTY_TOTALS = `
  left join (
    select jl.party_id,
           coalesce(sum(jl.debit)  filter (where a.subtype = 'receivable'), 0) as billed_to,
           coalesce(sum(jl.credit) filter (where a.subtype = 'receivable'), 0) as received,
           coalesce(sum(jl.credit) filter (where a.subtype = 'payable'), 0)    as billed_by,
           coalesce(sum(jl.debit)  filter (where a.subtype = 'payable'), 0)    as paid
      from journal_lines jl
      join accounts a on a.id = jl.account_id
     where jl.company_id = app.current_company_id()
       and jl.party_id is not null
       and a.subtype in ('receivable', 'payable')
     group by jl.party_id
  ) m on m.party_id = p.id`;

const PARTY_COLUMNS = `
  p.id, p.name, p.phone, p.address, p.type::text as type,
  coalesce(pb.receivable, 0)::text as receivable,
  coalesce(pb.payable, 0)::text    as payable,
  coalesce(m.billed_to, 0)::text   as "totalSales",
  coalesce(m.billed_by, 0)::text   as "totalPurchases",
  coalesce(m.received, 0)::text    as "totalReceived",
  coalesce(m.paid, 0)::text        as "totalPaid",
  p.credit_limit::text             as "creditLimit",
  pb.last_transaction_at::text     as "lastTransactionAt"`;

/** Which side of the book this list is about. */
function dueColumn(type: PartyFilter["type"]): string {
  return type === "vendor" ? "pb.payable" : "pb.receivable";
}

function typeMatch(type: PartyFilter["type"]): string | null {
  if (!type) return null;
  // A party marked 'both' belongs in either list.
  return `(p.type = '${type}' or p.type = 'both')`;
}

function summarySql(filter: PartyFilter): string {
  const due = dueColumn(filter.type);
  const conditions = ["p.company_id = app.current_company_id()", "p.is_active"];
  const match = typeMatch(filter.type);
  if (match) conditions.push(match);

  return `
  (select json_build_object(
     'partyCount', count(*),
     'withDueCount', count(*) filter (where coalesce(${due}, 0) > 0),
     'totalReceivable', coalesce(sum(coalesce(pb.receivable, 0)), 0)::text,
     'totalPayable', coalesce(sum(coalesce(pb.payable, 0)), 0)::text)
     from parties p
     left join party_balances pb
       on pb.party_id = p.id and pb.company_id = p.company_id
    where ${conditions.join(" and ")}) as summary`;
}

function emptySummary(): PartySummary {
  return { partyCount: 0, withDueCount: 0, totalReceivable: "0", totalPayable: "0" };
}

export async function getParties(
  scope: TenantScope,
  filter: PartyFilter = {},
): Promise<PartyListView> {
  if (filter.search) return searchParties(scope, filter);

  const where = [tenantQuery`p.company_id = app.current_company_id()`, tenantQuery`p.is_active`];
  if (filter.type) {
    where.push(tenantQuery`(p.type = ${token(filter.type)} or p.type = 'both')`);
  }
  if (filter.dueOnly) {
    where.push(tenantQuery`coalesce(${raw(dueColumn(filter.type))}, 0) > 0`);
  }

  // Biggest debt first when chasing, alphabetical when browsing.
  const order = filter.dueOnly
    ? `t.${filter.type === "vendor" ? "payable" : "receivable"}::numeric desc`
    : "t.name";

  const rows = await tenantRead<{
    parties: PartyRow[] | null;
    summary: PartySummary | null;
  }>(
    scope,
    tenantQuery`
      select
        (select coalesce(json_agg(t order by ${raw(order)}), '[]'::json) from (
           select ${raw(PARTY_COLUMNS)}
             from parties p
             left join party_balances pb
               on pb.party_id = p.id and pb.company_id = p.company_id
             ${raw(PARTY_TOTALS)}
            where ${raw(where.join(" and "))}
         ) t) as parties,
        ${raw(summarySql(filter))}
    `,
  );

  return {
    parties: rows[0]?.parties ?? [],
    summary: rows[0]?.summary ?? emptySummary(),
  };
}

/**
 * The bound-parameter path, for when the user is searching by name or phone.
 *
 * Deliberately the same column list and the same totals join as the fast path —
 * written twice, these drift, and the first symptom is a profile showing
 * different numbers depending on whether you searched for it or clicked it.
 */
async function searchParties(
  scope: TenantScope,
  filter: PartyFilter,
): Promise<PartyListView> {
  return withTenant(scope, async (tx) => {
    const pattern = `%${filter.search}%`;
    const typeClause = filter.type
      ? sql`and (p.type = ${filter.type} or p.type = 'both')`
      : sql``;
    const dueClause = filter.dueOnly
      ? sql.raw(`and coalesce(${dueColumn(filter.type)}, 0) > 0`)
      : sql``;

    const rows = (await tx.execute(sql`
      select ${sql.raw(PARTY_COLUMNS)}
        from parties p
        left join party_balances pb
          on pb.party_id = p.id and pb.company_id = p.company_id
        ${sql.raw(PARTY_TOTALS)}
       where p.company_id = app.current_company_id()
         and p.is_active
         and (p.name ilike ${pattern} or p.phone ilike ${pattern})
         ${typeClause}
         ${dueClause}
       order by p.name
    `)) as unknown as PartyRow[];

    const summaryRows = (await tx.execute(
      sql.raw(`select ${summarySql(filter)}`),
    )) as unknown as { summary: PartySummary | null }[];

    return {
      parties: rows,
      summary: summaryRows[0]?.summary ?? emptySummary(),
    };
  });
}

/**
 * Within one voucher, the charge is listed before its settlement.
 *
 * A sale posts the bill and the payment on the same date, in the same
 * transaction, so date and creation time tie and the sort falls through to a
 * random UUID. Half the time the receipt landed first and the statement opened
 * with a negative balance — ৳50,000 received against a bill that had not
 * appeared yet.
 *
 * Which side is the charge depends on the party: a customer's bill is a debit
 * to receivable, a vendor's is a credit to payable.
 */
const BILL_BEFORE_PAYMENT = `
  case when a.subtype = 'receivable'
       then (case when jl.debit > 0 then 0 else 1 end)
       else (case when jl.credit > 0 then 0 else 1 end)
  end`;

export interface LedgerEntry {
  id: string;
  date: string;
  voucherNo: string | null;
  transactionId: string | null;
  transactionType: TransactionType | null;
  status: string | null;
  narration: string | null;
  /** What increased their debt to us (a bill). Money scale. */
  debit: string;
  /** What reduced it (a receipt). */
  credit: string;
  /** Balance after this line, oldest to newest. */
  balance: string;
}

export interface PartyLedgerView {
  party: PartyRow;
  entries: LedgerEntry[];
}

/**
 * The বকেয়া বিবরণী: every movement against this party's control account, with
 * the balance carried down.
 *
 * The running total is computed by Postgres rather than in the page, so the
 * printed statement and the maintained `party_balances` row are two readings of
 * the same journal instead of two independent calculations that can drift.
 */
export async function getPartyLedger(
  scope: TenantScope,
  partyId: string,
): Promise<PartyLedgerView | null> {
  const rows = await tenantRead<{
    party: PartyRow | null;
    entries: LedgerEntry[] | null;
  }>(
    scope,
    tenantQuery`
      select
        (select row_to_json(t) from (
           select ${raw(PARTY_COLUMNS)}
             from parties p
             left join party_balances pb
               on pb.party_id = p.id and pb.company_id = p.company_id
             ${raw(PARTY_TOTALS)}
            where p.company_id = app.current_company_id()
              and p.id = ${partyId}::uuid
         ) t) as party,

        (select coalesce(json_agg(t order by t.seq), '[]'::json) from (
           select jl.id,
                  jl.date::text as date,
                  tr.voucher_no as "voucherNo",
                  jl.transaction_id as "transactionId",
                  tr.type::text as "transactionType",
                  tr.status::text as status,
                  coalesce(jl.narration, tr.description) as narration,
                  jl.debit::text  as debit,
                  jl.credit::text as credit,
                  sum(jl.debit - jl.credit) over (
                    order by jl.date, tr.created_at, ${raw(BILL_BEFORE_PAYMENT)}, jl.id
                    rows between unbounded preceding and current row
                  )::text as balance,
                  row_number() over (
                    order by jl.date, tr.created_at, ${raw(BILL_BEFORE_PAYMENT)}, jl.id
                  ) as seq
             from journal_lines jl
             join accounts a on a.id = jl.account_id
             left join transactions tr on tr.id = jl.transaction_id
            where jl.company_id = app.current_company_id()
              and jl.party_id = ${partyId}::uuid
              and a.subtype in ('receivable', 'payable')
         ) t) as entries
    `,
  );

  const party = rows[0]?.party;
  if (!party) return null;

  return { party, entries: rows[0]?.entries ?? [] };
}
