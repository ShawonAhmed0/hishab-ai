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
