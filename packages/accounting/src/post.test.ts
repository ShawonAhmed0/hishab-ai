import { describe, expect, it } from "vitest";
import {
  ZERO,
  ZERO_QTY,
  blockedMessage,
  bn,
  deriveRate,
  en,
  money,
  moneyToDb,
  qty,
  qtyToDb,
  transactionInputSchema,
  type Money,
  type TransactionInput,
} from "@hishabai/shared";
import { postTransaction } from "./post";
import { reverseTransaction } from "./reverse";
import { PostingError } from "./errors";
import {
  DEFAULT_PRODUCTS,
  ID,
  makeContext,
  netOn,
  product,
  totalOf,
} from "./testing/fixtures";

const parse = (input: unknown): TransactionInput => transactionInputSchema.parse(input);

const base = { date: "2026-08-16", source: "manual" as const };

/** Every posting, without exception, must balance. */
function expectBalanced(lines: readonly { debit: Money; credit: Money }[]): void {
  expect(moneyToDb(totalOf(lines, "debit"))).toBe(moneyToDb(totalOf(lines, "credit")));
}

// ---------------------------------------------------------------------------

describe("বিক্রয় — the worked example from the spec", () => {
  // 500 KG paper × ৳160 = ৳80,000. Customer pays ৳50,000.
  const input = parse({
    ...base,
    type: "sale",
    partyId: ID.customer,
    lines: [
      { productId: ID.paper, unitId: ID.unitKg, quantity: "500", rate: "160" },
    ],
    payments: [{ financialAccountId: ID.cashWallet, amount: "50000" }],
  });

  const result = postTransaction(input, makeContext());

  it("records বিক্রয় ৳80,000", () => {
    expect(moneyToDb(result.totals.total)).toBe("80000.0000");
    // Sales is an income account, so it carries a credit balance.
    expect(moneyToDb(netOn(result.journalLines, ID.sales))).toBe("-80000.0000");
  });

  it("records নগদ ৳50,000", () => {
    expect(moneyToDb(result.totals.paid)).toBe("50000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.cashGl))).toBe("50000.0000");
  });

  it("records কাস্টমার বকেয়া ৳30,000", () => {
    expect(moneyToDb(result.totals.due)).toBe("30000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.receivable))).toBe("30000.0000");
    expect(moneyToDb(result.partyDelta!.receivable)).toBe("30000.0000");
  });

  it("records স্টক −500 KG", () => {
    expect(result.stockMovements).toHaveLength(1);
    const movement = result.stockMovements[0]!;
    expect(movement.direction).toBe("out");
    expect(qtyToDb(movement.quantity)).toBe("500.000000");
    expect(qtyToDb(movement.quantityAfter)).toBe("500.000000"); // 1000 opening − 500
  });

  it("moves cost of goods sold at the running average, not the sale price", () => {
    // 500 KG × ৳120 average cost
    expect(moneyToDb(netOn(result.journalLines, ID.cogs))).toBe("60000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.inventory))).toBe("-60000.0000");
  });

  it("shows the bill and the receipt as separate movements on the party ledger", () => {
    const receivableLines = result.journalLines.filter(
      (l) => l.accountId === ID.receivable,
    );
    expect(receivableLines).toHaveLength(2);
    expect(moneyToDb(receivableLines[0]!.debit)).toBe("80000.0000");
    expect(moneyToDb(receivableLines[1]!.credit)).toBe("50000.0000");
  });

  it("balances", () => expectBalanced(result.journalLines));
});

// ---------------------------------------------------------------------------

describe("বিক্রয় — edge cases", () => {
  it("bills freight and labour recovered from the customer as other income", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "sale",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "100", rate: "150" }],
        transportCost: "500",
        laborCost: "300",
        otherCost: "200",
        discount: "1000",
      }),
      makeContext(),
    );

    // 15,000 + 1,000 charges − 1,000 discount
    expect(moneyToDb(result.totals.total)).toBe("15000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.sales))).toBe("-14000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.otherIncome))).toBe("-1000.0000");
    expectBalanced(result.journalLines);
  });

  it("refuses a payment larger than the bill", () => {
    expect(() =>
      postTransaction(
        parse({
          ...base,
          type: "sale",
          partyId: ID.customer,
          lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "10", rate: "100" }],
          payments: [{ financialAccountId: ID.cashWallet, amount: "5000" }],
        }),
        makeContext(),
      ),
    ).toThrow(PostingError);
  });

  it("refuses a discount larger than the sale", () => {
    expect(() =>
      postTransaction(
        parse({
          ...base,
          type: "sale",
          partyId: ID.customer,
          lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "1", rate: "100" }],
          discount: "5000",
        }),
        makeContext(),
      ),
    ).toThrow(/INVALID_AMOUNT/);
  });

  it("splits a payment across নগদ and বিকাশ", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "sale",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "100", rate: "200" }],
        payments: [
          { financialAccountId: ID.cashWallet, amount: "8000" },
          { financialAccountId: ID.bkashWallet, amount: "7000" },
        ],
      }),
      makeContext(),
    );

    expect(moneyToDb(netOn(result.journalLines, ID.cashGl))).toBe("8000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.bkashGl))).toBe("7000.0000");
    expect(moneyToDb(result.totals.due)).toBe("5000.0000");
    expectBalanced(result.journalLines);
  });

  // Spec R1.1/R1.3. This reverses what the engine used to do — see the
  // "Warn, don't refuse" section of CLAUDE.md, and the exception it now names.
  it("refuses to sell stock the books have not received", () => {
    const sell = () =>
      postTransaction(
        parse({
          ...base,
          type: "sale",
          partyId: ID.customer,
          lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "5000", rate: "160" }],
        }),
        makeContext(),
      );

    expect(sell).toThrow(/NEGATIVE_STOCK/);

    // The refusal has to carry the two numbers, or the user goes to another
    // screen to find out by how much they are short.
    try {
      sell();
      expect.unreachable();
    } catch (error) {
      const reason = (error as PostingError).reason;
      expect(reason).toEqual({
        rule: "negativeStock",
        productId: ID.paper,
        product: "অফসেট পেপার",
        available: "1,000 কেজি",
        requested: "5,000 কেজি",
      });
      // Same numbers, either language.
      expect(blockedMessage(reason, bn)).toContain("1,000 কেজি");
      expect(blockedMessage(reason, en)).toBe(
        "Not enough stock for অফসেট পেপার. Current stock: 1,000 কেজি, requested: 5,000 কেজি.",
      );
    }
  });

  // A cancellation, and an admin who typed their override PIN, are the only
  // two callers that get this.
  it("lets stock go negative when the posting is explicitly authorised", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "sale",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "5000", rate: "160" }],
      }),
      makeContext({ allowNegativeStock: true }),
    );
    expect(result.warnings.map((w) => w.code)).toContain("NEGATIVE_STOCK");
  });

  it("takes the entire remaining book value when a sale clears the shelf", () => {
    // 3 units at an average that does not divide evenly.
    const products = [
      product({ id: ID.paper, nameBn: "অফসেট পেপার", quantity: qty("3"), avgCost: money("33.3333") }),
    ];
    const result = postTransaction(
      parse({
        ...base,
        type: "sale",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "3", rate: "50" }],
      }),
      makeContext({ products }),
    );

    const movement = result.stockMovements[0]!;
    expect(moneyToDb(movement.stockValueAfter)).toBe("0.0000");
    expect(moneyToDb(movement.avgCostAfter)).toBe("0.0000");
    expectBalanced(result.journalLines);
  });
});

