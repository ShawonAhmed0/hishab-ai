# HishabAI

Bengali-first, multi-company business accounting SaaS for Bangladeshi
businesses. The governing principle is **"একবার লিখুন — বাকিটা HishabAI
করবে"**: the user makes one plain-language entry and the backend derives every
accounting, inventory and ledger consequence. The user must never need
accounting knowledge; the ledger underneath is still professional-grade double
entry.

```
apps/web/              Next.js 15 App Router — UI + Server Actions
packages/accounting/   the engine. pure, zero I/O. the only place money rules live
packages/core/         services = db + accounting, one function per use case
packages/db/           Drizzle schema, migrations, RLS policies, the client
packages/shared/       zod schemas, money/qty utils, the Bengali dictionary
```

Business logic lives in `packages/`, never in route files.

## Verify

```bash
npm test && npm run build
```

`npm test` needs `DATABASE_URL`; without it the integration tests **silently
skip** and you get 191 passing instead of 305. Check the count.

The suite is two vitest projects (`vitest.workspace.ts`): `packages` runs in
node, `web` runs the `.test.tsx` component tests in jsdom with its own setup
file. They are split because `setupFiles` in a shared config runs for *every*
test file — the jsdom shims were loaded into the node tests too, where
`Element` does not exist, and every pure test failed to collect. Note also that
`extends` **merges** arrays: an `include` left in the base config ran all of
`packages` a second time inside the jsdom project. Neither failure is loud, so
check which project a file ran under (`vitest run --project web`) if a count
looks wrong.

A schema change needs `npm run migrate -w @hishabai/db` before the integration
tests can see it — that runs as the owner via `SUPABASE_DB_ADMIN_URL`, applies
the drizzle migrations, then re-applies every file in `packages/db/src/sql`
(they are idempotent, which is why re-running after a policy edit is safe).

`npm run build`, not just `npm run typecheck` — `typedRoutes` types are
generated at build time, so `tsc -b` cannot see a bad `href` and will pass on
code that fails to build.

`npm run lint` does not work: `next lint` with no eslint config drops into an
interactive setup prompt. This codebase has never been linted.

**A test file inside `apps/web` breaks the production build if the app's
tsconfig can see it.** `next build` type-checks everything its config includes,
and the tests import vitest and @testing-library — devDependencies. Any install
that omits dev (which `NODE_ENV=production` on Vercel does) then fails with
"Cannot find module 'vitest'". `apps/web/tsconfig.json` excludes them and
`tsconfig.test.json` picks them back up, so they are still type-checked by
`npm run typecheck` and never by `next build`. Reproduce a Vercel build with
`npm ci --omit=dev && npm run build` in a fresh clone — a plain `npm ci` passes
either way and proves nothing.

## Money

Money and quantity are **branded bigints**, never floats.

| | scale | parse | from db |
|---|---|---|---|
| `Money` | 1e4 | `money("80000")` | `moneyFromDb(row.total)` |
| `Qty` | 1e6 | `qty("500")` | `qtyFromDb(row.quantity)` |

Arithmetic goes through `addMoney` / `subMoney` / `multiplyRate` /
`deriveRate` — `a + b` on two `Money` yields a plain `bigint` and the brand is
lost, which is a type error at the next call rather than a wrong number. The
two scales differ, so `amount / quantity` is wrong by 100×; `deriveRate` is
what converts between them.

Bengali numerals are **English digits with 2-2-3 grouping** — `1,20,000.00`.
This does not change with the language: `1,98,58,770` and `crore`/`lakh`, never
`19,858,770` and `million`. The grouping is how a Bangladeshi reader parses a
number, and ৳ stays ৳.

## Two languages, one dictionary

Bengali is the default and the source of truth. `packages/shared/src/i18n/bn.ts`
holds it, `Dictionary` is **derived** from that object, and
`packages/shared/src/i18n/en.ts` is annotated `const en: Dictionary` — so a key
added to Bengali and forgotten in English fails the build rather than leaving a
Bengali word on an English screen.

Parametrised messages are **functions**, not templates with a `{n}` in them:
Bengali puts the count before a classifier and English does not, so the two
locales need the number in different places and a shared template cannot serve
both. TypeScript does not check a function's arity on assignment, so
`i18n.test.ts` does, along with shape parity at runtime.

