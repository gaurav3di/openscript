/**
 * The reference arithmetic the Phase 3 studies are measured against.
 *
 * **Where it comes from.** Every function here is a transcription of published
 * indicator code in this project's two sibling packages, kept in that code's own
 * shape: plain arrays indexed forward, not-a-number in a slot with no value, and
 * a loop rather than a fold. It is deliberately not written the way
 * `src/core/stdlib` is written, because a reference that shared an arrangement
 * with the thing under test would agree with it for the wrong reason.
 *
 * **One thing is transcribed in the specification's order rather than the
 * source's, and it is recorded here rather than smoothed over.** Several of the
 * sibling's window functions carry a running total across the window and
 * subtract the bar that leaves it, and some sum a window newest bar first.
 * `compiled-program.md` section 8.3 makes the accumulation order part of the
 * contract and fixes it at a fresh sum, oldest bar first. The two arrangements
 * compute the same quantity and differ in the last bits. That disagreement was
 * measured and recorded by the Phase 2 gate, where `tests/gate/reference.ts`
 * keeps both arrangements side by side and the committed vectors were produced
 * from the fresh one. It belongs to the sibling's accumulation rather than to
 * this library's arithmetic, so it is not re-litigated fifty times here: every
 * window below is a fresh sum, oldest bar first, and a study that disagrees with
 * the reference for any other reason is a finding.
 *
 * Functions the Phase 2 gate already transcribed and anchored, the seeded mean,
 * the smoothed mean, the strength reading and the true range, are imported from
 * there rather than written twice.
 */
import { seededMean, trueRange, wilderMean } from '../reference.js';
import type { RefBar, RefSeries } from '../reference.js';

export type { RefBar, RefSeries } from '../reference.js';
export {
  asSeries,
  averageTrueRange,
  bandsOf,
  convergence,
  directionsOf,
  freshWindowBands,
  seededMean,
  strength,
  trailingBand,
  trueRange,
  wilderMean,
} from '../reference.js';

/** A column with no value anywhere, which is what every transcription starts from. */
export function blank(n: number): RefSeries {
  return new Array<number>(n).fill(NaN);
}

/** A value the reference has, as opposed to a warmup slot. */
export function has(value: number | undefined): boolean {
  return value !== undefined && Number.isFinite(value);
}

/** The reading `n` bars back, with nothing before the series starts. */
export function shiftBy(values: readonly number[], n: number): RefSeries {
  const out = blank(values.length);
  for (let i = n; i < values.length; i += 1) out[i] = values[i - n] as number;
  return out;
}

/** `shiftBy` for a condition column. A flag off the start reads as false. */
export function shiftFlags(flags: readonly boolean[], n: number): boolean[] {
  const out = new Array<boolean>(flags.length).fill(false);
  for (let i = n; i < flags.length; i += 1) out[i] = flags[i - n] === true;
  return out;
}

/** The total over the last `len` bars, summed fresh, oldest bar first. */
export function windowSum(values: readonly number[], len: number): RefSeries {
  const out = blank(values.length);
  if (len <= 0) return out;
  for (let i = len - 1; i < values.length; i += 1) {
    let total = 0;
    let whole = true;
    for (let k = i - len + 1; k <= i; k += 1) {
      const value = values[k] as number;
      if (!Number.isFinite(value)) whole = false;
      total += value;
    }
    if (whole) out[i] = total;
  }
  return out;
}

/** The arithmetic mean over the last `len` bars, from bar `len - 1`. */
export function windowMean(values: readonly number[], len: number): RefSeries {
  const total = windowSum(values, len);
  const out = blank(values.length);
  for (let i = 0; i < values.length; i += 1) {
    if (has(total[i])) out[i] = (total[i] as number) / len;
  }
  return out;
}

/** The population standard deviation over the window, mean first, oldest first. */
export function windowStdev(values: readonly number[], len: number): RefSeries {
  const mean = windowMean(values, len);
  const out = blank(values.length);
  for (let i = len - 1; i < values.length; i += 1) {
    if (!has(mean[i])) continue;
    let squares = 0;
    for (let k = i - len + 1; k <= i; k += 1) {
      const apart = (values[k] as number) - (mean[i] as number);
      squares += apart * apart;
    }
    out[i] = Math.sqrt(squares / len);
  }
  return out;
}

