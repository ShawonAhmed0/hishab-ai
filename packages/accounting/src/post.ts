/**
 * The posting engine.
 *
 * One entry in, every consequence out. No I/O, no clock, no randomness — given
 * the same input and context this function returns the same drafts forever,
 * which is the only reason the financial tests below it are worth anything.
 *
 * Nothing in here is decided by AI. Voice and scan features populate the form;
 * the numbers are always computed here.
 */
import {
  ZERO,
  ZERO_QTY,
  addMoney,
  allocateMoney,
  cmpMoney,
  money,
  moneyToDb,
  multiplyRate,
  qty,
  subMoney,
  subQty,
  sumMoney,
  type LineInput,
  type Money,
  type PaymentInput,
  type Qty,
  type TransactionInput,
} from "@hishabai/shared";
import type {
  JournalLineDraft,
  PaymentDraft,
  PostingContext,
  PostingResult,
  PostingTotals,
} from "./context";
import { PostingError, type PostingWarning } from "./errors";
import { JournalBuilder } from "./ledger";
import { StockLedger } from "./stock";

export function postTransaction(
  input: TransactionInput,
  context: PostingContext,
): PostingResult {
  const stock = new StockLedger(context.products, context.allowNegativeStock ?? true);
  const journal = new JournalBuilder();
  const warnings: PostingWarning[] = [];

  const build = (
    totals: PostingTotals,
    payments: PaymentDraft[],
    partyDelta?: { partyId: string; receivable: Money; payable: Money },
  ): PostingResult => {
    const journalLines = journal.build();
    if (journalLines.length === 0) {
      throw new PostingError(
        "EMPTY_TRANSACTION",
        "এই এন্ট্রিতে কোনো অঙ্ক নেই।",
        "Transaction produced no journal lines.",
      );
    }
    const result: PostingResult = {
      type: input.type,
      journalLines,
      stockMovements: stock.build(),
      payments,
      totals,
      warnings: [...warnings, ...stock.warnings],
    };
    if (partyDelta) result.partyDelta = partyDelta;
    return result;
  };

  switch (input.type) {
    case "sale":
    case "sale_return":
      return postSaleSide(input, context, journal, stock, warnings, build);
    case "purchase":
    case "purchase_return":
      return postPurchaseSide(input, context, journal, stock, build);
    case "income":
    case "expense":
      return postCategoryEntry(input, context, journal, build);
    case "customer_payment":
    case "vendor_payment":
      return postPartyPayment(input, context, journal, build);
    case "production":
      return postProduction(input, context, journal, stock, build);
    case "stock_adjustment":
      return postStockAdjustment(input, context, journal, stock, warnings, build);
    case "other":
      return postManualEntry(input, journal, build);
  }
}

type Build = (
  totals: PostingTotals,
  payments: PaymentDraft[],
  partyDelta?: { partyId: string; receivable: Money; payable: Money },
) => PostingResult;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolvePayments(
  context: PostingContext,
  payments: readonly PaymentInput[],
  direction: "in" | "out",
): PaymentDraft[] {
  return payments.map((payment) => {
    const wallet = context.financialAccounts.get(payment.financialAccountId);
    if (!wallet) {
      throw new PostingError(
        "MISSING_FINANCIAL_ACCOUNT",
        "পেমেন্ট মাধ্যমটি খুঁজে পাওয়া যায়নি।",
        `Unknown financial account ${payment.financialAccountId}`,
        { financialAccountId: payment.financialAccountId },
      );
    }
    const draft: PaymentDraft = {
      financialAccountId: wallet.id,
      accountId: wallet.accountId,
      amount: money(payment.amount),
      direction,
    };
    if (payment.handledByUserId) draft.handledByUserId = payment.handledByUserId;
    if (payment.handledByName) draft.handledByName = payment.handledByName;
    if (payment.reference) draft.reference = payment.reference;
    return draft;
  });
}

const paymentTotal = (payments: readonly PaymentDraft[]): Money =>
  sumMoney(payments.map((p) => p.amount));

function lineAmounts(lines: readonly LineInput[]): { amounts: Money[]; subtotal: Money } {
  const amounts = lines.map((line) => multiplyRate(qty(line.quantity), money(line.rate)));
  return { amounts, subtotal: sumMoney(amounts) };
}