- **Server components** take the dictionary from `dict()` in
  `apps/web/src/lib/locale.server.ts`.
- **Client components** take it from `useT()`, which reads the locale out of
  the context the root layout sets.
- **Never call `useT()` from a component without `"use client"`.** `MoneyText`
  did, and every server-rendered report 500'd — the type checker cannot see it,
  only the browser can. A shared component takes what it needs as a prop.
- **A resolved label must never live at module scope.** `NAV_ITEMS` and the
  report index hold *keys*; a string there freezes whichever locale served the
  first request the process handled. The same applies to zod schemas whose
  messages come from the dictionary — build them per request.

The choice rides in a validated `hishabai_locale` cookie, read by the server so
there is no flash and no bootstrap script. Anything malformed falls back to
Bengali rather than throwing, for the reason the `hishabai_company` cookie
taught us: the bad value is resent on every retry, so a throw is unrecoverable
from inside the page that would let the user clear it.

Party, product, wallet and account names are **data, not dictionary**. They
come out of `nameBn` columns and stay exactly as the shopkeeper typed them in
both locales.

## The engine is pure

`packages/accounting` has no database, no network, no clock, no randomness. The
caller loads context, the engine only computes. That is what makes it testable
and what keeps AI out of arithmetic. Server is the only authority: the client
posts raw inputs and the server recomputes totals, due, COGS and average cost
from scratch, discarding any derived number the client sent.

**One documented exception**: `packages/core/src/opening-balance.ts`. An
opening balance is the only posting with no user decision behind it — Dr asset,
Cr opening-balance equity, always — so it is expressed in `core` rather than
derived by the engine.

### Never write a cache table without posting the journal

This has bitten three times, in the same shape every time:

- opening stock written straight into `product_stock`
- a wallet's opening balance written straight into `financial_accounts.balance`
- a party's opening due written straight into `party_balances`

Every time, every screen agreed — because they all read the cache — and the
ledger had never heard of the balance. A balance sheet would have been wrong
from day one. The party one was the loudest: the customer list showed ৳50,000
outstanding and the aging report, which reads the journal, showed nothing.

`product_stock`, `party_balances`, `account_balances` and
`financial_accounts.balance` are **derived**: maintained by trigger from
`journal_lines`. If you find yourself assigning one, post the entry instead —
`postOpeningBalance` in `packages/core/src/opening-balance.ts` is where all
three of these now go, and a journal line needs `party_id` set for the party
half of that trigger to fire at all.

Corollaries that follow from the same rule:

- **Reports read `journal_lines`**, not transaction rows. A cancelled voucher
  posts a mirror entry, so it nets to zero without any report knowing that
  cancellation exists.
- **`transactions.due_amount` is a posting-time snapshot**, never revisited
  when a later payment arrives. Aging it would show every bill as unpaid for
  ever.
- **`party_balances.total_sales` / `total_purchases` / `total_received` /
  `total_paid` are never written by anything.** Derive them from the journal.
- **Cancellation never deletes** (spec §18): `status='cancelled'` plus a
  mirror-image entry dated as the original, linked by `reversal_of_id`.

## Tenancy is two layers, and the second one is the real one

1. `withTenant(session, fn)` opens a transaction and sets `app.user_id` /
   `app.company_id`.
2. RLS policies read those settings, so a missing `WHERE company_id = …` in
   application code returns zero rows rather than another company's data.

**The app must never connect as `postgres` at runtime.** That role carries
BYPASSRLS, and BYPASSRLS overrides FORCE ROW LEVEL SECURITY — every policy goes
inert while `pg_class` still reports it enabled. Runtime connects as
`hishabai_app` (NOBYPASSRLS); `SUPABASE_DB_ADMIN_URL` is for local migrations
only and must never be set in Vercel.

Any new read path is a second way into the data and gets its own isolation
test rather than inheriting trust from the one beside it.

### RLS does not check the ids you *write*

A policy is `company_id = app.current_company_id()` — it checks the new row's
own company, and nothing else. A **foreign key is enforced by a trigger that
runs as the table owner, and that bypasses RLS entirely**, so a crafted
`account_id` or `party_id` belonging to another company satisfies both the
constraint and the insert policy and lands in this company's journal.

