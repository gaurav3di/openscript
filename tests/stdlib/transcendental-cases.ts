import { bits, fromBits } from './hypot-cases.js';

export const kinds = ['exp', 'log', 'log10', 'log2'] as const;
export function encode(value: number | null): string | null {
  return value === null ? null : bits(value).toString(16).padStart(16, '0');
}
export function inputs(): (number | null)[] {
  const out: (number | null)[] = [null, -0, 0, -1, -10, 3, Math.PI, Infinity, -Infinity, NaN,
    Number.MIN_VALUE, Number.MAX_VALUE, 709.782712893384, 709.7827128933841,
    -745.1332191019411, -745.1332191019412];
  for (const exponent of [-1074, -1022, -53, -1, 0, 1, 50, 1023]) {
    const value = 2 ** exponent, raw = bits(value);
    out.push(fromBits(raw - 1n), value, fromBits(raw + 1n));
  }
  let seed = 0x369a1891;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < 256; i++) {
    out.push(fromBits(BigInt(random() % 2047) << 52n | BigInt(random() & 0xfffff) << 32n | BigInt(random())));
    out.push((random() / 2 ** 32) * 1450 - 745);
  }
  return out;
}