// ---------------------------------------------------------------------------

describe("ক্রয় — landed cost", () => {
  const result = postTransaction(
    parse({
      ...base,
      type: "purchase",
      partyId: ID.vendor,
      lines: [
        { productId: ID.paper, unitId: ID.unitKg, quantity: "500", rate: "100" },
        { productId: ID.jumbo, unitId: ID.unitKg, quantity: "500", rate: "100" },
      ],
      transportCost: "3000",
      laborCost: "1000",
      payments: [{ financialAccountId: ID.bankWallet, amount: "40000" }],
    }),
    makeContext(),
  );

  it("capitalises freight and labour into stock instead of expensing them", () => {
    // 100,000 goods + 4,000 charges
    expect(moneyToDb(result.totals.total)).toBe("104000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.inventory))).toBe("104000.0000");
  });

  it("spreads the charges across lines by value", () => {
    const [first, second] = result.stockMovements;
    expect(moneyToDb(first!.value)).toBe("52000.0000");
    expect(moneyToDb(second!.value)).toBe("52000.0000");
    // 52,000 / 500 KG
    expect(moneyToDb(first!.rate)).toBe("104.0000");
  });

  it("leaves the unpaid balance as ভেন্ডর পাওনা", () => {
    expect(moneyToDb(result.totals.due)).toBe("64000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.payable))).toBe("-64000.0000");
    expect(moneyToDb(result.partyDelta!.payable)).toBe("64000.0000");
  });

  it("balances", () => expectBalanced(result.journalLines));

  it("allocates by quantity when every line is free of charge", () => {
    const free = postTransaction(
      parse({
        ...base,
        type: "purchase",
        partyId: ID.vendor,
        lines: [
          { productId: ID.paper, unitId: ID.unitKg, quantity: "100", rate: "0" },
          { productId: ID.jumbo, unitId: ID.unitKg, quantity: "300", rate: "0" },
        ],
        transportCost: "400",
      }),
      makeContext(),
    );
    expect(moneyToDb(free.stockMovements[0]!.value)).toBe("100.0000");
    expect(moneyToDb(free.stockMovements[1]!.value)).toBe("300.0000");
  });
});

// ---------------------------------------------------------------------------

describe("weighted average cost", () => {
  it("recomputes the average on receipt and holds it on issue", () => {
    const products = [
      product({ id: ID.paper, nameBn: "অফসেট পেপার", quantity: qty("100"), avgCost: money("100") }),
    ];
    const context = makeContext({ products });

    const purchase = postTransaction(
      parse({
        ...base,
        type: "purchase",
        partyId: ID.vendor,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "100", rate: "200" }],
      }),
      context,
    );

    // (100×100 + 100×200) / 200 = 150
    const received = purchase.stockMovements[0]!;
    expect(moneyToDb(received.avgCostAfter)).toBe("150.0000");
    expect(qtyToDb(received.quantityAfter)).toBe("200.000000");

    // Selling out of that pool leaves the average where it is.
    const afterPurchase = [
      product({ id: ID.paper, nameBn: "অফসেট পেপার", quantity: qty("200"), avgCost: money("150") }),
    ];
    const sale = postTransaction(
      parse({
        ...base,
        type: "sale",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "50", rate: "300" }],
      }),
      makeContext({ products: afterPurchase }),
    );
    const issued = sale.stockMovements[0]!;
    expect(moneyToDb(issued.avgCostAfter)).toBe("150.0000");
    expect(moneyToDb(issued.value)).toBe("7500.0000");
  });

  it("keeps stock value and quantity consistent across a long interleaved run", () => {
    let state = product({
      id: ID.paper,
      nameBn: "অফসেট পেপার",
      quantity: ZERO_QTY,
      avgCost: ZERO,
    });

    const script: Array<["buy" | "sell", string, string]> = [
      ["buy", "37", "13.37"],
      ["buy", "11", "99.91"],
      ["sell", "9", "150"],
      ["buy", "3", "7.77"],
      ["sell", "21", "150"],
      ["buy", "100", "41.415"],
      ["sell", "50", "150"],
    ];

    // Tracked independently of the ledger so the two can be compared at the end.
    let ledgerValue = 0n;

    for (const [action, quantity, rate] of script) {
      const result = postTransaction(
        parse(
          action === "buy"
            ? {
                ...base,
                type: "purchase",
                partyId: ID.vendor,
                lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity, rate }],
              }
            : {
                ...base,
                type: "sale",
                partyId: ID.customer,
                lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity, rate }],
              },
        ),
        makeContext({ products: [state] }),
      );

      expectBalanced(result.journalLines);
      const movement = result.stockMovements[0]!;
      ledgerValue += movement.direction === "in" ? movement.value : -movement.value;

      state = {
        ...state,
        quantity: movement.quantityAfter,
        value: movement.stockValueAfter,
        avgCost: movement.avgCostAfter,
      };
    }

    expect(qtyToDb(state.quantity)).toBe("71.000000");

    // The book value is exactly what the movements added up to — nothing leaks
    // between the stock ledger and the inventory control account.
    expect(moneyToDb(state.value)).toBe(moneyToDb(ledgerValue as Money));

    // And the average is always the value re-derived, never a carried-forward
    // number that has quietly stopped matching.
    expect(moneyToDb(state.avgCost)).toBe(
      moneyToDb(deriveRate(state.value, state.quantity)),
    );
  });
});