Every client-supplied id therefore gets proved against a company-scoped read
before it is used. `posting-context.ts` does this for the two the client
chooses — `categoryAccountId` and `other.entries[].accountId` — plus
`partyId`; products and wallets were already covered because the engine throws
when an id is missing from its context map. `recipes.ts` does the same for the
products a recipe names. A new user-chosen id is a new place to do it.

### One round trip, and what it costs

`tenantRead` + `tenantQuery` send the context and the query as a single
simple-protocol batch — one round trip instead of four. The price is that
`literal()` accepts **only** UUIDs, ISO dates and integers; anything else
throws. `token()` takes a checked snake_case enum, `raw()` composes fragments
already built from `tenantQuery`.

Arbitrary user text cannot go through it. That is why `search()` uses
`withTenant` with bound parameters and pays four round trips — on a keystroke
the user chose to make, rather than on every page load.

Prepared statements depend on the pooler port: **:5432 session mode** keeps a
dedicated backend and is safe, **:6543 transaction mode** is not.
`supportsPreparedStatements()` in `packages/db/src/client.ts` detects it by
port; Drizzle routes everything through `client.unsafe()`, which hard-codes
`prepare: false`, so a Proxy re-supplies the option.

## App Router notes

- **Underscore-prefixed folders are private** and not routable. A route at
  `api/_timing` silently 404s.
- `sessionWithData()` runs the session lookup and the page's data read in
  parallel, using the `hishabai_company` cookie as a hint and re-reading if the
  verified session disagrees. The cookie is UUID-validated: a malformed one
  used to 500 every page, unrecoverably, since the bad value was resent each
  time.
- The `x-hishabai-verified-user` header must always be stripped from inbound
  requests before middleware sets it.

## Still open

Vercel env (points at a deleted Supabase project; needs port 6543 and `bom1`),
the `/api/v1` Android surface (not started), and real voice/OCR (the parser in
`entry/voice-scan.tsx` is a heuristic stub — the review-and-confirm flow
around it is not).

WhatsApp delivery (spec R4.6) is **built and inert**. The queue, the transport,
the retry and the templates are all there and tested against a fake transport;
what is missing is a `WHATSAPP_*` token and Meta's approval of the template
bodies in `packages/shared/src/whatsapp.ts`. Until both exist, messages are
queued, logged and marked `skipped`.

R5.6's "assigned sales person" has no column to live in, so at-risk reminders
go to the admins.

## Refuse, but leave a door — and it is a door, not a hint

This section used to read "Warn, don't refuse", and for negative stock it no
longer does. **A sale of stock the books have not received is refused**
(`PostingError`, code `NEGATIVE_STOCK`), the transaction rolls back, and the
message names the product and both numbers: *"পর্যাপ্ত স্টক নেই। বর্তমান স্টক
১০০ কেজি, চাওয়া হয়েছে ১৫০ কেজি।"*

The old reasoning was that recording a sale before the matching চালান is normal
practice here, so refusing it was the app overruling the person at the counter.
That is still true of the *practice* — and it is why the door exists rather than
why the rule does not. What the warning could not do was stop the case it was
written for: stock walking out of the godown against an entry nobody ever made,
which no report can find afterwards because there is nothing to find. A warning
in a toast is read by whoever is not busy.

So: `allowNegativeStock` defaults to **false** everywhere, and is true in
exactly two places — `reverseTransaction`, because a cancellation must always be
postable no matter what stock has done since, and an entry an admin has
authorised. Everything else refuses.

Phase 3 extended the same treatment to four more rules, each with its own
`allow…` flag on `PostingContext` and each off by default:

| Rule | Refuses when | Reads |
|---|---|---|
| `negativeStock` | the books never received it | `product_stock`, by trigger |
| `insufficientFunds` | the wallet cannot cover a payment out | `financial_accounts.balance`, by trigger |
| `overCreditLimit` | the sale takes the party past their limit | `party_balances`, by trigger |
| `riskyParty` | their oldest unpaid bill is in the red band | `journal_lines`, on read |
| `negativeCapital` | the entry leaves equity below zero | `journal_lines`, on read |

`insufficientFunds` is checked **per wallet, running** — two ৳6,000 payments
out of ৳10,000 are each fine and together are not, and it is the second one the
message names. Money coming *in* is never checked; a wallet cannot be too full.