/** The mean absolute deviation from the window's mean, which is what a commodity index divides by. */
export function meanDeviation(values: readonly number[], len: number): RefSeries {
  const mean = windowMean(values, len);
  const out = blank(values.length);
  for (let i = len - 1; i < values.length; i += 1) {
    if (!has(mean[i])) continue;
    let total = 0;
    for (let k = i - len + 1; k <= i; k += 1) {
      total += Math.abs((values[k] as number) - (mean[i] as number));
    }
    out[i] = total / len;
  }
  return out;
}

/** The linearly weighted mean, the newest bar weighted `len`, oldest bar first. */
export function weightedMean(values: readonly number[], len: number): RefSeries {
  const out = blank(values.length);
  if (len <= 0) return out;
  const divisor = (len * (len + 1)) / 2;
  for (let i = len - 1; i < values.length; i += 1) {
    let total = 0;
    let whole = true;
    for (let position = 0; position < len; position += 1) {
      const value = values[i - len + 1 + position] as number;
      if (!Number.isFinite(value)) whole = false;
      total += value * (position + 1);
    }
    if (whole) out[i] = total / divisor;
  }
  return out;
}

/** The largest value in the window, from bar `len - 1`. */
export function windowHigh(values: readonly number[], len: number): RefSeries {
  return windowExtreme(values, len, true);
}

/** The smallest value in the window, from bar `len - 1`. */
export function windowLow(values: readonly number[], len: number): RefSeries {
  return windowExtreme(values, len, false);
}

function windowExtreme(values: readonly number[], len: number, wantHigh: boolean): RefSeries {
  const out = blank(values.length);
  if (len <= 0) return out;
  for (let i = len - 1; i < values.length; i += 1) {
    let best = values[i - len + 1] as number;
    let whole = Number.isFinite(best);
    for (let k = i - len + 2; k <= i; k += 1) {
      const value = values[k] as number;
      if (!Number.isFinite(value)) whole = false;
      if (wantHigh ? value > best : value < best) best = value;
    }
    if (whole) out[i] = best;
  }
  return out;
}

/**
 * How many bars back the window's extreme was set, 0 for this bar.
 *
 * A tie resolves to the most recent bar, which is what a reader of a chart
 * expects of "when was the high set" and what the sibling's own answer is.
 */
export function windowHighBars(values: readonly number[], len: number): RefSeries {
  return windowExtremeBars(values, len, true);
}

export function windowLowBars(values: readonly number[], len: number): RefSeries {
  return windowExtremeBars(values, len, false);
}

function windowExtremeBars(values: readonly number[], len: number, wantHigh: boolean): RefSeries {
  const out = blank(values.length);
  if (len <= 0) return out;
  for (let i = len - 1; i < values.length; i += 1) {
    let best = values[i - len + 1] as number;
    let at = len - 1;
    for (let position = 1; position < len; position += 1) {
      const value = values[i - len + 1 + position] as number;
      if (wantHigh ? value >= best : value <= best) {
        best = value;
        at = len - 1 - position;
      }
    }
    out[i] = at;
  }
  return out;
}

/** `src - src[n]`, with nothing for the first `n` bars. */
export function changeBy(values: readonly number[], n = 1): RefSeries {
  const out = blank(values.length);
  for (let i = n; i < values.length; i += 1) {
    const before = values[i - n] as number;
    const now = values[i] as number;
    if (Number.isFinite(before) && Number.isFinite(now)) out[i] = now - before;
  }
  return out;
}

/** `100 * (src - src[n]) / src[n]`, with nothing for the first `n` bars. */
export function rateOfChange(values: readonly number[], n: number): RefSeries {
  const out = blank(values.length);
  for (let i = n; i < values.length; i += 1) {
    const base = values[i - n] as number;
    const now = values[i] as number;
    if (!Number.isFinite(base) || !Number.isFinite(now) || base === 0) continue;
    out[i] = (100 * (now - base)) / base;
  }
  return out;
}

