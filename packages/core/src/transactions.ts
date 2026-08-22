/**
 * Turning one entry into every record it implies.
 *
 * The engine decides what should happen; this file writes it down. All of it
 * runs inside a single database transaction, so an entry either lands complete
 * — journal, stock, payments, audit — or does not land at all.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import {
  accounts,
  financialAccounts,
  journalEntries,
  journalLines,
  parties,
  partyBalances,
  productStock,
  products,
  profiles,
  stockMovements,
  transactionLines,
  transactionPayments,
  transactions,
  units,
  raw,
  tenantQuery,
  tenantRead,
  token,
  withTenant,
  type Transaction as Tx,
} from "@hishabai/db";
import {
  PostingError,
  postTransaction,
  reverseTransaction,
  type PostingContext,
  type PostingResult,
  type StockMovementDraft,
} from "@hishabai/accounting";
import {
  ZERO,
  bn,
  money,
  moneyFromDb,
  moneyToDb,
  multiplyRate,
  qty,
  qtyToDb,
  transactionInputSchema,
  TRANSACTION_TYPES,
  confirmPolicyFrom,
  isOverridable,
  type AuditAction,
  type BlockedReason,
  type OverridableRule,
  type Money,
  type TransactionInput,
  type TransactionStatus,
  type TransactionType,
} from "@hishabai/shared";
import {
  loadCompanySettings,
  loadPostingContext,
  loadProductStates,
} from "./posting-context";
import { recordPostingWarnings } from "./notifications";
import { writeAudit } from "./audit";
import { authoriseOverride, type OverrideRequest } from "./overrides";
import {
  DuplicateMemoError,
  checkForDuplicates,
  isDuplicateMemoViolation,
} from "./confirmations";
import { requirePermission, type Session, type TenantScope } from "./session";

/** Voucher prefixes, so a number tells you what it is at a glance. */
const VOUCHER_PREFIX: Record<TransactionType, string> = {
  sale: "SALE",
  purchase: "PURC",
  income: "INC",
  expense: "EXP",
  customer_payment: "RCPT",
  vendor_payment: "PYMT",
  production: "PROD",
  stock_adjustment: "ADJ",
  sale_return: "SRET",
  purchase_return: "PRET",
  other: "JV",
};

export interface CreateTransactionResult {
  transactionId: string;
  voucherNo: string;
  totals: PostingResult["totals"];
  previousDue: Money;
  newDue: Money;
  warnings: PostingResult["warnings"];
  /** Rules an admin pushed this entry past, in the order they were hit. */
  overrides: BlockedReason[];
}

export interface CreateTransactionOptions {
  /**
   * The PIN the admin re-typed, when the browser is retrying an entry a rule
   * refused. Absent on every ordinary save.
   */
  override?: OverrideRequest;
  /**
   * Set on the retry after the user has been shown a probable duplicate and
   * said to save it anyway — spec R2.2. A repeated চালান number is refused
   * regardless; this only waves through the same-everything-else case.
   */
  confirmDuplicate?: boolean;
  /** Set once they have seen the typo guard and said the figure is right. */
  confirmUnusual?: boolean;
}

/**
 * Post, and where a rule refuses and the caller supplied an authorised
 * override, post again with that one rule relaxed.
 *
 * Running the engine twice costs nothing — it is pure, with the context
 * already loaded — and it buys the thing that matters: the audit row names the
 * rule that *actually* blocked and the numbers it blocked over, rather than
 * whatever the browser claimed it was about to hit. A rule that refuses again
 * after being relaxed is a real failure and ends the loop.
 */