`negativeCapital` is checked in `build`, which every posting path funnels
through, so no entry type gets to skip it. The delta is `Σ(credit − debit)`
over the entry's own lines on equity, income and expense accounts — those three
are the same arithmetic once an expense is read as a negative. An entry that
raises equity, or moves none at all, is never refused: a purchase is asset for
liability and an insolvent company can still record one.

The credit limit **used to be a warning** and is now a refusal, and only when
the entry actually leaves something owing — a bill paid in full at the counter
puts nothing on the limit.

### The override

`packages/core/src/overrides.ts`. Three things have to hold, and a role check
alone is not one of them:

1. the session's role is `admin`;
2. the person re-types their PIN **now** — an admin session may well be sitting
   unlocked on the counter, so the role proves only that somebody logged in;
3. an `audit_logs` row with `action = 'override'` records the rule and the
   values, written inside the posting transaction so an entry that rolls back
   leaves no claim behind.

The request names **which rules** it authorises, and the server relaxes those
and nothing else. An admin who was told "the wallet does not hold this" and
typed their PIN has authorised *that*; if the entry then turns out to bankrupt
the company they are told and asked again. One dialog, one rule, one audit row
— `relaxationsFor` is where that mapping lives, and there is deliberately no
blanket "allow everything".

The PIN is scrypt-hashed in `override_credentials`, which is a table of its own
rather than a column on `company_members` — `membership_visibility` shows every
member row to every member, and **RLS is row-level, not column-level**, so a
hash there would be readable by exactly the colleague it exists to stop. Its
policy is `user_id = app.current_user_id()`. `overridePinIsSet` returns a
boolean and there is no path that returns anything more.

`createTransaction` posts, and if a rule refuses and an override was supplied,
posts *again* with that one rule relaxed. The engine is pure, so the second run
is free — and the audit row then names the rule that actually blocked and the
numbers it blocked over, rather than whatever the browser claimed was about to
happen. A rule that refuses again after being relaxed is a real failure.

### A refusal carries a reason, not a sentence

`PostingError` holds a `BlockedReason` — the rule, plus the values already
formatted (the number format is identical in both locales). `blockedMessage`
builds the sentence from whichever dictionary the request is being served in.
The engine cannot reach a dictionary and a Bengali sentence frozen into it would
be the `NAV_ITEMS` mistake in a new place; `messageBn` is a getter over the
Bengali dictionary, for logs and audit summaries that have no request locale.
Adding a rule to `BlockedReason` without a case in `blockedMessage` is a compile
error at the `never`.

## Naming a cost moves it

Spec R3.4. পরিবহন and লেবার on a purchase are **capitalised into the goods** —
landed cost, deliberately, and `transaction_lines.allocated_cost` exists for it.
That has not changed and should not: they are textbook product costs.

`otherCostAccountId` is different. "Other" is by definition the bucket that is
neither, and an unnamed lump buried in stock valuation is how stock value drifts
away from what the godown is actually worth. So when the user names it:

- **on a purchase** it is expensed to that খাত instead of going into the goods.
  What the vendor is owed is unchanged — only the debit side splits, and the
  stock movement is written at the capitalised figure alone;
- **on a sale** it is the income খাত the charge is billed to, instead of the
  generic অন্যান্য আয়.

Leave it unset and both behave exactly as before. It is a third client-chosen
id, so `collectAccountIds` proves it against a company-scoped read like the
other two — see "RLS does not check the ids you *write*".

A discount is the same shape: `discountType` says whether `discount` is taka or
a percentage, and the **server** resolves a percentage against its own subtotal.
`transactions.discount` holds the taka it came to; `discount_value` and
`discount_type` hold what the user actually typed, so a reprinted invoice still
says "10%" rather than a figure nobody at the counter recognises.

## Validation messages are keys, not sentences

`packages/shared/src/schemas.ts` is module scope, so a Bengali sentence in a
zod schema freezes whichever language served the process's first request into
every later one — the `NAV_ITEMS` mistake, in the place CLAUDE.md already
warned it would come back. The schemas carry `validation.*` keys and
`validationMessage(message, t)` resolves them against the request's dictionary.

zod's own "Required" is mapped too, through a global `setErrorMap` — it is by
far the most common message in the app, and threading an `errorMap` through
every `.parse` call is the kind of thing you forget once and never see again.

