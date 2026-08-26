-- =============================================================================
-- Data repairs that have to run once, and are safe to run every time.
--
-- Everything here is idempotent by construction — it sets a value to what it
-- should already be — because `npm run migrate` re-applies this whole directory
-- on every run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stock_movements.occurred_at was never set, so it took its now() default.
--
-- স্টক রিপোর্ট filters on that column, so goods were counted into the period
-- the entry was *typed* in rather than the period it happened in. Back-dating a
-- চালান is ordinary practice here — a shop cashing up on Monday enters last
-- week — which is precisely why nobody noticed: the two dates usually fall in
-- the same month.
--
-- The application now writes the entry's own date. This brings the rows that
-- were written before it did into line with the transaction they belong to.
-- -----------------------------------------------------------------------------
update stock_movements sm
   set occurred_at = tr.date::timestamptz
  from transactions tr
 where tr.id = sm.transaction_id
   and sm.occurred_at <> tr.date::timestamptz;

-- -----------------------------------------------------------------------------
-- The single `other_cost` figure became a list — spec R3.4.
--
-- Entries posted before that carry the amount and its খাত in two columns on
-- `transactions`. Copying them into `transaction_costs` means the voucher has
-- one place to read from rather than two, and an old entry reprints with the
-- cost it was actually charged.
--
-- Only rows that named an account: an unnamed `other_cost` was capitalised into
-- the goods, so it was never a separate cost and has no row to become.
-- -----------------------------------------------------------------------------
insert into transaction_costs (company_id, transaction_id, account_id, amount, sort_order)
select tr.company_id, tr.id, tr.other_cost_account_id, tr.other_cost, 0
  from transactions tr
 where tr.other_cost_account_id is not null
   and tr.other_cost > 0
   and not exists (
     select 1 from transaction_costs tc where tc.transaction_id = tr.id
   );
