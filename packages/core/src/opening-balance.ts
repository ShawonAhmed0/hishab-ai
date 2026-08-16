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
 * It exists as its own module because it has now been got wrong twice in the
 * same way. Opening stock was written straight into `product_stock`, and a
 * wallet's opening balance straight into `financial_accounts.balance` — in both
 * cases the cache said the asset existed while the ledger had never heard of
 * it, and in both cases every screen agreed because they all read the cache.
 * A balance sheet would have been wrong from the first day.
 */
import { and, eq } from "drizzle-orm";
import {
  accounts,
  journalEntries,
  journalLines,
  transactions,
  type Transaction as Tx,
} from "@hishabai/db";
import { ZERO, moneyToDb, type AccountSubtype, type Money } from "@hishabai/shared";
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
 * Books an opening balance: a voucher, and Dr asset / Cr opening-balance-equity
 * against it.
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
    /** The asset being opened: inventory, cash, bank, MFS. */
    debitAccountId: string;
    amount: Money;
    /** Shown on the voucher and on the journal line. */
    description: string;
  },
): Promise<OpeningEntry> {
  const companyId = session.companyId;
  const date = new Date().toISOString().slice(0, 10);
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

  await tx.insert(journalLines).values([
    {
      companyId,
      journalEntryId: journal!.id,
      transactionId: entry.transactionId,
      accountId: options.debitAccountId,
      debit: moneyToDb(options.amount),
      credit: moneyToDb(ZERO),
      narration: options.description,
      date,
    },
    {
      companyId,
      journalEntryId: journal!.id,
      transactionId: entry.transactionId,
      accountId: equityId,
      debit: moneyToDb(ZERO),
      credit: moneyToDb(options.amount),
      date,
    },
  ]);

  return entry;
}
