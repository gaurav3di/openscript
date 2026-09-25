/** Pure immutable Gaussian coefficients, outside all checkpoint state. */
import { exp } from '../maths/index.js';

interface Kernel { readonly weights: readonly number[]; readonly norm: number }
const view = new DataView(new ArrayBuffer(8));
function keyOf(value: number): string {
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16);
}

/** Internal cache with independently bounded entry and coefficient counts. */
export class GaussianCache {
  private readonly entries = new Map<string, Kernel>();
  private count = 0;
  get size(): number { return this.entries.size; }
  get coefficients(): number { return this.count; }

  get(length: number, offset: number, sigma: number): Kernel | null {
    if (!Number.isFinite(offset) || !Number.isFinite(sigma) || !(sigma > 0)) return null;
    const key = `${keyOf(length)}/${keyOf(offset)}/${keyOf(sigma)}`;
    const held = this.entries.get(key);
    if (held !== undefined) return held;
    const peak = offset * (length - 1), spread = length / sigma;
    const denominator = (2 * spread) * spread;
    if (denominator === 0) return null;
    const weights: number[] = [];
    let norm = 0;
    for (let position = 0; position < length; position++) {
      const gap = position - peak, exponent = -(gap * gap) / denominator;
      // Internal limiting weight; the public exp still rejects infinities.
      const weight = exponent === -Infinity ? 0 : exp(exponent);
      if (typeof weight !== 'number') return null;
      weights.push(weight); norm += weight;
    }
    if (norm === 0) return null;
    const computed = Object.freeze({ weights: Object.freeze(weights), norm });
    if (length <= 4096) {
      while (this.entries.size >= 8 || this.count + length > 4096) {
        const oldest = this.entries.keys().next().value as string;
        this.count -= (this.entries.get(oldest) as Kernel).weights.length;
        this.entries.delete(oldest);
      }
      this.entries.set(key, computed); this.count += length;
    }
    return computed;
  }
}

const cache = new GaussianCache();
export function gaussianWeights(length: number, offset: number, sigma: number): Kernel | null {
  return cache.get(length, offset, sigma);
}
