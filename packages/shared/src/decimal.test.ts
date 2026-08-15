import { describe, expect, it } from "vitest";
import { allocate, divRound, formatFixed, normalizeDigits, parseFixed } from "./decimal";
import {
  addMoney,
  allocateMoney,
  formatMoney,
  formatMoneyCompact,
  money,
  moneyToDb,
  subMoney,
} from "./money";
import {
  deriveRate,
  formatQty,
  multiplyRate,
  qty,
  qtyToDb,
  weightedAverageCost,
} from "./quantity";

describe("digit normalisation", () => {
  it("folds Bengali digits to ASCII", () => {
    expect(normalizeDigits("৮০০০০")).toBe("80000");
    expect(normalizeDigits("১২৩.৪৫")).toBe("123.45");
  });

  it("leaves Bengali text alone", () => {
    expect(normalizeDigits("৫০০ কেজি")).toBe("500 কেজি");
  });
});

describe("parseFixed", () => {
  it("parses what people actually type", () => {
    expect(parseFixed("80,000", 4)).toBe(800_000_000n);
    expect(parseFixed("৳ 1,234.56", 4)).toBe(12_345_600n);
    expect(parseFixed("৫০০", 4)).toBe(5_000_000n);
    expect(parseFixed(".5", 4)).toBe(5_000n);
    expect(parseFixed("-12.25", 4)).toBe(-122_500n);
  });

  it("treats an empty box as zero rather than an error", () => {
    expect(parseFixed("", 4)).toBe(0n);
    expect(parseFixed("   ", 4)).toBe(0n);
  });

  it("rounds excess precision half-up instead of truncating it away", () => {
    expect(parseFixed("1.00005", 4)).toBe(10_001n);
    expect(parseFixed("1.00004", 4)).toBe(10_000n);
    expect(parseFixed("-1.00005", 4)).toBe(-10_001n);
  });

  it("refuses input that is not a number", () => {
    expect(() => parseFixed("abc", 4)).toThrow(SyntaxError);
    expect(() => parseFixed("1.2.3", 4)).toThrow(SyntaxError);
  });
});

describe("formatFixed", () => {
  it("round-trips through the DB wire format", () => {
    expect(formatFixed(800_000_000n, 4)).toBe("80000.0000");
    expect(formatFixed(-122_500n, 4)).toBe("-12.2500");
  });

  it("carries correctly when rounding to fewer decimals", () => {
    expect(formatFixed(99_960n, 4, 2)).toBe("10.00");
    expect(formatFixed(99_940n, 4, 2)).toBe("9.99");
    expect(formatFixed(99_960n, 4, 0)).toBe("10");
  });

  it("never renders a negative zero", () => {
    expect(formatFixed(-10n, 4, 2)).toBe("0.00");
  });
});

describe("divRound", () => {
  it("rounds half away from zero on both signs", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 2n)).toBe(2n);
    expect(divRound(1n, 3n)).toBe(0n);
  });

  it("refuses division by zero", () => {
    expect(() => divRound(1n, 0n)).toThrow(RangeError);
  });
});

describe("allocate", () => {
  it("never loses a unit to rounding", () => {
    const parts = allocate(100n, [1n, 1n, 1n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(100n);
    expect(parts).toEqual([34n, 33n, 33n]);
  });

  it("gives the leftover to the largest discarded fraction", () => {
    const parts = allocate(10n, [7n, 2n, 1n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(10n);
  });

  it("handles a total that is negative", () => {
    const parts = allocate(-100n, [1n, 1n, 1n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(-100n);
  });

  it("still sums correctly when every weight is zero", () => {
    const parts = allocate(7n, [0n, 0n]);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(7n);
  });

  it("returns nothing for no weights", () => {
    expect(allocate(100n, [])).toEqual([]);
  });
});

describe("money", () => {
  it("adds and subtracts without drift", () => {
    let total = money("0");
    for (let i = 0; i < 1000; i += 1) total = addMoney(total, money("0.1"));
    expect(moneyToDb(total)).toBe("100.0000");
  });

  it("keeps precision a float would lose", () => {
    expect(moneyToDb(addMoney(money("0.1"), money("0.2")))).toBe("0.3000");
    expect(moneyToDb(subMoney(money("1"), money("0.9")))).toBe("0.1000");
  });

  it("splits a bill across lines exactly", () => {
    const parts = allocateMoney(money("100"), [1n, 1n, 1n]);
    expect(parts.map(moneyToDb)).toEqual(["33.3334", "33.3333", "33.3333"]);
    expect(moneyToDb(addMoney(...parts))).toBe("100.0000");
  });
});

describe("money formatting", () => {
  it("groups the Bangladeshi way, not the Western way", () => {
    expect(formatMoney(money("8000000"), { decimals: 0 })).toBe("৳ 80,00,000");
    expect(formatMoney(money("100000"), { decimals: 0 })).toBe("৳ 1,00,000");
    expect(formatMoney(money("999"), { decimals: 0 })).toBe("৳ 999");
  });

  it("shows English digits, as chosen for legibility in dense tables", () => {
    expect(formatMoney(money("80000"))).toBe("৳ 80,000.00");
  });

  it("uses a real minus sign, not a hyphen", () => {
    expect(formatMoney(money("-1500"), { decimals: 0 })).toBe("−৳ 1,500");
  });

  it("can drop the symbol for table columns that already have a header", () => {
    expect(formatMoney(money("1234.5"), { symbol: false })).toBe("1,234.50");
  });

  it("abbreviates in Bengali for chart axes", () => {
    expect(formatMoneyCompact(money("12500000"))).toBe("৳ 1.3 কোটি");
    expect(formatMoneyCompact(money("250000"))).toBe("৳ 2.5 লাখ");
    expect(formatMoneyCompact(money("4500"))).toBe("৳ 4.5 হাজার");
    expect(formatMoneyCompact(money("750"))).toBe("৳ 750");
  });
});

describe("quantity and rate", () => {
  it("rounds the line amount once, at the end", () => {
    // 3 × 0.3333 would drift if each step rounded.
    expect(moneyToDb(multiplyRate(qty("3"), money("0.3333")))).toBe("0.9999");
  });

  it("derives a unit rate from a total", () => {
    expect(moneyToDb(deriveRate(money("52000"), qty("500")))).toBe("104.0000");
  });

  it("treats a zero quantity as a zero rate instead of dividing by zero", () => {
    expect(moneyToDb(deriveRate(money("100"), qty("0")))).toBe("0.0000");
  });

  it("computes weighted average cost from values, not from averaging rates", () => {
    const result = weightedAverageCost(
      qty("100"),
      money("10000"),
      qty("100"),
      money("20000"),
    );
    expect(qtyToDb(result.quantity)).toBe("200.000000");
    expect(moneyToDb(result.value)).toBe("30000.0000");
    expect(moneyToDb(result.rate)).toBe("150.0000");
  });

  it("trims trailing zeros when showing a quantity", () => {
    expect(formatQty(qty("500"), { unit: "কেজি" })).toBe("500 কেজি");
    expect(formatQty(qty("12.500"))).toBe("12.5");
    expect(formatQty(qty("1234.567"))).toBe("1,234.567");
  });
});
