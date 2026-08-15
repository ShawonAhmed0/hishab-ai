/**
 * Fixed-point decimal arithmetic on `bigint`.
 *
 * Money never touches IEEE-754 in this codebase. Every amount is an integer
 * count of the smallest representable unit, and the scale is carried in the
 * type rather than in the value — so `80000.0000` taka is the bigint
 * `800000000` at scale 4, exactly, forever.
 */

const BENGALI_ZERO = 0x09e6; // ০
const BENGALI_NINE = 0x09ef; // ৯

/**
 * Bengali-first input: users type ৫০০ as readily as 500, and both must parse.
 * Also folds the Bengali/Indic decimal separator and thousands marks away.
 */
export function normalizeDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) =>
    String(d.charCodeAt(0) - BENGALI_ZERO),
  );
}

const POW10_CACHE = new Map<number, bigint>();

export function pow10(exponent: number): bigint {
  if (exponent < 0 || !Number.isInteger(exponent)) {
    throw new RangeError(`pow10 expects a non-negative integer, got ${exponent}`);
  }
  const cached = POW10_CACHE.get(exponent);
  if (cached !== undefined) return cached;
  const value = 10n ** BigInt(exponent);
  POW10_CACHE.set(exponent, value);
  return value;
}

/** Half-up division that rounds on the magnitude, so -0.5 → -1 and 0.5 → 1. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** `(a * b) / divisor` computed without an intermediate rounding step. */
export function mulDivRound(a: bigint, b: bigint, divisor: bigint): bigint {
  return divRound(a * b, divisor);
}

const NUMERIC_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * Parse human input into a scaled integer. Tolerates the things people
 * actually type: `৳`, thousands commas, spaces, Bengali digits, a bare `.5`.
 * Extra precision beyond `scale` is rounded half-up rather than silently cut.
 */
export function parseFixed(input: string | number | bigint, scale: number): bigint {
  if (typeof input === "bigint") return input * pow10(scale);

  const raw =
    typeof input === "number"
      ? Number.isFinite(input)
        ? input.toFixed(Math.min(scale + 2, 20))
        : ""
      : normalizeDigits(input)
          .replace(/[৳,\s_]/g, "")
          .trim();

  if (raw === "" || raw === "-" || raw === "+") return 0n;
  if (!NUMERIC_PATTERN.test(raw)) {
    throw new SyntaxError(`Not a valid number: ${JSON.stringify(String(input))}`);
  }

  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^[+-]/, "");
  const [intPart = "0", fracPart = ""] = unsigned.split(".");

  // Keep one extra digit so we can round half-up instead of truncating.
  const kept = fracPart.slice(0, scale).padEnd(scale, "0");
  const nextDigit = fracPart.charCodeAt(scale) - 48;

  let value = BigInt(intPart || "0") * pow10(scale) + BigInt(kept || "0");
  if (nextDigit >= 5 && nextDigit <= 9) value += 1n;

  return negative ? -value : value;
}

/** Render a scaled integer as a plain decimal string — the DB wire format. */
export function formatFixed(value: bigint, scale: number, decimals = scale): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const divisor = pow10(scale);

  const whole = magnitude / divisor;
  const frac = (magnitude % divisor).toString().padStart(scale, "0");

  const shown =
    decimals >= scale
      ? frac.padEnd(decimals, "0")
      : roundFractionString(frac, decimals);

  // Rounding the fraction can carry into the whole part: 9.996 → 10.00
  const carry = shown.length > decimals ? 1n : 0n;
  const fracDigits = carry === 1n ? shown.slice(1) : shown;
  const wholeStr = (whole + carry).toString();

  const body = decimals > 0 ? `${wholeStr}.${fracDigits}` : wholeStr;
  return negative && (whole + carry !== 0n || /[1-9]/.test(fracDigits))
    ? `-${body}`
    : body;
}

/** Returns `decimals` digits, or `decimals + 1` digits when rounding carried. */
function roundFractionString(frac: string, decimals: number): string {
  const kept = frac.slice(0, decimals);
  const nextDigit = frac.charCodeAt(decimals) - 48;
  if (nextDigit < 5 || nextDigit > 9) return kept;

  // Longer than `decimals` exactly when the bump carried into the whole part.
  return (BigInt(kept || "0") + 1n).toString().padStart(decimals, "0");
}

/**
 * Split `total` across `weights` so the parts sum to `total` *exactly*.
 *
 * Used for landed cost (spreading transport/labour over purchase lines) and
 * production cost allocation. Largest-remainder distribution: truncate every
 * share, then hand the leftover units to the lines with the biggest discarded
 * fractions. Without this, a three-way split of ৳100 quietly loses a paisa.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (weights.length === 0) return [];

  const sum = weights.reduce((acc, w) => acc + w, 0n);
  const parts: bigint[] =
    sum === 0n
      ? weights.map(() => 0n)
      : weights.map((w) => (total * w) / sum);

  let remainder = total - parts.reduce((acc, p) => acc + p, 0n);
  if (remainder === 0n) return parts;

  const order =
    sum === 0n
      ? weights.map((_, index) => ({ index, frac: 0n }))
      : weights.map((w, index) => ({ index, frac: (total * w) % sum }));

  const magnitude = (v: bigint) => (v < 0n ? -v : v);
  order.sort((a, b) => {
    const diff = magnitude(b.frac) - magnitude(a.frac);
    if (diff > 0n) return 1;
    if (diff < 0n) return -1;
    return a.index - b.index;
  });

  const step = remainder > 0n ? 1n : -1n;
  for (let i = 0; remainder !== 0n; i += 1) {
    const slot = order[i % order.length];
    if (slot === undefined) break;
    parts[slot.index] = (parts[slot.index] ?? 0n) + step;
    remainder -= step;
  }

  return parts;
}