function assertPaymentWithinTotal(paid: Money, total: Money): void {
  if (cmpMoney(paid, total) > 0) {
    throw new PostingError(
      "PAYMENT_EXCEEDS_TOTAL",
      "পেমেন্টের পরিমাণ মোট মূল্যের চেয়ে বেশি হতে পারে না।",
      "Payment exceeds transaction total.",
      { paid: moneyToDb(paid), total: moneyToDb(total) },
    );
  }
}

function assertNonNegativeTotal(total: Money, discount: Money): void {
  if (total < 0n) {
    throw new PostingError(
      "INVALID_AMOUNT",
      "ছাড় মোট মূল্যের চেয়ে বেশি হতে পারে না।",
      "Discount exceeds the value of the transaction.",
      { total: moneyToDb(total), discount: moneyToDb(discount) },
    );
  }
}

/**
 * Weights for spreading a pooled amount over lines. Value is the fair basis,
 * but a consignment of free samples has no value to weight by, so quantity
 * stands in rather than dumping the whole pool on line one.
 */
function allocationWeights(amounts: readonly Money[], quantities: readonly Qty[]): bigint[] {
  const valueTotal = sumMoney(amounts);
  if (valueTotal !== ZERO) return amounts.map((a) => a as bigint);
  const qtyTotal = quantities.reduce((acc, q) => acc + q, 0n);
  if (qtyTotal !== 0n) return quantities.map((q) => q as bigint);
  return amounts.map(() => 1n);
}

// ---------------------------------------------------------------------------
// বিক্রয় / বিক্রয় রিটার্ন
// ---------------------------------------------------------------------------

function postSaleSide(
  input: Extract<TransactionInput, { type: "sale" | "sale_return" }>,
  context: PostingContext,
  journal: JournalBuilder,
  stock: StockLedger,
  warnings: PostingWarning[],
  build: Build,
): PostingResult {
  const { accounts } = context;
  const { amounts, subtotal } = lineAmounts(input.lines);
  const isReturn = input.type === "sale_return";

  const charges = isReturn
    ? ZERO
    : addMoney(money(input.transportCost), money(input.laborCost), money(input.otherCost));
  const discount = isReturn ? ZERO : money(input.discount);
  const total = subMoney(addMoney(subtotal, charges), discount);
  assertNonNegativeTotal(total, discount);

  // On a return the money moves the other way: we refund the customer.
  const payments = resolvePayments(context, input.payments, isReturn ? "out" : "in");
  const paid = paymentTotal(payments);
  assertPaymentWithinTotal(paid, total);

  const netReceivable = subMoney(total, paid);

  if (isReturn) {
    journal.debit(accounts.sales_return, total, {
      narration: "বিক্রয় ফেরত",
    });
    journal.credit(accounts.receivable, netReceivable, { partyId: input.partyId });
    for (const payment of payments) journal.credit(payment.accountId, payment.amount);
  } else {
    // Gross, not net: the customer statement has to show the bill and the
    // receipt as two separate movements (spec §13).
    journal.debit(accounts.receivable, total, { partyId: input.partyId });
    journal.credit(accounts.sales, subMoney(subtotal, discount));
    journal.credit(accounts.other_income, charges, {
      narration: "পরিবহন/লেবার/অন্যান্য আদায়",
    });
    for (const payment of payments) {
      journal.debit(payment.accountId, payment.amount);
      journal.credit(accounts.receivable, payment.amount, { partyId: input.partyId });
    }
  }

  // Cost of goods: out at average cost on a sale, back in at the same average
  // on a return. We do not attempt to recover the exact original lot cost —
  // weighted average has no lots to recover.
  let goodsCost = ZERO;
  for (const line of input.lines) {
    const quantity = qty(line.quantity);
    if (isReturn) {
      const state = stock.state(line.productId);
      const value = multiplyRate(quantity, state.avgCost);
      if (value === ZERO && quantity !== ZERO_QTY) {
        warnings.push({
          code: "ZERO_COST_ISSUE",
          messageBn: `${state.nameBn} — গড় ক্রয়মূল্য শূন্য, তাই ফেরত পণ্যের কোনো মূল্য যোগ হয়নি।`,
          details: { productId: line.productId },
        });
      }
      stock.in(line.productId, quantity, value, "sale_return");
      goodsCost = addMoney(goodsCost, value);
    } else {
      const movement = stock.out(line.productId, quantity, "sale");
      goodsCost = addMoney(goodsCost, movement.value);
    }
  }

  if (isReturn) {
    journal.debit(accounts.inventory, goodsCost);
    journal.credit(accounts.cogs, goodsCost);
  } else {
    journal.debit(accounts.cogs, goodsCost);
    journal.credit(accounts.inventory, goodsCost);
  }

  const totals: PostingTotals = {
    subtotal,
    additionalCosts: charges,
    discount,
    total,
    paid,
    due: netReceivable,
  };

  return build(totals, payments, {
    partyId: input.partyId,
    receivable: isReturn ? (-netReceivable as Money) : netReceivable,
    payable: ZERO,
  });
}

