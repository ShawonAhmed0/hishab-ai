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

`npm test` needs `DATABASE_URL`; without it the 32 integration tests **silently
skip** and you get 89 passing instead of 121. Check the count.

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
Every user-visible string comes from `packages/shared/src/i18n.ts`.

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