async function postWithOverrides(
  tx: Tx,
  session: Session,
  args: {
    input: TransactionInput;
    context: PostingContext;
    transactionId: string;
    options: CreateTransactionOptions;
  },
): Promise<{ result: PostingResult; overrides: BlockedReason[] }> {
  const overrides: BlockedReason[] = [];
  const relaxed = new Set<OverridableRule>();

  for (;;) {
    try {
      const result = postTransaction(args.input, {
        ...args.context,
        ...relaxationsFor(relaxed),
      });
      return { result, overrides };
    } catch (error) {
      const override = args.options.override;
      if (
        !(error instanceof PostingError) ||
        !isOverridable(error.reason.rule) ||
        !override ||
        // Only the rules the person was shown and agreed to. A rule they have
        // not seen is a fresh refusal, and they get asked about it.
        !override.rules.includes(error.reason.rule) ||
        relaxed.has(error.reason.rule)
      ) {
        throw error;
      }

      await authoriseOverride(tx, session, {
        request: override,
        reason: error.reason,
        transactionId: args.transactionId,
      });
      overrides.push(error.reason);
      relaxed.add(error.reason.rule);
    }
  }
}

/**
 * One flag per rule, and never a blanket "allow everything".
 *
 * An admin who authorised selling stock they do not have has not thereby
 * authorised paying out of an empty wallet, so each relaxation is turned on by
 * the rule that was actually overridden and by nothing else.
 */
function relaxationsFor(relaxed: ReadonlySet<OverridableRule>) {
  return {
    allowNegativeStock: relaxed.has("negativeStock"),
    allowOverdraft: relaxed.has("insufficientFunds"),
    allowOverCredit: relaxed.has("overCreditLimit") || relaxed.has("riskyParty"),
    allowNegativeCapital: relaxed.has("negativeCapital"),
    allowBackdated: relaxed.has("periodLocked"),
  };
}

/**
 * Spec §24: the client sends what the user typed, and nothing else is trusted.
 * Totals, due, cost of goods and average cost are all recomputed here from the
 * raw inputs; any derived figure the browser happened to send is discarded by
 * virtue of never being read.
 */
export async function createTransaction(
  session: Session,
  rawInput: unknown,
  options: CreateTransactionOptions = {},
): Promise<CreateTransactionResult> {
  requirePermission(session, "transaction.create");

  const input = transactionInputSchema.parse(rawInput);
  const transactionId = randomUUID();

  return withTenant(session, async (tx) => {
    const context = await loadPostingContext(tx, {
      companyId: session.companyId,
      transactionId,
      date: input.date,
      input,
    });

    const { result, overrides } = await postWithOverrides(tx, session, {
      input,
      context,
      transactionId,
      options,
    });

    // Before the counter is touched: a refusal here must not consume a voucher
    // number, and `nextVoucherNo` takes a row lock that would hold it.
    await checkForDuplicates(tx, {
      companyId: session.companyId,
      input,
      total: result.totals.total,
      policy: confirmPolicyFrom(await loadCompanySettings(tx, session.companyId)),
      ...(options.confirmDuplicate ? { confirmDuplicate: true } : {}),
      ...(options.confirmUnusual ? { confirmUnusual: true } : {}),
    });

    const partyId = "partyId" in input ? input.partyId : undefined;
    const previousDue = partyId
      ? await currentPartyDue(tx, session.companyId, partyId, input.type)
      : ZERO;

    const voucherNo = await nextVoucherNo(tx, session.companyId, VOUCHER_PREFIX[input.type]);

    try {
      await persist(tx, {
        session,
        transactionId,
        voucherNo,
        input,
        result,
        previousDue,
      });
    } catch (error) {
      // The probe above lost the race to a save that arrived at the same time.
      if (isDuplicateMemoViolation(error)) {
        throw new DuplicateMemoError(input.memoNo ?? "");
      }
      throw error;
    }

    // Inside the same transaction: an entry that rolls back leaves no warning
    // behind about a voucher that does not exist.
    await recordPostingWarnings(tx, session, {
      transactionId,
      voucherNo,
      warnings: result.warnings,
    });

    await writeAudit(tx, session, {
      action: "create",
      entityType: "transaction",
      entityId: transactionId,
      summaryBn: `${bn.transactionType[input.type]} — ${voucherNo}`,
      after: {
        voucherNo,
        total: moneyToDb(result.totals.total),
        paid: moneyToDb(result.totals.paid),
        due: moneyToDb(result.totals.due),
      },
    });

    return {
      transactionId,
      voucherNo,
      totals: result.totals,
      previousDue,
      newDue: (previousDue + result.totals.due) as Money,
      warnings: result.warnings,
      overrides,
    };
  });
}