/** A running total from the first bar, warmup slots counting as nothing. */
export function runningTotal(values: readonly number[]): RefSeries {
  const out = blank(values.length);
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] as number;
    if (Number.isFinite(value)) total += value;
    out[i] = total;
  }
  return out;
}

/**
 * A local high, reported `right` bars after it formed.
 *
 * Strict on both sides, so a tie is not a pivot, and reported on the bar that
 * confirms it rather than on the bar it happened, which is the first bar a
 * script could have had it.
 */
export function pivotHighAt(values: readonly number[], left: number, right: number): RefSeries {
  return pivotAt(values, left, right, true);
}

export function pivotLowAt(values: readonly number[], left: number, right: number): RefSeries {
  return pivotAt(values, left, right, false);
}

function pivotAt(
  values: readonly number[],
  left: number,
  right: number,
  wantHigh: boolean,
): RefSeries {
  const out = blank(values.length);
  for (let i = left + right; i < values.length; i += 1) {
    const at = i - right;
    const value = values[at] as number;
    if (!Number.isFinite(value)) continue;
    let ok = true;
    for (let k = 1; k <= left && ok; k += 1) {
      const other = values[at - k] as number;
      if (!Number.isFinite(other) || (wantHigh ? other >= value : other <= value)) ok = false;
    }
    for (let k = 1; k <= right && ok; k += 1) {
      const other = values[at + k] as number;
      if (!Number.isFinite(other) || (wantHigh ? other >= value : other <= value)) ok = false;
    }
    if (ok) out[i] = value;
  }
  return out;
}

/** Bars elapsed since the condition last held, 0 on the bar itself, nothing before the first. */
export function sinceTrue(flags: readonly boolean[]): RefSeries {
  const out = blank(flags.length);
  let last = -1;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === true) last = i;
    if (last >= 0) out[i] = i - last;
  }
  return out;
}

/** The source as it stood the `occurrence + 1` th most recent time the condition held. */
export function valueAtTrue(
  flags: readonly boolean[],
  source: readonly number[],
  occurrence = 0,
): RefSeries {
  const out = blank(flags.length);
  const hits: number[] = [];
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i] === true) hits.push(i);
    const at = hits.length - 1 - occurrence;
    if (at >= 0) out[i] = source[hits[at] as number] as number;
  }
  return out;
}

/** A at or below B and now above it, which is the crossing a chart draws. */
export function crossedUp(a: readonly number[], b: readonly number[]): boolean[] {
  return crossed(a, b, true);
}

export function crossedDown(a: readonly number[], b: readonly number[]): boolean[] {
  return crossed(a, b, false);
}

function crossed(a: readonly number[], b: readonly number[], up: boolean): boolean[] {
  const out = new Array<boolean>(a.length).fill(false);
  for (let i = 1; i < a.length; i += 1) {
    const now = a[i] as number;
    const against = b[i] as number;
    const before = a[i - 1] as number;
    const againstBefore = b[i - 1] as number;
    if (![now, against, before, againstBefore].every((one) => Number.isFinite(one))) continue;
    out[i] = up
      ? before <= againstBefore && now > against
      : before >= againstBefore && now < against;
  }
  return out;
}

/**
 * Linear correlation over the window, the mean first and then the deviations.
 *
 * The one pass arrangement, summing squares and cross products and subtracting
 * at the end, is what several published implementations use and is not what
 * `src/core/stdlib/series/statistics.ts` states: on a price series, where the
 * values are large and their spread is small, it loses most of its significant
 * digits. The specification fixes neither, so the two arrangements are a real
 * difference between implementations rather than a defect in either, and this
 * reference is written in the arrangement the library states.
 */
export function correlationOf(
  a: readonly number[],
  b: readonly number[],
  len: number,
): RefSeries {
  const out = blank(a.length);
  if (len <= 1) return out;
  const meanA = windowMean(a, len);
  const meanB = windowMean(b, len);
  for (let i = len - 1; i < a.length; i += 1) {
    if (!has(meanA[i]) || !has(meanB[i])) continue;
    let cross = 0;
    let squaresA = 0;
    let squaresB = 0;
    for (let k = i - len + 1; k <= i; k += 1) {
      const da = (a[k] as number) - (meanA[i] as number);
      const db = (b[k] as number) - (meanB[i] as number);
      cross += da * db;
      squaresA += da * da;
      squaresB += db * db;
    }
    const spread = Math.sqrt(squaresA / len) * Math.sqrt(squaresB / len);
    if (spread === 0) continue;
    out[i] = cross / len / spread;
  }
  return out;
}

