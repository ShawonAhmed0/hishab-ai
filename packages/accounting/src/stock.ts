import {
  ZERO,
  ZERO_QTY,
  addQty,
  deriveRate,
  formatQty,
  multiplyRate,
  subQty,
  type Money,
  type Qty,
  type StockMovementType,
} from "@hishabai/shared";
import type { ProductState, StockMovementDraft } from "./context";
import { PostingError, type PostingWarning } from "./errors";

/**
 * Running weighted-average stock state for the duration of one posting.
 *
 * Holds a private copy of every product it touches, so a transaction that
 * moves the same product twice (a production run consuming and producing the
 * same item, a multi-line sale) sees its own earlier effect.
 */
export class StockLedger {
  private readonly states = new Map<string, ProductState>();
  private readonly movements: StockMovementDraft[] = [];
  readonly warnings: PostingWarning[] = [];

  constructor(
    private readonly source: ReadonlyMap<string, ProductState>,
    private readonly allowNegative: boolean,
  ) {}

  state(productId: string): ProductState {
    const existing = this.states.get(productId);
    if (existing) return existing;

    const seed = this.source.get(productId);
    if (!seed) {
      throw new PostingError(
        "MISSING_PRODUCT",
        "পণ্যটি খুঁজে পাওয়া যায়নি।",
        `Unknown product ${productId}`,
        { productId },
      );
    }
    const copy: ProductState = { ...seed };
    this.states.set(productId, copy);
    return copy;
  }

  /**
   * Remove stock at its current average cost.
   *
   * When the movement clears the last unit, the whole remaining book value
   * leaves with it instead of `qty × avgCost`. Those two differ by a rounding
   * unit often enough that not doing this leaves ghost value sitting against
   * zero quantity forever.
   */
  out(
    productId: string,
    quantity: Qty,
    movementType: StockMovementType,
    options: { valueOverride?: Money } = {},
  ): StockMovementDraft {
    const state = this.state(productId);

    if (quantity > state.quantity) {
      if (!this.allowNegative) {
        throw new PostingError(
          "NEGATIVE_STOCK",
          `${state.nameBn} — পর্যাপ্ত স্টক নেই। বর্তমান স্টক ${formatQty(state.quantity)}।`,
          `Insufficient stock for product ${productId}`,
          { productId, requested: quantity.toString(), available: state.quantity.toString() },
        );
      }
      this.warnings.push({
        code: "NEGATIVE_STOCK",
        messageBn: `${state.nameBn} — স্টক ঋণাত্মক হয়ে গেছে। ক্রয় এন্ট্রি বাদ পড়েছে কি না দেখুন।`,
        details: { productId, requested: quantity.toString(), available: state.quantity.toString() },
      });
    }

    // A reversal must withdraw exactly the value the original movement added,
    // not whatever the average has drifted to since.
    const value =
      options.valueOverride !== undefined
        ? options.valueOverride
        : quantity === state.quantity
          ? state.value
          : multiplyRate(quantity, state.avgCost);

    const quantityAfter = subQty(state.quantity, quantity);
    const valueAfter = (state.value - value) as Money;
    // Stock *value* is the authoritative number — it has to agree with the
    // inventory control account. The average is re-derived from what remains
    // rather than carried forward, otherwise the two drift apart by a rounding
    // unit per issue and end up visibly disagreeing after a few hundred.
    const avgCostAfter =
      quantityAfter === ZERO_QTY ? ZERO : deriveRate(valueAfter, quantityAfter);

    return this.record(state, {
      productId,
      direction: "out",
      movementType,
      quantity,
      rate: deriveRate(value, quantity),
      value,
      quantityAfter,
      avgCostAfter,
      stockValueAfter: quantityAfter === ZERO_QTY ? ZERO : valueAfter,
    });
  }

  /** Add stock at a known total value; the new average falls out of it. */
  in(
    productId: string,
    quantity: Qty,
    value: Money,
    movementType: StockMovementType,
  ): StockMovementDraft {
    const state = this.state(productId);

    const quantityAfter = addQty(state.quantity, quantity);
    const valueAfter = (state.value + value) as Money;
    const avgCostAfter =
      quantityAfter === ZERO_QTY ? ZERO : deriveRate(valueAfter, quantityAfter);

    return this.record(state, {
      productId,
      direction: "in",
      movementType,
      quantity,
      rate: deriveRate(value, quantity),
      value,
      quantityAfter,
      avgCostAfter,
      stockValueAfter: valueAfter,
    });
  }

  private record(state: ProductState, draft: StockMovementDraft): StockMovementDraft {
    state.quantity = draft.quantityAfter;
    state.value = draft.stockValueAfter;
    state.avgCost = draft.avgCostAfter;
    this.movements.push(draft);
    return draft;
  }

  build(): StockMovementDraft[] {
    return this.movements;
  }

  /** Products whose stock dropped to or below their reorder point. */
  lowStock(): ProductState[] {
    return [...this.states.values()].filter(
      (s) => s.minStockLevel !== undefined && s.quantity <= s.minStockLevel,
    );
  }
}