// ---------------------------------------------------------------------------
// ক্রয় / ক্রয় রিটার্ন
// ---------------------------------------------------------------------------

function postPurchaseSide(
  input: Extract<TransactionInput, { type: "purchase" | "purchase_return" }>,
  context: PostingContext,
  journal: JournalBuilder,
  stock: StockLedger,
  build: Build,
): PostingResult {
  const { accounts } = context;
  const { amounts, subtotal } = lineAmounts(input.lines);
  const isReturn = input.type === "purchase_return";

  // Freight and labour on a purchase are part of what the goods cost us, so
  // they are capitalised into inventory rather than expensed (landed cost).
  const charges = isReturn
    ? ZERO
    : addMoney(money(input.transportCost), money(input.laborCost), money(input.otherCost));
  const discount = isReturn ? ZERO : money(input.discount);
  const total = subMoney(addMoney(subtotal, charges), discount);
  assertNonNegativeTotal(total, discount);

  const payments = resolvePayments(context, input.payments, isReturn ? "in" : "out");
  const paid = paymentTotal(payments);
  assertPaymentWithinTotal(paid, total);

  const netPayable = subMoney(total, paid);

  if (isReturn) {
    let removedValue = ZERO;
    for (const line of input.lines) {
      const movement = stock.out(line.productId, qty(line.quantity), "purchase_return");
      removedValue = addMoney(removedValue, movement.value);
    }

    journal.debit(accounts.payable, netPayable, { partyId: input.partyId });
    for (const payment of payments) journal.debit(payment.accountId, payment.amount);
    journal.credit(accounts.inventory, removedValue);
    // Returning at a price other than the running average leaves a gap; it is
    // a real gain or loss, not something to hide by fudging the stock value.
    journal.signed(accounts.stock_adjustment, subMoney(total, removedValue), "credit", {
      narration: "ক্রয় ফেরতে মূল্য পার্থক্য",
    });
  } else {
    const quantities = input.lines.map((line) => qty(line.quantity));
    const shares = allocateMoney(total, allocationWeights(amounts, quantities));

    for (const [index, line] of input.lines.entries()) {
      const share = shares[index] ?? ZERO;
      const quantity = quantities[index] ?? ZERO_QTY;
      stock.in(line.productId, quantity, share, "purchase");
    }

    journal.debit(accounts.inventory, total);
    journal.credit(accounts.payable, total, { partyId: input.partyId });
    for (const payment of payments) {
      journal.debit(accounts.payable, payment.amount, { partyId: input.partyId });
      journal.credit(payment.accountId, payment.amount);
    }
  }

  const totals: PostingTotals = {
    subtotal,
    additionalCosts: charges,
    discount,
    total,
    paid,
    due: netPayable,
  };

  return build(totals, payments, {
    partyId: input.partyId,
    receivable: ZERO,
    payable: isReturn ? (-netPayable as Money) : netPayable,
  });
}

// ---------------------------------------------------------------------------
// আয় / ব্যয়
// ---------------------------------------------------------------------------