// ---------------------------------------------------------------------------

describe("আয় / ব্যয়", () => {
  it("posts আয় against the chosen খাত", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "income",
        categoryAccountId: ID.serviceIncome,
        payments: [{ financialAccountId: ID.cashWallet, amount: "12500.50" }],
      }),
      makeContext(),
    );
    expect(moneyToDb(netOn(result.journalLines, ID.cashGl))).toBe("12500.5000");
    expect(moneyToDb(netOn(result.journalLines, ID.serviceIncome))).toBe("-12500.5000");
    expect(result.stockMovements).toHaveLength(0);
    expectBalanced(result.journalLines);
  });

  it("posts ব্যয় the other way round", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "expense",
        categoryAccountId: ID.rentExpense,
        payments: [{ financialAccountId: ID.bankWallet, amount: "25000" }],
      }),
      makeContext(),
    );
    expect(moneyToDb(netOn(result.journalLines, ID.rentExpense))).toBe("25000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.bankGl))).toBe("-25000.0000");
    expect(result.payments[0]!.direction).toBe("out");
  });
});

// ---------------------------------------------------------------------------

describe("কাস্টমার / ভেন্ডর পেমেন্ট", () => {
  it("clears customer due and records who took the money", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "customer_payment",
        partyId: ID.customer,
        payments: [
          {
            financialAccountId: ID.cashWallet,
            amount: "30000",
            handledByUserId: ID.user,
            handledByName: "রফিক",
          },
        ],
      }),
      makeContext(),
    );

    expect(moneyToDb(netOn(result.journalLines, ID.receivable))).toBe("-30000.0000");
    expect(moneyToDb(result.partyDelta!.receivable)).toBe("-30000.0000");
    expect(result.payments[0]!.handledByName).toBe("রফিক");
    expectBalanced(result.journalLines);
  });

  it("clears vendor payable", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "vendor_payment",
        partyId: ID.vendor,
        payments: [{ financialAccountId: ID.bkashWallet, amount: "18000" }],
      }),
      makeContext(),
    );
    expect(moneyToDb(netOn(result.journalLines, ID.payable))).toBe("18000.0000");
    expect(moneyToDb(result.partyDelta!.payable)).toBe("-18000.0000");
  });
});

