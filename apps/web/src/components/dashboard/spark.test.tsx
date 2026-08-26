import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Spark } from "./spark";

/**
 * The sparkline's arithmetic.
 *
 * It is small enough to look obviously right and has two inputs that break it:
 * a series with nothing to plot, and a series where every value is the same —
 * which divides by its own range. Both arrive in a real company (a shop with
 * one month of entries; a figure that has not moved), so neither is a
 * hypothetical.
 */

/** The `d` of the stroked line, which is the second path in the drawing. */
function linePath(container: HTMLElement): string {
  const paths = [...container.querySelectorAll("path")];
  const line = paths.find((path) => path.getAttribute("stroke") === "currentColor");
  return line?.getAttribute("d") ?? "";
}

/** The y of each point on that line, in viewBox units. */
function ys(container: HTMLElement): number[] {
  return linePath(container)
    .split(/[ML]/)
    .filter(Boolean)
    .map((pair) => Number(pair.trim().split(/\s+/)[1]));
}

describe("a sparkline draws only when there is a trend to draw", () => {
  it("renders nothing for a single point", () => {
    // One point is a dot implying a direction it cannot know.
    const { container } = render(<Spark values={[50]} id="a" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders nothing for an empty series", () => {
    const { container } = render(<Spark values={[]} id="b" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a flat series down the middle rather than dividing by zero", () => {
    // max - min is 0 here. Without the guard this is NaN in every coordinate,
    // and an SVG path full of NaN renders as nothing at all — a card that
    // silently loses its chart because the figure held steady.
    const { container } = render(<Spark values={[7000, 7000, 7000]} id="c" />);
    const points = ys(container);

    expect(points).toHaveLength(3);
    expect(points.every(Number.isFinite)).toBe(true);
    // The 30-unit box, halved.
    expect(new Set(points)).toEqual(new Set([15]));
  });
});

describe("the series maps to the box the way a chart does", () => {
  it("puts the largest value highest and the smallest lowest", () => {
    // SVG y grows downward, so "highest on screen" is the smallest y.
    const { container } = render(<Spark values={[10, 30, 20]} id="d" />);
    const [low, high, mid] = ys(container) as [number, number, number];

    expect(high).toBeLessThan(mid);
    expect(mid).toBeLessThan(low);
  });

  it("keeps the drawing inside the box at both extremes", () => {
    const { container } = render(<Spark values={[0, 1_00_00_000]} id="e" />);
    for (const y of ys(container)) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
  });

  it("leaves room on the right for the marker on the last point", () => {
    // At x = 100 the marker sits on the card's own edge, and the card clips
    // its overflow — so the dot marking the stated figure was half a dot.
    const { container } = render(<Spark values={[1, 2, 3]} id="f" />);
    const xs = linePath(container)
      .split(/[ML]/)
      .filter(Boolean)
      .map((pair) => Number(pair.trim().split(/\s+/)[0]));

    expect(Math.max(...xs)).toBeLessThan(100);
  });
});
