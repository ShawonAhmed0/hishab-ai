import { describe, expect, it } from "vitest";
import { deltaOf } from "./delta";
import { money } from "./money";

/**
 * The arithmetic behind "▲ 24.4% vs last month". Every case here is one a
 * shopkeeper will hit in their first year of using this.
 */
describe("comparing a figure with last month", () => {
  it("reports a rise as a percentage of the baseline", () => {
    const delta = deltaOf(money("12500"), money("10000"));
    expect(delta.percent).toBe(25);
    expect(delta.direction).toBe("up");
    expect(delta.good).toBe(true);
  });

  it("reports a fall", () => {
    const delta = deltaOf(money("7500"), money("10000"));
    expect(delta.percent).toBe(-25);
    expect(delta.direction).toBe("down");
    expect(delta.good).toBe(false);
  });

  it("calls an expense that rose bad news, however the arrow points", () => {
    // The failure this exists to stop: painting a cost increase green because
    // the number went up.
    const delta = deltaOf(money("9000"), money("6000"), { higherIsBetter: false });
    expect(delta.direction).toBe("up");
    expect(delta.good).toBe(false);

    const cheaper = deltaOf(money("4000"), money("6000"), { higherIsBetter: false });
    expect(cheaper.direction).toBe("down");
    expect(cheaper.good).toBe(true);
  });

  it("has no percentage at all when there is no baseline", () => {
    // A first month of trading. "Up 100%" and "up 0%" are both false, and
    // "up ∞%" is worse. The screen says nothing rather than something wrong.
    const delta = deltaOf(money("5000"), money("0"));
    expect(delta.percent).toBeNull();
    expect(delta.direction).toBe("up");
    expect(delta.amount).toBe(money("5000"));
  });

  it("treats no change as no news", () => {
    const delta = deltaOf(money("5000"), money("5000"));
    expect(delta.percent).toBe(0);
    expect(delta.direction).toBe("flat");
    // Flat is not a failure, so it is not painted as one.
    expect(delta.good).toBe(true);
  });

  it("keeps a percentage meaningful when the baseline was negative", () => {
    // A loss-making month followed by a smaller loss is an improvement, and
    // dividing by a negative would flip the sign and report it as a collapse.
    const delta = deltaOf(money("-2000"), money("-8000"));
    expect(delta.direction).toBe("up");
    expect(delta.percent).toBe(75);
  });

  it("rounds to one decimal, the way the tile prints it", () => {
    expect(deltaOf(money("10333"), money("10000")).percent).toBe(3.3);
  });
});