The same schema now runs **in the browser before submit**, so an empty entry
comes back with a message against each field instead of a round trip and a
banner. The server parses it again regardless: this is convenience, not
authority.

Two things in `field.tsx` are load-bearing and easy to undo by accident:

- `ErrorSummary` renders its title even with an empty error list. It used to
  bail, which meant a refusal carrying only a summary — a repeated চালান
  number, a rule the user cannot override — displayed **nothing at all**.
- `Select` blurs itself on wheel. A focused `<select>` changes its value when
  the wheel passes over it, so scrolling back down a long form silently
  reselected products and units. That is the R4.5 "inputs change on every
  selection" bug, and the banner focusing with `preventScroll` is its other
  half.

## One gate, and one query behind it

Spec R4.2. Every "are you sure?" on নতুন এন্ট্রি renders through a single
`Dialog` in `entry-form.tsx`, switched on the *kind* of question — an override
needs a PIN and is blocking, a duplicate carries a link, a large amount carries
a comparison, the final confirmation carries the total. Three dialogs is how
the wording, the buttons and the dismiss behaviour drift apart.

The state is one payload plus a `gate` **derived from the last reply**, so the
banner and the dialog cannot disagree about what happened.

Behind it, `packages/core/src/confirmations.ts` asks all of it in **one
statement**. Inside the posting transaction every statement is a serial round
trip, and the duplicate check and the typo guard are the same question about
the same rows. The party's baseline is `left join`ed onto the candidates rather
than selected beside them, because it has to come back even when there are no
candidates — an entry with no duplicate still has a figure worth checking.

The typo guard has **two triggers and no single global number**:

- an absolute figure (৳1,00,000 by default), which is what catches ৳1,00,000
  typed where ৳10,000 was meant for a party nobody has any history for;
- a multiple of that party's own recent average (5× by default), which catches
  the same slip at a business where a lakh is an ordinary Tuesday.

Either set to 0 turns it off. The multiple wins when both fire, because "eight
times what they usually spend" tells the person more than "over a lakh" does.
`confirmEveryEntry` is off by default: a second tap on every entry is a cost
paid by the person who makes no mistakes as well as the one who does.

## Ageing is derived, every time

`packages/core/src/ageing.ts`. A party's band is computed from `journal_lines`
on read and stored nowhere: a band in a column is right the day it is written
and wrong the morning after, which is the cache mistake in its fourth costume.

`transactions.due_amount` is no use here either — it is a posting-time snapshot
never revisited when the payment lands, so ageing it would report every bill as
unpaid for ever.

Settlement is **FIFO**: a payment pays off the oldest bill, so what is still
outstanding is the *newest* set of charges. The age that matters is the date at
which the running total of charges, counted newest first, first covers the
outstanding balance. That is what the window function in `loadAgeing` computes,
and the band boundaries are a pure function beside it so they can be tested at
the day.

The thresholds live in `companies.settings` (`creditPolicyFrom`), because "30
days" is a trading convention rather than a fact. `creditPeriodDays` defaults to
**0**, so out of the box "overdue" means "outstanding" and the bands fire at 30
and 60 days from the bill itself — which is what those numbers read as to a
shopkeeper. Anything malformed in that jsonb falls back to the default rather
than throwing: a bad settings blob must not be able to stop every entry in the
company.

## The same entry, twice

Two different things, and they get different answers.

**A repeated চালান number is refused.** `transactions_memo_unique_idx` in
`02_integrity.sql`, not an application check — a double-tapped save button wins
that race every time. `voucher_no` already had a unique index; it is generated.
`memo_no` is the number printed on the paper, typed by hand, and that is the one
that gets entered twice.

Three things about that index are load-bearing:

- It is scoped to **(company, party, memo)**, not to the company alone. On a
  sale the number is ours; on a purchase it is the *vendor's*, and two vendors
  both numbering their চালান from 1 is Tuesday, not a mistake. `coalesce` folds
  the no-party case (আয়, ব্যয়) into the same index.
- It **excludes `reversal_of_id is not null`**. Cancellation copies `memo_no`
  onto the mirror entry by design, so without this every cancellation of a
  numbered entry would fail.
- It **excludes cancelled rows**, so a number entered wrongly and cancelled can
  be entered again — which is the next thing the shopkeeper does.