/** Where the source sits in the window's range, as a percentage. */
export function stochasticOf(
  source: readonly number[],
  high: readonly number[],
  low: readonly number[],
  len: number,
): RefSeries {
  const top = windowHigh(high, len);
  const bottom = windowLow(low, len);
  const out = blank(source.length);
  for (let i = 0; i < source.length; i += 1) {
    if (!has(top[i]) || !has(bottom[i]) || !Number.isFinite(source[i] as number)) continue;
    const span = (top[i] as number) - (bottom[i] as number);
    if (span === 0) continue;
    out[i] = (100 * ((source[i] as number) - (bottom[i] as number))) / span;
  }
  return out;
}

/** The least squares line over the window, read `offset` bars back from its right end. */
export function regressionOf(values: readonly number[], len: number, offset = 0): RefSeries {
  const out = blank(values.length);
  if (len <= 1) return out;
  const sumX = ((len - 1) * len) / 2;
  const sumXSquared = ((len - 1) * len * (2 * len - 1)) / 6;
  const divisor = len * sumXSquared - sumX * sumX;
  if (divisor === 0) return out;
  for (let i = len - 1; i < values.length; i += 1) {
    let sumY = 0;
    let sumXY = 0;
    let whole = true;
    for (let position = 0; position < len; position += 1) {
      const y = values[i - len + 1 + position] as number;
      if (!Number.isFinite(y)) whole = false;
      sumY += y;
      sumXY += y * position;
    }
    if (!whole) continue;
    const slope = (len * sumXY - sumX * sumY) / divisor;
    const intercept = (sumY - slope * sumX) / len;
    out[i] = intercept + slope * (len - 1 - offset);
  }
  return out;
}

/** The average range of a bar, which is what a volatility band is a multiple of. */
export function averageRange(bars: readonly RefBar[], len: number): RefSeries {
  return wilderMean(trueRange(bars), len);
}

/** The exponential mean of an exponential mean, twice over, which a triple mean is built from. */
export function tripleMean(values: readonly number[], len: number): RefSeries {
  const first = seededMean(values, len);
  const second = fromFirst(first, (tail) => seededMean(tail, len));
  return fromFirst(second, (tail) => seededMean(tail, len));
}

/**
 * A smoothing applied to a series that already has a warmup gap.
 *
 * The window counts from the series' own first value rather than from bar 0: a
 * windowed average would otherwise count the gap as data, and a recursive one
 * would carry the absence for ever.
 */
export function fromFirst(
  values: readonly number[],
  smooth: (tail: readonly number[]) => RefSeries,
): RefSeries {
  const out = blank(values.length);
  let start = 0;
  while (start < values.length && !Number.isFinite(values[start] as number)) start += 1;
  if (start >= values.length) return out;
  const tail = smooth(values.slice(start));
  for (let i = 0; i < tail.length && start + i < values.length; i += 1) {
    out[start + i] = tail[i] as number;
  }
  return out;
}

/**
 * A number with exactly `decimals` digits after the point, halves away from
 * zero, which is what `text(x, d)` produces.
 *
 * Written out rather than handed to the host language's formatter: a
 * formatter's tie rule is the host language's own, and the two disagree at
 * exactly the values a price lands on. The digits are assembled from the
 * rounded integer for the same reason, so no second rounding can creep in
 * between the value and the string.
 */
export function fixedText(value: number, decimals: number): string {
  const scale = Math.pow(10, decimals);
  const scaled = value * scale;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  const negative = rounded < 0;
  const digits = Math.abs(rounded).toFixed(0);
  if (decimals === 0) return negative ? `-${digits}` : digits;
  const padded = digits.padStart(decimals + 1, '0');
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
