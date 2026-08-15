# HishabAI

**Smart হিসাব, Smarter Business** — a Bengali-first business accounting and
management application for Bangladeshi businesses.

> একবার লিখুন — বাকিটা HishabAI করবে।

The user makes one plain-language entry. The backend derives every accounting,
inventory and ledger consequence from it. Nobody using this product needs to
know what a debit is.

---

## Where the project stands

**Phase 1 is built.** Foundation, engine, auth, multi-company, design system,
single-entry screen, dashboard, transaction list and detail.

| Area | State |
|---|---|
| Accounting engine, all 11 transaction types | Done — 89 tests green |
| Money layer (fixed-point, no floats anywhere) | Done |
| Database schema, RLS, balance triggers | Done — migration generated, **not yet applied to a real database** |
| Auth, multi-company, role permissions | Done |
| Design system + primitives | Done |
| নতুন এন্ট্রি, ড্যাশবোর্ড, হিসাব | Done |
| Voice / receipt scan | Flow built end to end against a **local heuristic parser**; Whisper + Claude wiring is a later phase |
| Inventory UI, customer/vendor statements, report suite | Later phases — the nav items are placeholders that say so |

---

## Setup

Requires Node 20.11+ and a Supabase project.

```bash
npm install
```

Create the Supabase project, then copy the credentials:

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`DATABASE_URL` from **Project Settings → API** and **→ Database**. Use the
session pooler (port 5432), not the transaction pooler — posting needs real
transactions.

**Use the pooler host, not `db.<ref>.supabase.co`.** Supabase publishes the
direct host as IPv6-only; on a machine without IPv6 it fails with
`getaddrinfo ENOTFOUND`. Copy the **Session pooler** URI
(`aws-0-<region>.pooler.supabase.com:5432`).

Create the runtime database role, then apply the schema:

```bash
node --env-file=.env.local scripts/create-app-role.mjs
npm run db:migrate
```

The first command matters more than it looks. Supabase's `postgres` role has
`BYPASSRLS`, and **`BYPASSRLS` overrides `FORCE ROW LEVEL SECURITY`** — connect
the app as it and every policy reports as enabled while enforcing nothing. The
script creates `hishabai_app` (`NOBYPASSRLS`), points `DATABASE_URL` at it, and
moves the owner connection to `SUPABASE_DB_ADMIN_URL` for migrations only.

`db:migrate` runs the generated table migration and then the SQL drizzle-kit
cannot express: RLS policies, balance triggers, the balanced-entry constraint,
the company bootstrap function and the role grants. All idempotent.

```bash
npm run dev
```

Register, create a company, and the chart of accounts, units, categories and
cash drawer are seeded for you. To skip straight to a populated app:

```bash
npm run db:seed:demo
```

That creates a confirmed login (`rafiq@paperstar.demo` / `HishabDemo2026!`),
পেপার স্টার with a customer, a vendor, two products and the spec's ৳80,000 sale
— posted through the real engine, not painted on.

## Deploying to Vercel

Set these in **Project Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Project Settings → API |
| `DATABASE_URL` | `hishabai_app` on the **transaction** pooler, **port 6543** |
| `DATABASE_POOL_MAX` | `1` |

Two things differ from local:

- **Port 6543, not 5432.** Session mode holds a connection for the life of the
  client, and serverless fan-out exhausts the pool almost immediately.
  Transaction mode works here because `withTenant()` sets its identity with
  `set_config(..., true)` — transaction-scoped — and prepared statements are
  already off.
- **Do not set `SUPABASE_DB_ADMIN_URL`.** It is the owner connection with
  `BYPASSRLS`, and it is needed only by `npm run db:migrate`, which you run
  from your machine.

---

## Layout

```
apps/web/              Next.js — UI, Server Actions, /api/v1 later
packages/accounting/   the posting engine. pure. no I/O. the only place money rules live
packages/db/           Drizzle schema, migrations, RLS policies, triggers
packages/core/         services — the engine plus persistence, behind a Session
packages/shared/       money/quantity arithmetic, Zod schemas, Bengali dictionary
design-system/hishabai/MASTER.md
```

Business logic lives in `packages/`, never in route files. Server Actions are a
thin skin over `packages/core`, which is what makes the Phase-2 Android app a
matter of adding route handlers rather than reimplementing anything.

---

## The parts worth knowing about

**Money is never a float.** Every amount is a branded `bigint` at scale 4,
matching `numeric(18,4)` in Postgres. Quantities are scale 6. The brand is
deliberate friction: `a + b` on two `Money` values is a type error, so every
arithmetic step goes through a function that knows its scale. See
`packages/shared/src/decimal.ts`.

**The engine is pure.** `postTransaction(input, context)` does no I/O, reads no
clock, and generates no randomness. The caller loads current balances and
average costs and hands them over. That is the only reason the tests in
`packages/accounting/src/post.test.ts` are worth anything — including the spec's
worked example, asserted literally:

> 500 KG × ৳160 = ৳80,000, ৳50,000 received → বিক্রয় ৳80,000 · নগদ ৳50,000 ·
> বকেয়া ৳30,000 · স্টক −500 KG

**Nothing is decided by AI.** Voice and scan populate the form. Every number is
computed by the engine. The parse → review → confirm gate cannot be skipped.

**The client is never trusted.** Server Actions take raw inputs and recompute
totals, due, cost of goods and average cost from scratch. Whatever the browser
calculated for its live preview is discarded by never being read.

**Isolation has two locks.** `withTenant()` opens a transaction and sets
`app.user_id` / `app.company_id`; RLS policies on every table read those
settings. A query that forgets its `where company_id = …` returns zero rows
rather than another business's ledger.

**Nothing is deleted.** Cancelling marks the entry cancelled and posts a
mirror-image reversal. Both stay in the ledger, and stock unwinds at the value
each movement originally carried — not at whatever the average has drifted to
since.

---

## Commands

```bash
npm run dev          # start the web app
npm test             # engine + money tests
npm run typecheck    # all packages
npm run build        # production build
npm run db:generate  # regenerate migration after a schema change
npm run db:migrate   # apply migrations + RLS/triggers
```

---

## Design

`design-system/hishabai/MASTER.md` is the source of truth. Style is Data-Dense
Dashboard at density 8, motion 3.

One override is marked in that file and worth repeating: the generated system
proposed Fira Code / Fira Sans, **neither of which contains Bengali glyphs**.
Replaced with Noto Sans Bengali for text and Inter with tabular figures for
currency — Bengali conjuncts need a face designed for them, and financial
columns need fixed-width digits. Bengali also gets 1.6 line-height and a 15px
floor, because matras and descenders collide at the usual dashboard density.

Numbers use Western digits with Bangladeshi 2,2,3 grouping (৮০,০০,০০০ reads as
80,00,000) — chosen for legibility in dense tables and clean spreadsheet export.