// ---------------------------------------------------------------------------

interface PersistArgs {
  session: Session;
  transactionId: string;
  voucherNo: string;
  input: TransactionInput;
  result: PostingResult;
  previousDue: Money;
  reversalOfId?: string;
}

async function persist(tx: Tx, args: PersistArgs): Promise<void> {
  const { session, transactionId, voucherNo, input, result, previousDue } = args;
  const companyId = session.companyId;

  await tx.insert(transactions).values({
    id: transactionId,
    companyId,
    voucherNo,
    type: input.type,
    status: "posted",
    source: input.source,
    date: input.date,
    partyId: "partyId" in input ? (input.partyId ?? null) : null,
    categoryAccountId:
      "categoryAccountId" in input ? (input.categoryAccountId ?? null) : null,
    memoNo: input.memoNo ?? null,
    description: input.description ?? null,
    giverName: input.giverName ?? null,
    recipientName: input.recipientName ?? null,
    subtotal: moneyToDb(result.totals.subtotal),
    transportCost: "transportCost" in input ? moneyToDb(money(input.transportCost)) : "0",
    laborCost: "laborCost" in input ? moneyToDb(money(input.laborCost)) : "0",
    otherCost: "otherCost" in input ? moneyToDb(money(input.otherCost)) : "0",
    otherCostAccountId:
      "otherCostAccountId" in input ? (input.otherCostAccountId ?? null) : null,
    // The engine's figure, not the input's: on a percentage discount the input
    // holds "10" and the taka it works out to is what the books record.
    discount: moneyToDb(result.totals.discount),
    discountType: "discountType" in input ? input.discountType : "amount",
    discountValue: "discount" in input ? moneyToDb(money(input.discount)) : "0",
    total: moneyToDb(result.totals.total),
    paidAmount: moneyToDb(result.totals.paid),
    dueAmount: moneyToDb(result.totals.due),
    previousDue: moneyToDb(previousDue),
    reversalOfId: args.reversalOfId ?? null,
    createdBy: session.userId,
  });

  await insertLines(tx, companyId, transactionId, input, result);

  if (result.payments.length > 0) {
    await tx.insert(transactionPayments).values(
      result.payments.map((payment) => ({
        companyId,
        transactionId,
        financialAccountId: payment.financialAccountId,
        amount: moneyToDb(payment.amount),
        direction: payment.direction,
        handledByUserId: payment.handledByUserId ?? session.userId,
        handledByName: payment.handledByName ?? null,
        reference: payment.reference ?? null,
      })),
    );
  }

  await insertJournal(tx, companyId, transactionId, input.date, result, voucherNo);
  await applyStock(tx, companyId, transactionId, result.stockMovements);
}

async function insertLines(
  tx: Tx,
  companyId: string,
  transactionId: string,
  input: TransactionInput,
  result: PostingResult,
): Promise<void> {
  const rows: (typeof transactionLines.$inferInsert)[] = [];
  const push = (
    row: Partial<typeof transactionLines.$inferInsert> & { role: string },
    index: number,
  ) => {
    rows.push({
      companyId,
      transactionId,
      sortOrder: index,
      ...row,
    } as typeof transactionLines.$inferInsert);
  };

  switch (input.type) {
    case "sale":
    case "purchase":
    case "sale_return":
    case "purchase_return": {
      input.lines.forEach((line, index) => {
        const amount = multiplyRate(qty(line.quantity), money(line.rate));
        const movement = result.stockMovements[index];
        push(
          {
            role: "item",
            productId: line.productId,
            unitId: line.unitId,
            description: line.description ?? null,
            quantity: line.quantity,
            pieces: line.pieces ?? null,
            rate: line.rate,
            amount: moneyToDb(amount),
            allocatedCost: movement ? moneyToDb(movement.value) : "0",
          },
          index,
        );
      });
      break;
    }
    case "production": {
      input.inputs.forEach((line, index) => {
        push(
          {
            role: "input",
            productId: line.productId,
            unitId: line.unitId,
            quantity: line.quantity,
            description: line.description ?? null,
          },
          index,
        );
      });
      input.outputs.forEach((line, index) => {
        const movement = result.stockMovements.find(
          (m) => m.productId === line.productId && m.direction === "in",
        );
        push(
          {
            role: "output",
            productId: line.productId,
            unitId: line.unitId,
            quantity: line.quantity,
            description: line.description ?? null,
            allocatedCost: movement ? moneyToDb(movement.value) : "0",
            rate: movement ? moneyToDb(movement.rate) : "0",
          },
          input.inputs.length + index,
        );
      });
      input.wastage.forEach((line, index) => {
        push(
          {
            role: "wastage",
            productId: line.productId,
            unitId: line.unitId,
            quantity: line.quantity,
            description: line.reason ?? null,
          },
          input.inputs.length + input.outputs.length + index,
        );
      });
      break;
    }
    case "stock_adjustment": {
      input.adjustments.forEach((line, index) => {
        push(
          {
            role: "adjustment",
            productId: line.productId,
            unitId: line.unitId,
            quantity: line.countedQuantity,
            description: line.reason ?? null,
          },
          index,
        );
      });
      break;
    }
    default:
      break;
  }

  if (rows.length > 0) await tx.insert(transactionLines).values(rows);
}