// ---------------------------------------------------------------------------

describe("উৎপাদন — the জাম্বু পেপার example", () => {
  // 500 KG জাম্বু পেপার → 450 KG finished rolls + 50 KG wastage
  const input = parse({
    ...base,
    type: "production",
    inputs: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "500" }],
    outputs: [{ productId: ID.finishedRoll, unitId: ID.unitKg, quantity: "450" }],
    wastage: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "50" }],
  });
  const result = postTransaction(input, makeContext());

  it("consumes the raw material at average cost", () => {
    const consumed = result.stockMovements.find((m) => m.productId === ID.jumbo)!;
    expect(consumed.direction).toBe("out");
    expect(moneyToDb(consumed.value)).toBe("50000.0000"); // 500 × ৳100
    expect(qtyToDb(consumed.quantityAfter)).toBe("1500.000000");
  });

  it("expenses the অপচয় separately instead of burying it in the product cost", () => {
    expect(moneyToDb(netOn(result.journalLines, ID.wastage))).toBe("5000.0000"); // 50 × ৳100
  });

  it("capitalises the rest into the finished goods", () => {
    const produced = result.stockMovements.find((m) => m.productId === ID.finishedRoll)!;
    expect(produced.direction).toBe("in");
    expect(moneyToDb(produced.value)).toBe("45000.0000"); // 50,000 − 5,000
    expect(moneyToDb(produced.avgCostAfter)).toBe("100.0000"); // 45,000 / 450 KG
  });

  it("balances", () => expectBalanced(result.journalLines));

  it("adds paid conversion cost to the finished goods value", () => {
    const withLabour = postTransaction(
      parse({
        ...base,
        type: "production",
        inputs: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "500" }],
        outputs: [{ productId: ID.finishedRoll, unitId: ID.unitKg, quantity: "450" }],
        wastage: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "50" }],
        laborCost: "4500",
        payments: [{ financialAccountId: ID.cashWallet, amount: "4500" }],
      }),
      makeContext(),
    );
    const produced = withLabour.stockMovements.find((m) => m.productId === ID.finishedRoll)!;
    expect(moneyToDb(produced.value)).toBe("49500.0000");
    expect(moneyToDb(produced.avgCostAfter)).toBe("110.0000");
    expectBalanced(withLabour.journalLines);
  });

  it("refuses conversion cost that nobody paid", () => {
    expect(() =>
      postTransaction(
        parse({
          ...base,
          type: "production",
          inputs: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "100" }],
          outputs: [{ productId: ID.finishedRoll, unitId: ID.unitKg, quantity: "100" }],
          laborCost: "500",
        }),
        makeContext(),
      ),
    ).toThrow(/PRODUCTION_COST_UNPAID/);
  });

  it("refuses wastage of something that was never an input", () => {
    expect(() =>
      postTransaction(
        parse({
          ...base,
          type: "production",
          inputs: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "100" }],
          outputs: [{ productId: ID.finishedRoll, unitId: ID.unitKg, quantity: "90" }],
          wastage: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "10" }],
        }),
        makeContext(),
      ),
    ).toThrow(/WASTAGE_NOT_AN_INPUT/);
  });

  it("splits the cost pool across multiple outputs by quantity", () => {
    const result2 = postTransaction(
      parse({
        ...base,
        type: "production",
        inputs: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "300" }],
        outputs: [
          { productId: ID.finishedRoll, unitId: ID.unitKg, quantity: "100" },
          { productId: ID.paper, unitId: ID.unitKg, quantity: "200" },
        ],
      }),
      makeContext(),
    );
    const rolls = result2.stockMovements.find((m) => m.productId === ID.finishedRoll)!;
    const paper = result2.stockMovements.find(
      (m) => m.productId === ID.paper && m.direction === "in",
    )!;
    expect(moneyToDb(rolls.value)).toBe("10000.0000");
    expect(moneyToDb(paper.value)).toBe("20000.0000");
    expectBalanced(result2.journalLines);
  });
});