function postCategoryEntry(
  input: Extract<TransactionInput, { type: "income" | "expense" }>,
  context: PostingContext,
  journal: JournalBuilder,
  build: Build,
): PostingResult {
  const isIncome = input.type === "income";
  const payments = resolvePayments(context, input.payments, isIncome ? "in" : "out");
  const total = paymentTotal(payments);

  for (const payment of payments) {
    if (isIncome) journal.debit(payment.accountId, payment.amount);
    else journal.credit(payment.accountId, payment.amount);
  }

  const options = input.partyId ? { partyId: input.partyId } : {};
  if (isIncome) journal.credit(input.categoryAccountId, total, options);
  else journal.debit(input.categoryAccountId, total, options);

  const totals: PostingTotals = {
    subtotal: total,
    additionalCosts: ZERO,
    discount: ZERO,
    total,
    paid: total,
    due: ZERO,
  };
  return build(totals, payments);
}

// ---------------------------------------------------------------------------
// কাস্টমার পেমেন্ট / ভেন্ডর পেমেন্ট
// ---------------------------------------------------------------------------

function postPartyPayment(
  input: Extract<TransactionInput, { type: "customer_payment" | "vendor_payment" }>,
  context: PostingContext,
  journal: JournalBuilder,
  build: Build,
): PostingResult {
  const { accounts } = context;
  const fromCustomer = input.type === "customer_payment";
  const payments = resolvePayments(context, input.payments, fromCustomer ? "in" : "out");
  const total = paymentTotal(payments);

  if (fromCustomer) {
    for (const payment of payments) journal.debit(payment.accountId, payment.amount);
    journal.credit(accounts.receivable, total, { partyId: input.partyId });
  } else {
    journal.debit(accounts.payable, total, { partyId: input.partyId });
    for (const payment of payments) journal.credit(payment.accountId, payment.amount);
  }

  const totals: PostingTotals = {
    subtotal: total,
    additionalCosts: ZERO,
    discount: ZERO,
    total,
    paid: total,
    due: ZERO,
  };

  return build(totals, payments, {
    partyId: input.partyId,
    receivable: fromCustomer ? (-total as Money) : ZERO,
    payable: fromCustomer ? ZERO : (-total as Money),
  });
}

// ---------------------------------------------------------------------------
// উৎপাদন
// ---------------------------------------------------------------------------

function postProduction(
  input: Extract<TransactionInput, { type: "production" }>,
  context: PostingContext,
  journal: JournalBuilder,
  stock: StockLedger,
  build: Build,
): PostingResult {
  const { accounts } = context;

  // Consume raw materials at their running average cost.
  let inputCost = ZERO;
  const inputRates = new Map<string, Money>();
  for (const line of input.inputs) {
    const movement = stock.out(line.productId, qty(line.quantity), "production_input");
    inputCost = addMoney(inputCost, movement.value);
    inputRates.set(line.productId, movement.rate);
  }

  const conversion = addMoney(money(input.laborCost), money(input.otherCost));
  const payments = resolvePayments(context, input.payments, "out");
  const paid = paymentTotal(payments);

  // Conversion cost has to come from somewhere real. Accruing it silently
  // against an unnamed payable would quietly corrupt the vendor report.
  if (conversion !== ZERO && cmpMoney(paid, conversion) !== 0) {
    throw new PostingError(
      "PRODUCTION_COST_UNPAID",
      "লেবার ও অন্যান্য খরচের সমান পরিমাণ পেমেন্ট মাধ্যম থেকে দিতে হবে।",
      "Production conversion cost must equal the payments provided.",
      { conversion: moneyToDb(conversion), paid: moneyToDb(paid) },
    );
  }

  // অপচয় is measured in the raw material's own unit, so it is costed at that
  // material's rate and lifted out before the rest is capitalised.
  let wastageCost = ZERO;
  for (const waste of input.wastage) {
    const rate = inputRates.get(waste.productId);
    if (rate === undefined) {
      throw new PostingError(
        "WASTAGE_NOT_AN_INPUT",
        "অপচয়ের পণ্যটি এই উৎপাদনের কাঁচামালের তালিকায় নেই।",
        "Wastage product is not among the production inputs.",
        { productId: waste.productId },
      );
    }
    wastageCost = addMoney(wastageCost, multiplyRate(qty(waste.quantity), rate));
  }

  const pool = subMoney(addMoney(inputCost, conversion), wastageCost);
  if (pool < 0n) {
    throw new PostingError(
      "INVALID_AMOUNT",
      "অপচয়ের পরিমাণ ব্যবহৃত কাঁচামালের চেয়ে বেশি হতে পারে না।",
      "Wastage cost exceeds the total production cost pool.",
      { pool: moneyToDb(pool) },
    );
  }

  // Finished goods share the cost pool by quantity produced.
  const outputQuantities = input.outputs.map((o) => qty(o.quantity));
  const shares = allocateMoney(pool, outputQuantities.map((q) => q as bigint));

  for (const [index, output] of input.outputs.entries()) {
    stock.in(
      output.productId,
      outputQuantities[index] ?? ZERO_QTY,
      shares[index] ?? ZERO,
      "production_output",
    );
  }

  journal.debit(accounts.inventory, pool, { narration: "উৎপাদিত পণ্য" });
  journal.debit(accounts.wastage, wastageCost, { narration: "উৎপাদনে অপচয়" });
  journal.credit(accounts.inventory, inputCost, { narration: "ব্যবহৃত কাঁচামাল" });
  for (const payment of payments) journal.credit(payment.accountId, payment.amount);

  const totals: PostingTotals = {
    subtotal: inputCost,
    additionalCosts: conversion,
    discount: ZERO,
    total: addMoney(inputCost, conversion),
    paid,
    due: ZERO,
  };
  return build(totals, payments);
}

