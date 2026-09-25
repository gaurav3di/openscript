/** Exact input construction and an independent adjacent-value rounding check. */
export type Pair = readonly [number | null, number | null];
const view = new DataView(new ArrayBuffer(8));
const FRACTION = (1n << 52n) - 1n;

export function bits(value: number): bigint {
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

export function fromBits(value: bigint): number {
  view.setBigUint64(0, value, false);
  return view.getFloat64(0, false);
}

/** An exact integer count of the smallest positive binary64 value. */
function units(value: number): bigint {
  const encoded = bits(Math.abs(value));
  const exponent = Number(encoded >> 52n);
  const significand = encoded & FRACTION;
  return exponent === 0 ? significand : (significand | (1n << 52n)) << BigInt(exponent - 1);
}

/**
 * Compare the exact squared radius with the squared adjacent-float midpoints.
 * This uses no integer square root or production normalization algorithm.
 */
export function certified(x: number | null, y: number | null, actual: number | null): boolean {
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return actual === null;
  const square = 4n * (units(x) ** 2n + units(y) ** 2n);
  const beyondMaximum = 1n << 2098n;
  if (actual === null) return square >= (units(Number.MAX_VALUE) + beyondMaximum) ** 2n;
  if (actual === 0) return square === 0n && bits(actual) === 0n;
  if (actual < 0 || !Number.isFinite(actual)) return false;
  const encoded = bits(actual);
  const center = units(actual);
  const before = units(fromBits(encoded - 1n));
  const after = encoded === 0x7fefffffffffffffn ? beyondMaximum : units(fromBits(encoded + 1n));
  const lower = (before + center) ** 2n;
  const upper = (center + after) ** 2n;
  const even = (encoded & 1n) === 0n;
  return lower < square && square < upper || even && (square === lower || square === upper);
}

/** Pythagorean triples whose radius is exactly between two binary64 values. */
export function midpointPairs(): Pair[] {
  const m = (1n << 26n) + 1n;
  const n = 1n << 26n;
  return [-1074, -1022, -100, 0, 500, 970].map(exponent => [
    Number(m * m - n * n) * 2 ** exponent,
    Number(2n * m * n) * 2 ** exponent,
  ]);
}

export function pairs(): Pair[] {
  const edges = [0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 2 * Number.MIN_VALUE,
    fromBits(0x000fffffffffffffn), 2 ** -1022, fromBits(0x0010000000000001n),
    0.5, 1, 1 + Number.EPSILON, 3, 4, 2 ** 500, 2 ** 997, 2 ** 998, Number.MAX_VALUE, -Number.MAX_VALUE];
  const out: Pair[] = [[null, 3], [4, null], [null, null],
    [2, fromBits(0x4047fc519f8c0000n)], [-3, fromBits(0xbfb5bfb24f000000n)],
    [Number.MAX_VALUE, fromBits(0x7e46a09e667f3bccn)],
    [Number.MAX_VALUE, fromBits(0x7e46a09e667f3bcdn)], ...midpointPairs()];
  for (const x of edges) for (const y of edges) out.push([x, y]);
  let seed = 0x394de179;
  const random = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const value = (): number => fromBits(
    BigInt(random() % 2047) << 52n | BigInt(random() & 0xfffff) << 32n | BigInt(random()),
  );
  for (let i = 0; i < 512; i++) out.push([value(), value()]);
  return out;
}