// ---------------------------------------------------------------------------

describe("স্টক সমন্বয়", () => {
  it("books a shortage as a loss", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "stock_adjustment",
        adjustments: [
          { productId: ID.paper, unitId: ID.unitKg, countedQuantity: "980", reason: "গণনায় ঘাটতি" },
        ],
      }),
      makeContext(),
    );
    // 20 KG short × ৳120
    expect(moneyToDb(netOn(result.journalLines, ID.stockAdjustment))).toBe("2400.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.inventory))).toBe("-2400.0000");
    expect(result.stockMovements[0]!.direction).toBe("out");
    expectBalanced(result.journalLines);
  });

  it("books a surplus as a gain", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "stock_adjustment",
        adjustments: [{ productId: ID.paper, unitId: ID.unitKg, countedQuantity: "1010" }],
      }),
      makeContext(),
    );
    expect(moneyToDb(netOn(result.journalLines, ID.inventory))).toBe("1200.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.stockAdjustment))).toBe("-1200.0000");
  });

  it("refuses to produce an empty entry when the count already matches", () => {
    expect(() =>
      postTransaction(
        parse({
          ...base,
          type: "stock_adjustment",
          adjustments: [{ productId: ID.paper, unitId: ID.unitKg, countedQuantity: "1000" }],
        }),
        makeContext(),
      ),
    ).toThrow(/EMPTY_TRANSACTION/);
  });
});