// ---------------------------------------------------------------------------
// স্টক সমন্বয়
// ---------------------------------------------------------------------------

function postStockAdjustment(
  input: Extract<TransactionInput, { type: "stock_adjustment" }>,
  context: PostingContext,
  journal: JournalBuilder,
  stock: StockLedger,
  warnings: PostingWarning[],
  build: Build,
): PostingResult {
  const { accounts } = context;
  let gross = ZERO;

  for (const adjustment of input.adjustments) {
    const state = stock.state(adjustment.productId);
    const counted = qty(adjustment.countedQuantity);
    const delta = subQty(counted, state.quantity);
    if (delta === ZERO_QTY) continue;

    if (delta > 0n) {
      const value = multiplyRate(delta, state.avgCost);
      if (value === ZERO) {
        warnings.push({
          code: "ZERO_COST_ISSUE",
          messageBn: `${state.nameBn} — গড় ক্রয়মূল্য শূন্য, তাই বাড়তি স্টকের কোনো মূল্য ধরা হয়নি।`,
          details: { productId: adjustment.productId },
        });
      }
      stock.in(adjustment.productId, delta, value, "adjustment");
      journal.debit(accounts.inventory, value, { narration: adjustment.reason ?? "স্টক বৃদ্ধি" });
      journal.credit(accounts.stock_adjustment, value);
      gross = addMoney(gross, value);
    } else {
      const movement = stock.out(adjustment.productId, (-delta) as Qty, "adjustment");
      journal.debit(accounts.stock_adjustment, movement.value, {
        narration: adjustment.reason ?? "স্টক ঘাটতি",
      });
      journal.credit(accounts.inventory, movement.value);
      gross = addMoney(gross, movement.value);
    }
  }

  const totals: PostingTotals = {
    subtotal: gross,
    additionalCosts: ZERO,
    discount: ZERO,
    total: gross,
    paid: ZERO,
    due: ZERO,
  };
  return build(totals, []);
}

// ---------------------------------------------------------------------------
// অন্যান্য
// ---------------------------------------------------------------------------

function postManualEntry(
  input: Extract<TransactionInput, { type: "other" }>,
  journal: JournalBuilder,
  build: Build,
): PostingResult {
  let debitTotal = ZERO;

  for (const entry of input.entries) {
    const debit = money(entry.debit);
    const credit = money(entry.credit);
    const options: { partyId?: string; narration?: string } = {};
    if (entry.partyId ?? input.partyId) options.partyId = entry.partyId ?? input.partyId;
    if (entry.narration) options.narration = entry.narration;

    if (debit !== ZERO) {
      journal.debit(entry.accountId, debit, options);
      debitTotal = addMoney(debitTotal, debit);
    }
    if (credit !== ZERO) journal.credit(entry.accountId, credit, options);
  }

  const totals: PostingTotals = {
    subtotal: debitTotal,
    additionalCosts: ZERO,
    discount: ZERO,
    total: debitTotal,
    paid: ZERO,
    due: ZERO,
  };
  return build(totals, []);
}

/** Re-exported for callers that persist drafts. */
export type { JournalLineDraft };
