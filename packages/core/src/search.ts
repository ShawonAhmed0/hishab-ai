/**
 * গ্লোবাল সার্চ — one box over parties, products and vouchers.
 *
 * This is the one read in the app that cannot use `tenantRead`: the query is
 * arbitrary user text, and the one-round-trip path deliberately refuses to
 * interpolate anything that is not a uuid, a date or an integer. So it runs
 * through `withTenant` with bound parameters — four round trips instead of one,
 * paid on a keystroke the user chose to make rather than on every page load.
 *
 * A number is searched as an amount as well as a string, because "80000" is how
 * somebody looks for the ৳80,000 sale they half remember.
 */
import { sql } from "drizzle-orm";
import { withTenant } from "@hishabai/db";
import type { PartyType, TransactionStatus, TransactionType } from "@hishabai/shared";
import type { Session } from "./session";

export interface SearchPartyHit {
  id: string;
  name: string;
  phone: string | null;
  type: PartyType;
  receivable: string;
  payable: string;
}

export interface SearchProductHit {
  id: string;
  nameBn: string;
  unitSymbol: string;
  quantity: string;
  salePrice: string;
}

export interface SearchTransactionHit {
  id: string;
  voucherNo: string;
  type: TransactionType;
  status: TransactionStatus;
  date: string;
  total: string;
  memoNo: string | null;
  partyName: string | null;
}

export interface SearchResults {
  query: string;
  parties: SearchPartyHit[];
  products: SearchProductHit[];
  transactions: SearchTransactionHit[];
  total: number;
}

const EMPTY: Omit<SearchResults, "query"> = {
  parties: [],
  products: [],
  transactions: [],
  total: 0,
};

export async function search(session: Session, rawQuery: string): Promise<SearchResults> {
  const query = rawQuery.trim();
  // One character matches most of the database and helps nobody.
  if (query.length < 2) return { query, ...EMPTY };

  const pattern = `%${query}%`;
  // Only when the whole term is a number — "1,20,000" and "80000" both count,
  // "SALE-000001" does not.
  const digits = query.replace(/[,\s]/g, "");
  const amount = /^\d+(\.\d+)?$/.test(digits) ? digits : null;

  const rows = await withTenant(session, async (tx) =>
    tx.execute(sql`
      select
        (select coalesce(json_agg(t order by t.name), '[]'::json) from (
          select p.id, p.name, p.phone, p.type::text as type,
                 coalesce(pb.receivable, 0)::text as receivable,
                 coalesce(pb.payable, 0)::text as payable
            from parties p
            left join party_balances pb
              on pb.party_id = p.id and pb.company_id = p.company_id
           where p.company_id = app.current_company_id()
             and p.is_active
             and (p.name ilike ${pattern} or p.phone ilike ${pattern})
           limit 20
        ) t) as parties,

        (select coalesce(json_agg(t order by t."nameBn"), '[]'::json) from (
          select pr.id, pr.name_bn as "nameBn", u.symbol as "unitSymbol",
                 coalesce(ps.quantity, 0)::text as quantity,
                 pr.sale_price::text as "salePrice"
            from products pr
            join units u on u.id = pr.unit_id
            left join product_stock ps
              on ps.product_id = pr.id and ps.company_id = pr.company_id
           where pr.company_id = app.current_company_id()
             and pr.is_active
             and pr.name_bn ilike ${pattern}
           limit 20
        ) t) as products,

        (select coalesce(json_agg(t order by t.date desc), '[]'::json) from (
          select tr.id, tr.voucher_no as "voucherNo", tr.type::text as type,
                 tr.status::text as status, tr.date::text as date,
                 tr.total::text as total, tr.memo_no as "memoNo",
                 pt.name as "partyName"
            from transactions tr
            left join parties pt on pt.id = tr.party_id
           where tr.company_id = app.current_company_id()
             and (
               tr.voucher_no ilike ${pattern}
               or tr.memo_no ilike ${pattern}
               or tr.description ilike ${pattern}
               or pt.name ilike ${pattern}
               ${
                 amount
                   ? // People remember the taka and not the poisha, so "12222"
                     // has to find ৳12,222.22. Truncating rather than matching
                     // a substring keeps "1" from returning the whole ledger.
                     sql`or tr.total = ${amount}::numeric
                         or trunc(tr.total) = ${amount}::numeric`
                   : sql``
               }
             )
           order by tr.date desc, tr.created_at desc
           limit 25
        ) t) as transactions
    `),
  );

  const raw = (rows as unknown as {
    parties: SearchPartyHit[] | null;
    products: SearchProductHit[] | null;
    transactions: SearchTransactionHit[] | null;
  }[])[0];

  const parties = raw?.parties ?? [];
  const products = raw?.products ?? [];
  const transactions = raw?.transactions ?? [];

  return {
    query,
    parties,
    products,
    transactions,
    total: parties.length + products.length + transactions.length,
  };
}
