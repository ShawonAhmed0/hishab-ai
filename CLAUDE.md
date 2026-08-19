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
skip** and you get 100 passing instead of 166. Check the count.

A schema change needs `npm run migrate -w @hishabai/db` before the integration
tests can see it — that runs as the owner via `SUPABASE_DB_ADMIN_URL`, applies
the drizzle migrations, then re-applies every file in `packages/db/src/sql`
(they are idempotent, which is why re-running after a policy edit is safe).

`npm run build`, not just `npm run typecheck` — `typedRoutes` types are
generated at build time, so `tsc -b` cannot see a bad `href` and will pass on
code that fails to build.

`npm run lint` does not work: `next lint` with no eslint config drops into an
interactive setup prompt. This codebase has never been linted.

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

A breached **ক্রেডিট সীমা is still a warning**, unchanged. It is the
shopkeeper's own note to themselves about a customer standing in front of them,
and nothing goes missing when it is exceeded.

### The override

`packages/core/src/overrides.ts`. Three things have to hold, and a role check
alone is not one of them:

1. the session's role is `admin`;
2. the person re-types their PIN **now** — an admin session may well be sitting
   unlocked on the counter, so the role proves only that somebody logged in;
3. an `audit_logs` row with `action = 'override'` records the rule and the
   values, written inside the posting transaction so an entry that rolls back
   leaves no claim behind.

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

## Alerts are states; notifications are events

`notifications` holds events — the engine's own `PostingWarning`s, written
inside the posting transaction so a rolled-back entry leaves none behind.
"স্টক কমে গেছে" is not one of those: it is true exactly while the stock is
low and stops being true when a purchase lands. Storing it would be the cache
mistake again, in a new table. So low stock, aged receivables and negative
wallets are **derived on read** in `notifications.ts` and there is nothing to
go stale. Aged receivables come from `journal_lines`, not
`transactions.due_amount`, for the reason above.

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