// ---------------------------------------------------------------------------

describe("রিটার্ন", () => {
  it("reduces customer due and puts the goods back at average cost", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "sale_return",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "50", rate: "160" }],
      }),
      makeContext(),
    );

    expect(moneyToDb(netOn(result.journalLines, ID.salesReturn))).toBe("8000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.receivable))).toBe("-8000.0000");
    expect(moneyToDb(result.partyDelta!.receivable)).toBe("-8000.0000");

    const movement = result.stockMovements[0]!;
    expect(movement.direction).toBe("in");
    expect(moneyToDb(movement.value)).toBe("6000.0000"); // 50 × ৳120
    expectBalanced(result.journalLines);
  });

  it("refunds cash instead of crediting the ledger when the customer is paid back", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "sale_return",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "50", rate: "160" }],
        payments: [{ financialAccountId: ID.cashWallet, amount: "8000" }],
      }),
      makeContext(),
    );
    expect(moneyToDb(netOn(result.journalLines, ID.cashGl))).toBe("-8000.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.receivable))).toBe("0.0000");
    expect(result.payments[0]!.direction).toBe("out");
  });

  it("books the gap when goods go back at a price other than their average cost", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "purchase_return",
        partyId: ID.vendor,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "10", rate: "130" }],
      }),
      makeContext(),
    );
    // Payable falls by ৳1,300 but only ৳1,200 of stock leaves.
    expect(moneyToDb(netOn(result.journalLines, ID.payable))).toBe("1300.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.inventory))).toBe("-1200.0000");
    expect(moneyToDb(netOn(result.journalLines, ID.stockAdjustment))).toBe("-100.0000");
    expectBalanced(result.journalLines);
  });
});

// ---------------------------------------------------------------------------

describe("অন্যান্য", () => {
  it("passes a manual entry straight through", () => {
    const result = postTransaction(
      parse({
        ...base,
        type: "other",
        entries: [
          { accountId: ID.cashGl, debit: "5000", credit: "0", narration: "মালিকের মূলধন" },
          { accountId: ID.serviceIncome, debit: "0", credit: "5000" },
        ],
      }),
      makeContext(),
    );
    expect(moneyToDb(netOn(result.journalLines, ID.cashGl))).toBe("5000.0000");
    expectBalanced(result.journalLines);
  });

  it("refuses a manual entry that does not balance", () => {
    expect(() =>
      postTransaction(
        parse({
          ...base,
          type: "other",
          entries: [
            { accountId: ID.cashGl, debit: "5000", credit: "0" },
            { accountId: ID.serviceIncome, debit: "0", credit: "4000" },
          ],
        }),
        makeContext(),
      ),
    ).toThrow(/UNBALANCED_ENTRY/);
  });
});

// ---------------------------------------------------------------------------