**The same everything else is a question, not a refusal.** Same party, same day,
same products, same total: probably a double save, but a customer ordering the
same ten sacks twice on a Thursday is an ordinary Thursday. `ProbableDuplicate`
carries the existing voucher so the dialog can link to it, and
`confirmDuplicate` waves it through. It never waves through a repeated চালান
number.

Both live in `packages/core/src/duplicates.ts` and share **one query**, because
inside the posting transaction every statement is a serial round trip.

## Alerts are states; notifications are events

`notifications` holds events — the engine's own `PostingWarning`s, written
inside the posting transaction so a rolled-back entry leaves none behind.
"স্টক কমে গেছে" is not one of those: it is true exactly while the stock is
low and stops being true when a purchase lands. Storing it would be the cache
mistake again, in a new table. So low stock, aged receivables and negative
wallets are **derived on read** in `notifications.ts` and there is nothing to
go stale. Aged receivables come from `journal_lines`, not
`transactions.due_amount`, for the reason above.

## WhatsApp: queue inside the transaction, send outside it

`packages/core/src/delivery.ts`, `delivery-events.ts`, and the templates in
`packages/shared/src/whatsapp.ts`. Spec R4.6 says delivery is **outside** the
posting transaction and must never roll back or block an entry. That is half
the rule, and taken alone it produces the other bug: a WhatsApp message telling
a customer their order was recorded, for an order that rolled back.

So the two halves are split, and they pull in opposite directions:

- **Queueing is inside** the posting transaction — a `message_deliveries` row
  written beside the journal lines, so a refused entry takes its messages down
  with it. Nothing has been sent, so nothing has to be unsent. Same reasoning
  as `recordPostingWarnings`.
- **Sending is after the commit**, in its own transaction, and `flushDeliveries`
  **never throws**. By the time it runs the entry is safe; an exception escaping
  would turn a Meta outage into a failed save on screen for an entry that was in
  fact recorded. The web layer calls it from `after()` so it does not even cost
  the user the response.

Everything Meta sends is a **template**: outside a 24-hour window they reject
free text, and this app messages people who have never written to it. The bodies
therefore live in the repo as constants — they have to exist before they can be
submitted for approval, and the copy that ships must be the copy that was
approved or the send is rejected. Both locales register under the *same*
template name with different language codes, which is how Meta models a
translation.

With `WHATSAPP_*` unset the transport is **inert**, and rows are marked
`skipped` rather than left `pending`. A backlog of "your order was recorded"
messages delivered three weeks late, on the day somebody finally pastes in a
token, is worse than never sending them. The log still records every message the
app wanted to send and why it did not — including a party whose phone number
cannot be parsed, which is written as `skipped` rather than dropped, because
"the number in their record is not a number" is the answer somebody will want.

`toE164` is worth its tests: a number that fails to normalise does not throw, it
delivers to nobody, quietly.

Two events have no posting to hang off — a daily summary happens because the day
ended, and a customer turns yellow because *nothing happened*. `queueDailySummary`
and `queueAtRiskReminders` are called by `runDailyJobs`, behind
`GET /api/cron/daily`, which `vercel.json` schedules at 14:30 UTC — 20:30 in
Dhaka, after a trading day has closed. Both refuse to queue the same thing twice
on the same day, because a cron that fires twice is a Tuesday.

**That guard has to compare Dhaka's day.** `created_at` is a timestamptz, and a
bare `::date` renders it in the session time zone — UTC on a hosted Postgres —
so between midnight and 6 a.m. local it lands on yesterday, never matches
`todayIso()`, and the guard silently never fires. A retried cron then sent the
summary twice. It is the same UTC-vs-Dhaka trap `calendar.ts` was written for,
and it was invisible until a test ran the job twice in one call.

### A cron has no session, and must not have BYPASSRLS

RLS checks `app.user_id` on every row, and there is no user behind a clock. The
tempting fix — let the runtime role bypass RLS — turns every policy in the
application inert while `pg_class` still reports them enabled, which is exactly
what `04_grants.sql` exists to prevent.

So `app.scheduled_job_targets()` is SECURITY DEFINER and returns the narrowest
thing that answers the question: one active admin per active company, as
`(company_id, user_id)` pairs and nothing else — no names, no balances, no rows
from any tenant table. Each company's work then runs in an ordinary
`withTenant` transaction as that admin, so every policy applies normally, the
job reaches exactly as far as one real person already could, and what it writes
is attributed to them rather than to "the system". A target naming a company
the user is not in does not fail — it returns nothing and does nothing, which
is the policies working.

