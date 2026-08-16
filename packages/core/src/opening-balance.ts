/**
 * প্রারম্ভিক ব্যালেন্স — the one posting in the system with no user decision
 * behind it.
 *
 * A business that starts using HishabAI on a Tuesday already owns stock and
 * already has money in the drawer. Both have to enter the books somehow, and
 * the textbook answer is the same for each: debit the asset, credit Opening
 * Balance Equity. Nobody is asked to choose that — which is why it lives here
 * rather than in the engine, whose job is deriving consequences from something
 * a person typed.
 *
 * It exists as its own module because it has now been got wrong three times in
 * the same way. Opening stock was written straight into `product_stock`, a
 * wallet's opening balance straight into `financial_accounts.balance`, and a
 * party's opening due straight into `party_balances` — every time, the cache
 * said the balance existed while the ledger had never heard of it, and every
 * time every screen agreed because they all read the cache. The party one was
 * the loudest: the customer list showed ৳50,000 owing and the aging report,
 * which reads the journal, showed nothing at all.
 */
import { and, eq } from "drizzle-orm";
import {
  accounts,
  journalEntries,
  journalLines,
  transactions,
  type Transaction as Tx,
} from "@hishabai/db";
import {
  ZERO,
  moneyToDb,
  todayIso,
  type AccountSubtype,
  type Money,
} from "@hishabai/shared";
import type { Session } from "./session";
import { allocateVoucherNo } from "./transactions";

/** The system account for a subtype, which every company is seeded with. */
export async function systemAccountId(
  tx: Tx,
  companyId: string,
  subtype: AccountSubtype,
): Promise<string> {
  const [row] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.companyId, companyId),
        eq(accounts.isSystem, true),
        eq(accounts.subtype, subtype),
      ),
    )
    .limit(1);

  if (!row) throw new Error(`Company is missing the ${subtype} system account`);
  return row.id;
}

export interface OpeningEntry {
  transactionId: string;
  voucherNo: string;
  date: string;
}

/**
 * Books an opening balance: a voucher, and the opened account against
 * opening-balance equity.
 *
 * An asset is debited and equity credited; a liability — a party you already
 * owe — is the mirror of that, which is what `side` selects. `amount` is always
 * positive: the caller decides which side it lands on rather than passing a
 * negative number and hoping the arithmetic works out.
 *
 * The voucher row is created even when the amount is zero, because the caller
 * may still have history to hang off it — an opening stock movement of 1,000 kg
 * at ৳0 is a real thing, and without the voucher the product's movement log
 * would begin mid-story.
 *
 * The deferred balance trigger checks the entry as it commits, so an unbalanced
 * version of this cannot land.
 */
export async function postOpeningBalance(
  tx: Tx,
  session: Session,
  options: {
    /** What is being opened: inventory, cash, bank, MFS, receivable, payable. */
    accountId: string;
    amount: Money;
    /** Shown on the voucher and on the journal line. */
    description: string;
    /** "debit" for an asset, "credit" for something already owed. */
    side?: "debit" | "credit";
    /** Set for a party's opening due, so the trigger maintains their ledger. */
    partyId?: string;
  },
): Promise<OpeningEntry> {
  const companyId = session.companyId;
  const date = todayIso();
  const voucherNo = await allocateVoucherNo(tx, companyId, "OPEN");

  const [transaction] = await tx
    .insert(transactions)
    .values({
      companyId,
      voucherNo,
      type: "other",
      status: "posted",
      source: "manual",
      date,
      description: options.description,
      subtotal: moneyToDb(options.amount),
      total: moneyToDb(options.amount),
      paidAmount: moneyToDb(ZERO),
      dueAmount: moneyToDb(ZERO),
      createdBy: session.userId,
    })
    .returning({ id: transactions.id });

  const entry: OpeningEntry = { transactionId: transaction!.id, voucherNo, date };
  if (options.amount === ZERO) return entry;

  const equityId = await systemAccountId(tx, companyId, "opening_balance_equity");

  const [journal] = await tx
    .insert(journalEntries)
    .values({
      companyId,
      transactionId: entry.transactionId,
      date,
      narration: `প্রারম্ভিক ব্যালেন্স — ${voucherNo}`,
    })
    .returning({ id: journalEntries.id });

  const opened = options.side ?? "debit";
  const zero = moneyToDb(ZERO);
  const total = moneyToDb(options.amount);

  await tx.insert(journalLines).values([
    {
      companyId,
      journalEntryId: journal!.id,
      transactionId: entry.transactionId,
      accountId: options.accountId,
      // The party id is what makes the trigger maintain `party_balances`;
      // without it the control account moves and the party ledger does not.
      partyId: options.partyId ?? null,
      debit: opened === "debit" ? total : zero,
      credit: opened === "debit" ? zero : total,
      narration: options.description,
      date,
    },
    {
      companyId,
      journalEntryId: journal!.id,
      transactionId: entry.transactionId,
      accountId: equityId,
      debit: opened === "debit" ? zero : total,
      credit: opened === "debit" ? total : zero,
      date,
    },
  ]);

  return entry;
}