describe("বাতিল — cancellation by reversal", () => {
  it("returns every balance to where it started", () => {
    const context = makeContext();
    const sale = postTransaction(
      parse({
        ...base,
        type: "sale",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "500", rate: "160" }],
        payments: [{ financialAccountId: ID.cashWallet, amount: "50000" }],
      }),
      context,
    );

    // Stock as it stands after the sale.
    const afterSale = product({
      id: ID.paper,
      nameBn: "অফসেট পেপার",
      quantity: sale.stockMovements[0]!.quantityAfter,
      avgCost: sale.stockMovements[0]!.avgCostAfter,
    });

    const reversal = reverseTransaction(sale, {
      products: new Map([[ID.paper, afterSale]]),
      allowNegativeStock: true,
    });

    for (const accountId of [ID.sales, ID.cashGl, ID.receivable, ID.cogs, ID.inventory]) {
      const net = (netOn(sale.journalLines, accountId) +
        netOn(reversal.journalLines, accountId)) as Money;
      expect(moneyToDb(net)).toBe("0.0000");
    }

    const restored = reversal.stockMovements[0]!;
    expect(qtyToDb(restored.quantityAfter)).toBe("1000.000000");
    expect(moneyToDb(restored.stockValueAfter)).toBe("120000.0000");
    expect(moneyToDb(reversal.partyDelta!.receivable)).toBe("-30000.0000");
    expectBalanced(reversal.journalLines);
  });

  it("unwinds a purchase at the value it went in at, not the drifted average", () => {
    const purchase = postTransaction(
      parse({
        ...base,
        type: "purchase",
        partyId: ID.vendor,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "100", rate: "300" }],
      }),
      makeContext(),
    );

    // Someone else's purchase moves the average before the cancellation lands.
    const drifted = product({
      id: ID.paper,
      nameBn: "অফসেট পেপার",
      quantity: qty("2100"),
      avgCost: money("90"),
    });

    const reversal = reverseTransaction(purchase, {
      products: new Map([[ID.paper, drifted]]),
      allowNegativeStock: true,
    });

    expect(moneyToDb(reversal.stockMovements[0]!.value)).toBe("30000.0000");
    expectBalanced(reversal.journalLines);
  });
});

// ---------------------------------------------------------------------------