async function insertJournal(
  tx: Tx,
  companyId: string,
  transactionId: string,
  date: string,
  result: PostingResult,
  voucherNo: string,
): Promise<void> {
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      companyId,
      transactionId,
      date,
      narration: `${bn.transactionType[result.type]} — ${voucherNo}`,
    })
    .returning({ id: journalEntries.id });

  await tx.insert(journalLines).values(
    result.journalLines.map((line) => ({
      companyId,
      journalEntryId: entry!.id,
      transactionId,
      accountId: line.accountId,
      partyId: line.partyId ?? null,
      debit: moneyToDb(line.debit),
      credit: moneyToDb(line.credit),
      narration: line.narration ?? null,
      date,
    })),
  );
}

/**
 * Stock movements are appended, and the cached `product_stock` row is set to
 * the state the *last* movement for that product produced — the engine already
 * chained them in order, so replaying its arithmetic here would only be a
 * chance to disagree with it.
 */
async function applyStock(
  tx: Tx,
  companyId: string,
  transactionId: string,
  movements: readonly StockMovementDraft[],
): Promise<void> {
  if (movements.length === 0) return;

  await tx.insert(stockMovements).values(
    movements.map((movement) => ({
      companyId,
      productId: movement.productId,
      transactionId,
      direction: movement.direction,
      movementType: movement.movementType,
      quantity: qtyToDb(movement.quantity),
      rate: moneyToDb(movement.rate),
      value: moneyToDb(movement.value),
      quantityAfter: qtyToDb(movement.quantityAfter),
      avgCostAfter: moneyToDb(movement.avgCostAfter),
      stockValueAfter: moneyToDb(movement.stockValueAfter),
    })),
  );

  const finalState = new Map<string, StockMovementDraft>();
  for (const movement of movements) finalState.set(movement.productId, movement);

  for (const [productId, movement] of finalState) {
    await tx
      .insert(productStock)
      .values({
        companyId,
        productId,
        quantity: qtyToDb(movement.quantityAfter),
        value: moneyToDb(movement.stockValueAfter),
        avgCost: moneyToDb(movement.avgCostAfter),
      })
      .onConflictDoUpdate({
        target: [productStock.companyId, productStock.productId],
        set: {
          quantity: qtyToDb(movement.quantityAfter),
          value: moneyToDb(movement.stockValueAfter),
          avgCost: moneyToDb(movement.avgCostAfter),
          updatedAt: new Date(),
        },
      });
  }
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export interface CancelResult {
  reversalId: string;
  reversalVoucherNo: string;
}

/**
 * Spec §18: nothing is deleted. The original stays exactly as it was, marked
 * cancelled, and a mirror-image entry undoes its effect. Both remain in the
 * ledger and in every report that covers their dates.
 */
export async function cancelTransaction(
  session: Session,
  transactionId: string,
  reason: string,
): Promise<CancelResult> {
  requirePermission(session, "transaction.cancel");

  return withTenant(session, async (tx) => {
    const [original] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.companyId, session.companyId),
        ),
      )
      .limit(1);

    if (!original) {
      throw new Error("Transaction not found");
    }
    if (original.status === "cancelled") {
      throw new Error("Transaction is already cancelled");
    }

    const originalLines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.transactionId, transactionId))
      .orderBy(journalLines.id);

    // Ordered, because the reversal replays these in sequence and stamps each
    // movement with the balance it produced. A production run can consume and
    // produce the same product, and without an ORDER BY the stamps on the
    // mirror movements — the audit trail's whole point — differ run to run.
    const originalMovements = await tx
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.transactionId, transactionId))
      .orderBy(stockMovements.occurredAt, stockMovements.id);

    const originalPayments = await tx
      .select()
      .from(transactionPayments)
      .where(eq(transactionPayments.transactionId, transactionId));

    // The reversal only needs current stock for the products it touches; it
    // unwinds each movement at the value that movement originally carried.
    const productStates = await loadProductStates(
      tx,
      session.companyId,
      [...new Set(originalMovements.map((m) => m.productId))],
    );

    const reversal = reverseTransaction(
      {
        journalLines: originalLines.map((line) => ({
          accountId: line.accountId,
          ...(line.partyId ? { partyId: line.partyId } : {}),
          debit: moneyFromDb(line.debit),
          credit: moneyFromDb(line.credit),
          ...(line.narration ? { narration: line.narration } : {}),
        })),
        stockMovements: originalMovements.map((movement) => ({
          productId: movement.productId,
          direction: movement.direction as "in" | "out",
          movementType: "reversal" as const,
          quantity: qty(movement.quantity),
          rate: moneyFromDb(movement.rate),
          value: moneyFromDb(movement.value),
          quantityAfter: qty(movement.quantityAfter),
          avgCostAfter: moneyFromDb(movement.avgCostAfter),
          stockValueAfter: moneyFromDb(movement.stockValueAfter),
        })),
        totals: {
          subtotal: moneyFromDb(original.subtotal),
          additionalCosts: ZERO,
          discount: moneyFromDb(original.discount),
          total: moneyFromDb(original.total),
          paid: moneyFromDb(original.paidAmount),
          due: moneyFromDb(original.dueAmount),
        },
        payments: originalPayments.map((payment) => ({
          financialAccountId: payment.financialAccountId,
          accountId: "",
          amount: moneyFromDb(payment.amount),
          direction: payment.direction as "in" | "out",
        })),
      },
      { products: productStates, allowNegativeStock: true },
    );

    const reversalId = randomUUID();
    const reversalVoucherNo = await nextVoucherNo(tx, session.companyId, "CNCL");

    await tx.insert(transactions).values({
      id: reversalId,
      companyId: session.companyId,
      voucherNo: reversalVoucherNo,
      type: original.type,
      status: "posted",
      source: "manual",
      date: original.date,
      partyId: original.partyId,
      categoryAccountId: original.categoryAccountId,
      memoNo: original.memoNo,
      description: `বাতিল: ${original.voucherNo} — ${reason}`,
      subtotal: "0",
      total: "0",
      paidAmount: "0",
      dueAmount: "0",
      reversalOfId: transactionId,
      createdBy: session.userId,
    });

    await insertJournal(
      tx,
      session.companyId,
      reversalId,
      original.date,
      {
        type: original.type,
        journalLines: reversal.journalLines,
        stockMovements: reversal.stockMovements,
        payments: reversal.payments,
        totals: {
          subtotal: ZERO,
          additionalCosts: ZERO,
          discount: ZERO,
          total: ZERO,
          paid: ZERO,
          due: ZERO,
        },
        warnings: [],
      },
      reversalVoucherNo,
    );

    await applyStock(tx, session.companyId, reversalId, reversal.stockMovements);

    await tx
      .update(transactions)
      .set({
        status: "cancelled",
        cancelledBy: session.userId,
        cancelledAt: new Date(),
        cancelReason: reason,
        reversedById: reversalId,
        updatedBy: session.userId,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    await writeAudit(tx, session, {
      action: "cancel",
      entityType: "transaction",
      entityId: transactionId,
      summaryBn: `${original.voucherNo} বাতিল করা হয়েছে — ${reason}`,
      before: { status: original.status },
      after: { status: "cancelled", reversalVoucherNo },
    });

    return { reversalId, reversalVoucherNo };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Exported as `allocateVoucherNo` for the one caller outside this file:
 *  opening stock, which is posted from master-data. */
export async function nextVoucherNo(tx: Tx, companyId: string, prefix: string): Promise<string> {
  const rows = await tx.execute<{ voucher_no: string }>(
    sql`select app.next_voucher_no(${companyId}::uuid, ${prefix}) as voucher_no`,
  );
  const value = (rows as unknown as { voucher_no: string }[])[0]?.voucher_no;
  if (!value) throw new Error("Failed to allocate a voucher number");
  return value;
}

/** The party's balance before this entry, frozen for the printed statement. */
async function currentPartyDue(
  tx: Tx,
  companyId: string,
  partyId: string,
  type: TransactionType,
): Promise<Money> {
  const [row] = await tx
    .select({
      receivable: partyBalances.receivable,
      payable: partyBalances.payable,
    })
    .from(partyBalances)
    .where(and(eq(partyBalances.companyId, companyId), eq(partyBalances.partyId, partyId)))
    .limit(1);

  if (!row) return ZERO;
  const vendorSide = type === "purchase" || type === "vendor_payment" || type === "purchase_return";
  return moneyFromDb(vendorSide ? row.payable : row.receivable);
}

/** Most recent entries, for the dashboard and the হিসাব list. */
export async function recentTransactions(session: Session, limit = 10) {
  return withTenant(session, async (tx) =>
    tx
      .select()
      .from(transactions)
      .where(eq(transactions.companyId, session.companyId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit),
  );
}

export interface TransactionFilter {
  type?: TransactionType;
  from?: string;
  to?: string;
  /** Matches voucher number, memo number or party name. */
  search?: string;
  includeCancelled?: boolean;
  limit?: number;
  offset?: number;
}

export interface TransactionListRow {
  id: string;
  voucherNo: string;
  type: TransactionType;
  status: TransactionStatus;
  date: string;
  memoNo: string | null;
  total: string;
  paidAmount: string;
  dueAmount: string;
  partyName: string | null;
}

/** The হিসাব list: filterable, sorted newest first, paged. */
export async function listTransactions(
  session: TenantScope,
  filter: TransactionFilter = {},
): Promise<TransactionListRow[]> {
  // Everything except the search box is a date, an enum or an integer, so the
  // common case — opening the list, or filtering it — can go over the
  // one-round-trip read. A search term is free text and has to be bound by the
  // driver, so that path keeps the transaction and its four round trips.
  if (!filter.search) {
    const where = [tenantQuery`tr.company_id = app.current_company_id()`];

    // Checked against the constant list, so it is a known token rather than
    // anything the request supplied.
    if (filter.type && TRANSACTION_TYPES.includes(filter.type)) {
      where.push(tenantQuery`tr.type = ${token(filter.type)}`);
    }
    if (filter.from) where.push(tenantQuery`tr.date >= ${filter.from}::date`);
    if (filter.to) where.push(tenantQuery`tr.date <= ${filter.to}::date`);
    if (!filter.includeCancelled) where.push(tenantQuery`tr.status = 'posted'`);

    return tenantRead<TransactionListRow>(
      session,
      tenantQuery`
        select tr.id,
               tr.voucher_no   as "voucherNo",
               tr.type::text   as type,
               tr.status::text as status,
               tr.date::text   as date,
               tr.memo_no      as "memoNo",
               tr.total::text        as total,
               tr.paid_amount::text  as "paidAmount",
               tr.due_amount::text   as "dueAmount",
               p.name          as "partyName"
          from transactions tr
          left join parties p on p.id = tr.party_id
         where ${raw(where.join(" and "))}
         order by tr.date desc, tr.created_at desc
         limit ${filter.limit ?? 50} offset ${filter.offset ?? 0}
      `,
    );
  }

  return withTenant(session, async (tx) => {
    const conditions = [eq(transactions.companyId, session.companyId)];
    if (filter.type) conditions.push(eq(transactions.type, filter.type));
    if (filter.from) conditions.push(gte(transactions.date, filter.from));
    if (filter.to) conditions.push(lte(transactions.date, filter.to));
    if (!filter.includeCancelled) conditions.push(eq(transactions.status, "posted"));
    if (filter.search) {
      const pattern = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(transactions.voucherNo, pattern),
          ilike(transactions.memoNo, pattern),
          ilike(parties.name, pattern),
        )!,
      );
    }

    return tx
      .select({
        id: transactions.id,
        voucherNo: transactions.voucherNo,
        type: transactions.type,
        status: transactions.status,
        date: transactions.date,
        memoNo: transactions.memoNo,
        total: transactions.total,
        paidAmount: transactions.paidAmount,
        dueAmount: transactions.dueAmount,
        partyName: parties.name,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(parties, eq(parties.id, transactions.partyId))
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.createdAt))
      .limit(filter.limit ?? 50)
      .offset(filter.offset ?? 0);
  });
}

/** One entry with everything it produced — the detail page and audit trail. */
export async function getTransactionDetail(session: Session, transactionId: string) {
  return withTenant(session, async (tx) => {
    const [header] = await tx
      .select({
        transaction: transactions,
        partyName: parties.name,
        createdByName: profiles.fullName,
      })
      .from(transactions)
      .leftJoin(parties, eq(parties.id, transactions.partyId))
      .leftJoin(profiles, eq(profiles.id, transactions.createdBy))
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.companyId, session.companyId),
        ),
      )
      .limit(1);

    if (!header) return null;

    const [lines, payments, ledger, movements] = await Promise.all([
      tx
        .select({
          id: transactionLines.id,
          role: transactionLines.role,
          quantity: transactionLines.quantity,
          rate: transactionLines.rate,
          amount: transactionLines.amount,
          allocatedCost: transactionLines.allocatedCost,
          productName: products.nameBn,
          unitSymbol: units.symbol,
        })
        .from(transactionLines)
        .leftJoin(products, eq(products.id, transactionLines.productId))
        .leftJoin(units, eq(units.id, transactionLines.unitId))
        .where(eq(transactionLines.transactionId, transactionId))
        .orderBy(transactionLines.sortOrder),

      tx
        .select({
          id: transactionPayments.id,
          amount: transactionPayments.amount,
          direction: transactionPayments.direction,
          handledByName: transactionPayments.handledByName,
          paidAt: transactionPayments.paidAt,
          walletName: financialAccounts.nameBn,
        })
        .from(transactionPayments)
        .leftJoin(
          financialAccounts,
          eq(financialAccounts.id, transactionPayments.financialAccountId),
        )
        .where(eq(transactionPayments.transactionId, transactionId)),

      tx
        .select({
          id: journalLines.id,
          debit: journalLines.debit,
          credit: journalLines.credit,
          narration: journalLines.narration,
          accountName: accounts.nameBn,
          accountCode: accounts.code,
        })
        .from(journalLines)
        .leftJoin(accounts, eq(accounts.id, journalLines.accountId))
        .where(eq(journalLines.transactionId, transactionId))
        .orderBy(desc(journalLines.debit)),

      tx
        .select({
          id: stockMovements.id,
          direction: stockMovements.direction,
          movementType: stockMovements.movementType,
          quantity: stockMovements.quantity,
          rate: stockMovements.rate,
          value: stockMovements.value,
          quantityAfter: stockMovements.quantityAfter,
          productName: products.nameBn,
        })
        .from(stockMovements)
        .leftJoin(products, eq(products.id, stockMovements.productId))
        .where(eq(stockMovements.transactionId, transactionId)),
    ]);

    return { ...header, lines, payments, ledger, movements };
  });
}

export { nextVoucherNo as allocateVoucherNo };