The route fails **closed**: with `CRON_SECRET` unset it answers 503 rather than
running. An open endpoint that messages every customer of every company is not
something to protect with obscurity, and the token is compared with
`timingSafeEqual` after a length check, because that function throws rather
than returning false when the lengths differ.

R5.6 asks for the reminder to reach "the assigned sales person". **There is no
such column** — `parties` has no owner — so it goes to the admins. That is the
gap to close first if this is picked up again.

## Nothing happening is what changes a customer's status

`packages/core/src/activity.ts` and `customer-health.ts`. Spec R5.1 asks for a
`last_order_date` per customer and a traffic light over it. There is no such
column and there should not be: a customer's status is the **worst** thing in
this codebase to cache, because the event that changes it is the absence of an
event. No trigger fires when somebody does not order, so a stored status is
right on the morning it is written and wrong every morning after.

An "order" is a debit on the receivable control account carrying the party id —
what a sale posts, gross, before any payment against it. A return credits that
account and so is not one; a cash sale is one, which is right.

### "Entered the band today" needs no stored yesterday

R5.4 wants today's new entrants, and the obvious way to get them is to keep
yesterday's band and diff. That is the cache mistake in a fifth costume, and it
is not needed. The day counter goes up by exactly one every morning, so a
customer crossed a threshold on the single day their counter **equals** it —
`daysSince === doubtfulDays + 1`, `daysOverdue === slowPayerDays`. Yesterday it
was one less, tomorrow one more. `enteredBandToday` and `crossedAgeingToday`
are that, and both are pure so the boundary is testable at the day.

Two consequences worth keeping:

- a company that changes its thresholds gets the new answer on the next page
  load, instead of a backlog of rows computed under the old ones;
- a **volume drop** (R5.3) has no crossing day at all — it depends on two
  rolling windows that both move — so those customers are reported as their own
  list rather than given a date the derivation cannot prove.

`party_balances.receivable` *is* read here, and that is not a contradiction:
reading a trigger-maintained cache is fine, writing one is not. How **old** the
balance is still cannot come from there, and does not — that is `ageing.ts`.

The thresholds are `ActivityPolicy` in `companies.settings`, because "materially
below their own average" is a trade, not a constant. `volumeDropPercent` at 0
turns R5.3 off.

## Every figure on the dashboard leads somewhere

Spec R5.7. A tile that cannot be opened is a number the user has to trust. Each
one now links to the report that produced it — the wallet tiles to ক্যাশ বই
filtered by *kind* (the tile is the sum of every wallet of that kind, not one
account), the month tiles to লাভ-ক্ষতি for that range, বকেয়া to the aging
report, and each chart month to that month's লাভ-ক্ষতি or বিক্রয় রেজিস্টার.

Those reports all read `journal_lines`, so the drill-down inherits the property
that matters: a cancelled voucher nets to zero on the way down without anything
in the chain knowing that cancellation exists.

Two mechanical notes. A **chart segment is a mouse target only**, so the same
month links are rendered as real anchors under each chart — the drill-down has
to be reachable by keyboard. And a client component cannot receive a function
prop from a server one, so the hrefs are built server-side and travel *in* the
`ChartPoint` data; `typedRoutes` types them as `Route` rather than `string` so
a bad path is a build error rather than a 404 somebody finds later.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes_tool` or `query_graph_tool` instead of Grep
- **Understanding impact**: `get_impact_radius_tool` instead of manually tracing imports
- **Code review**: `detect_changes_tool` + `get_review_context_tool` instead of reading entire files
- **Finding relationships**: `query_graph_tool` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview_tool` + `list_communities_tool`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes_tool` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context_tool` | Need source snippets for review — token-efficient |
| `get_impact_radius_tool` | Understanding blast radius of a change |
| `get_affected_flows_tool` | Finding which execution paths are impacted |
| `query_graph_tool` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes_tool` | Finding functions/classes by name or keyword |
| `get_architecture_overview_tool` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes_tool` for code review.
3. Use `get_affected_flows_tool` to understand impact.
4. Use `query_graph_tool` pattern="tests_for" to check coverage.