describe("the invariant, over everything", () => {
  const cases: TransactionInput[] = [
    parse({
      ...base,
      type: "sale",
      partyId: ID.customer,
      lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "13", rate: "7.77" }],
      transportCost: "1.11",
      discount: "0.37",
      payments: [{ financialAccountId: ID.cashWallet, amount: "1.01" }],
    }),
    parse({
      ...base,
      type: "purchase",
      partyId: ID.vendor,
      lines: [
        { productId: ID.paper, unitId: ID.unitKg, quantity: "7", rate: "3.33" },
        { productId: ID.jumbo, unitId: ID.unitKg, quantity: "11", rate: "1.11" },
        { productId: ID.finishedRoll, unitId: ID.unitRoll, quantity: "3", rate: "0.07" },
      ],
      transportCost: "10",
      laborCost: "0.01",
      otherCost: "0.03",
    }),
    parse({
      ...base,
      type: "income",
      categoryAccountId: ID.serviceIncome,
      payments: [{ financialAccountId: ID.bkashWallet, amount: "0.05" }],
    }),
    parse({
      ...base,
      type: "expense",
      categoryAccountId: ID.rentExpense,
      payments: [{ financialAccountId: ID.cashWallet, amount: "999999.9999" }],
    }),
    parse({
      ...base,
      type: "customer_payment",
      partyId: ID.customer,
      payments: [{ financialAccountId: ID.cashWallet, amount: "0.0001" }],
    }),
    parse({
      ...base,
      type: "vendor_payment",
      partyId: ID.vendor,
      payments: [{ financialAccountId: ID.bankWallet, amount: "123456.789" }],
    }),
    parse({
      ...base,
      type: "production",
      inputs: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "7" }],
      outputs: [
        { productId: ID.finishedRoll, unitId: ID.unitRoll, quantity: "3" },
        { productId: ID.paper, unitId: ID.unitKg, quantity: "3" },
      ],
      wastage: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "1" }],
    }),
    parse({
      ...base,
      type: "stock_adjustment",
      adjustments: [
        { productId: ID.paper, unitId: ID.unitKg, countedQuantity: "999.999" },
        { productId: ID.jumbo, unitId: ID.unitKg, countedQuantity: "2000.001" },
      ],
    }),
    parse({
      ...base,
      type: "sale_return",
      partyId: ID.customer,
      lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "0.333", rate: "160" }],
    }),
    parse({
      ...base,
      type: "purchase_return",
      partyId: ID.vendor,
      lines: [{ productId: ID.jumbo, unitId: ID.unitKg, quantity: "0.777", rate: "101.01" }],
    }),
    parse({
      ...base,
      type: "other",
      entries: [
        { accountId: ID.cashGl, debit: "0.0003", credit: "0" },
        { accountId: ID.serviceIncome, debit: "0", credit: "0.0003" },
      ],
    }),
  ];

  it.each(cases.map((c) => [c.type, c] as const))(
    "%s balances to the paisa",
    (_type, input) => {
      const result = postTransaction(input, makeContext());
      expect(moneyToDb(totalOf(result.journalLines, "debit"))).toBe(
        moneyToDb(totalOf(result.journalLines, "credit")),
      );
    },
  );

  it("balances across a thousand pseudo-random sales and purchases", () => {
    // Deterministic LCG — a failure here has to be reproducible.
    let seed = 20260816;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };

    let state = DEFAULT_PRODUCTS[0]!;
    for (let i = 0; i < 1000; i += 1) {
      const quantity = `${next(500) + 1}.${String(next(1000)).padStart(3, "0")}`;
      const rate = `${next(900) + 1}.${String(next(100)).padStart(2, "0")}`;
      const buying = next(2) === 0;

      const result = postTransaction(
        parse(
          buying
            ? {
                ...base,
                type: "purchase",
                partyId: ID.vendor,
                lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity, rate }],
                transportCost: String(next(500)),
              }
            : {
                ...base,
                type: "sale",
                partyId: ID.customer,
                lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity, rate }],
              },
        ),
        makeContext({ products: [state] }),
      );

      expect(totalOf(result.journalLines, "debit")).toBe(
        totalOf(result.journalLines, "credit"),
      );

      const movement = result.stockMovements[0]!;
      state = {
        ...state,
        quantity: movement.quantityAfter,
        value: movement.stockValueAfter,
        avgCost: movement.avgCostAfter,
      };
    }
  });
});

// ---------------------------------------------------------------------------

describe("validation at the schema boundary", () => {
  it("rejects a sale with no lines", () => {
    expect(() =>
      parse({ ...base, type: "sale", partyId: ID.customer, lines: [] }),
    ).toThrow();
  });

  it("rejects an expense with no payment method", () => {
    expect(() =>
      parse({ ...base, type: "expense", categoryAccountId: ID.rentExpense, payments: [] }),
    ).toThrow();
  });

  it("rejects a zero quantity", () => {
    expect(() =>
      parse({
        ...base,
        type: "sale",
        partyId: ID.customer,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "0", rate: "10" }],
      }),
    ).toThrow();
  });

  it("treats a missing opening balance as zero, not as a crash", () => {
    const empty = product({
      id: ID.paper,
      nameBn: "অফসেট পেপার",
      quantity: ZERO_QTY,
      avgCost: ZERO,
    });
    const result = postTransaction(
      parse({
        ...base,
        type: "purchase",
        partyId: ID.vendor,
        lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "10", rate: "50" }],
      }),
      makeContext({ products: [empty] }),
    );
    expect(moneyToDb(result.stockMovements[0]!.avgCostAfter)).toBe("50.0000");
  });

  it("accepts Bengali digits the way a user would type them", () => {
    const input = parse({
      ...base,
      type: "sale",
      partyId: ID.customer,
      lines: [{ productId: ID.paper, unitId: ID.unitKg, quantity: "৫০০", rate: "১৬০" }],
    });
    const result = postTransaction(input, makeContext());
    expect(moneyToDb(result.totals.total)).toBe("80000.0000");
  });
});
