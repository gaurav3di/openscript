/**
 * The reference arithmetic this phase's gate is measured against.
 *
 * **Where it comes from.** Every function below is a transcription of the
 * published indicator code in this project's sibling chart package, kept in
 * that code's own shape rather than in this library's: plain arrays indexed
 * forward, a running seed, and not-a-number in a slot the reference has no
 * value for. It is deliberately not written the way `src/core/stdlib` is
 * written, because a reference that shared an arrangement with the thing under
 * test would agree with it for the wrong reason.
 *
 * **Why a transcription rather than a table of numbers.** A table pins one
 * parameter set. The gate has to compare at several, and a study whose warmup
 * is right at length 20 and wrong at length 9 is exactly the defect that a
 * single column of expected values cannot see. So the reference is code, and
 * `anchor.test.ts` pins the code: it asserts that these functions reproduce the
 * committed vectors in `tests/stdlib/vectors.ts`, which were produced by the
 * sibling package itself. If a transcription here ever drifts from the
 * arithmetic it was taken from, that anchor fails before any gate test runs.
 *
 * **Two places the reference and the specification disagree**, both recorded
 * here rather than smoothed over, and both asserted as differences by the gate:
 *
 * - `runningSumBands` is the sibling's own band arrangement, which carries a
 *   running total across the window and sums the deviations newest bar first.
 *   `freshWindowBands` is the same bands summed fresh, oldest bar first, which
 *   is the accumulation order `compiled-program.md` section 8.3 makes part of
 *   the contract. The two differ in the last bits, and the difference belongs
 *   to the reference's accumulation rather than to this library's arithmetic.
 * - `trailingBand` reports a value on the bar its average true range is seeded
 *   on. On that bar there is no previous close and no previous band, so the
 *   direction there comes from the reference's seeding rule rather than from
 *   the data, and `stdlib.md` section 4 puts the first value one bar later.
 */

/** One value per bar, with not-a-number where the reference has none. */
export type RefSeries = number[];

/** A bar, as the reference reads one. */
export interface RefBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/** The reference's not-a-number warmup turned into this library's absence. */
export function asSeries(values: readonly number[]): (number | null)[] {
  return values.map((value) => (Number.isFinite(value) ? value : null));
}

/** The band a trailing rail reports, absent where it has none. */
export function bandsOf(trail: readonly RefTrail[]): (number | null)[] {
  return asSeries(trail.map((point) => point.value));
}

/**
 * The direction a trailing rail reports, absent where the band is.
 *
 * The reference carries a direction on every bar, warmup included, because its
 * direction field cannot hold absence. On a bar with no band that direction is
 * the field's initial value rather than a reading, so it is masked here instead
 * of being compared against a column that is honestly absent.
 */
export function directionsOf(trail: readonly RefTrail[]): (number | null)[] {
  return trail.map((point) => (Number.isFinite(point.value) ? point.direction : null));
}

/**
 * An exponential mean seeded with the simple average of its first `period`
 * values, absent before bar `period - 1`.
 *
 * The sibling ships two exponential means and this is the second of them: the
 * first seeds from bar 0, draws a line where there should be a gap, and stays
 * materially wrong until the seed decays. The one transcribed here is the one
 * its own comment marks as the reference-compatible form.
 */
export function seededMean(values: readonly number[], period: number): RefSeries {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (period <= 0 || n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i] as number;
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < n; i += 1) {
    prev = (values[i] as number) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * The smoothing the classic oscillators are defined against: the same seed,
 * then `(prev * (period - 1) + value) / period`.
 *
 * Written out rather than expressed as a weight inside `seededMean`. The two
 * are one function in exact arithmetic and two different numbers in binary64,
 * and this one is what every reference implementation of the strength reading
 * and the average range uses.
 */
export function wilderMean(values: readonly number[], period: number): RefSeries {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (period <= 0 || n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i] as number;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < n; i += 1) {
    prev = (prev * (period - 1) + (values[i] as number)) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * The strength reading: the smoothed rise against the smoothed fall, rescaled
 * to run from 0 to 100, with the first value at bar `period`.
 *
 * Note where the first value lands. The seed averages the changes at bars 1 to
 * `period`, so it is complete one bar later than a mean of levels over the same
 * length, and the reference and the specification agree on that bar.
 */
export function strength(values: readonly number[], period: number): RefSeries {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  if (period <= 0 || n <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const d = (values[i] as number) - (values[i - 1] as number);
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < n; i += 1) {
    const d = (values[i] as number) - (values[i - 1] as number);
    const up = d > 0 ? d : 0;
    const down = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * A smoothing applied to a series that already has a warmup gap.
 *
 * The window has to start counting at the series' own first value rather than
 * at bar 0: a recursive average carries one absent bar for ever, and a windowed
 * one would count the gap as data. This is the sibling's own helper, and it is
 * what puts the signal average eight bars behind the gap it smooths.
 */
function fromFirstValue(
  values: readonly number[],
  smooth: (tail: readonly number[]) => RefSeries,
): RefSeries {
  const n = values.length;
  const out = new Array<number>(n).fill(NaN);
  let start = 0;
  while (start < n && !Number.isFinite(values[start])) start += 1;
  if (start >= n) return out;
  const tail = smooth(values.slice(start));
  for (let i = 0; i < tail.length && start + i < n; i += 1) out[start + i] = tail[i] as number;
  return out;
}

export interface RefConvergence {
  readonly line: RefSeries;
  readonly signal: RefSeries;
  readonly histogram: RefSeries;
}

/** The gap between a fast and a slow mean, its own average, and the difference. */
export function convergence(
  values: readonly number[],
  fast: number,
  slow: number,
  signal: number,
): RefConvergence {
  const near = seededMean(values, fast);
  const far = seededMean(values, slow);
  const line = near.map((value, i) => value - (far[i] as number));
  const trigger = fromFirstValue(line, (tail) => seededMean(tail, signal));
  const histogram = line.map((value, i) => value - (trigger[i] as number));
  return { line, signal: trigger, histogram };
}

export interface RefBands {
  readonly basis: RefSeries;
  readonly upper: RefSeries;
  readonly lower: RefSeries;
}

/**
 * The bands with every window summed fresh, oldest bar first, and the
 * population divisor.
 *
 * This is the arrangement `compiled-program.md` section 8.3 defines as the
 * reference, and it is the one `tests/stdlib/vectors.ts` was produced with.
 */
export function freshWindowBands(
  values: readonly number[],
  len: number,
  mult: number,
): RefBands {
  const n = values.length;
  const basis = new Array<number>(n).fill(NaN);
  const upper = new Array<number>(n).fill(NaN);
  const lower = new Array<number>(n).fill(NaN);
  for (let i = len - 1; i < n; i += 1) {
    let sum = 0;
    for (let k = i - len + 1; k <= i; k += 1) sum += values[k] as number;
    const mean = sum / len;
    let squares = 0;
    for (let k = i - len + 1; k <= i; k += 1) {
      const d = (values[k] as number) - mean;
      squares += d * d;
    }
    const spread = Math.sqrt(squares / len);
    basis[i] = mean;
    upper[i] = mean + mult * spread;
    lower[i] = mean - mult * spread;
  }
  return { basis, upper, lower };
}

/**
 * The sibling's own arrangement of the same bands: a total carried across the
 * window with the departing bar subtracted back out, and the deviations summed
 * newest bar first.
 *
 * Kept so the gate can measure the difference rather than assert it away. Both
 * arrangements compute the same quantity and neither is a mistake; they simply
 * are not the same binary64 number, which is the whole reason the accumulation
 * order is written into the specification instead of left to an implementation.
 */
export function runningSumBands(
  values: readonly number[],
  len: number,
  mult: number,
): RefBands {
  const n = values.length;
  const basis = new Array<number>(n).fill(NaN);
  const upper = new Array<number>(n).fill(NaN);
  const lower = new Array<number>(n).fill(NaN);
  if (len <= 0 || n < len) return { basis, upper, lower };

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += values[i] as number;
    if (i >= len) sum -= values[i - len] as number;
    if (i < len - 1) continue;
    const mean = sum / len;
    let squares = 0;
    for (let k = 0; k < len; k += 1) {
      const d = (values[i - k] as number) - mean;
      squares += d * d;
    }
    const spread = Math.sqrt(squares / len);
    basis[i] = mean;
    upper[i] = mean + mult * spread;
    lower[i] = mean - mult * spread;
  }
  return { basis, upper, lower };
}

/** The bar's own range on bar 0, and the three way maximum after it. */
export function trueRange(bars: readonly RefBar[]): RefSeries {
  const n = bars.length;
  const out = new Array<number>(n).fill(NaN);
  if (n === 0) return out;
  const first = bars[0] as RefBar;
  out[0] = first.high - first.low;
  for (let i = 1; i < n; i += 1) {
    const bar = bars[i] as RefBar;
    const previousClose = (bars[i - 1] as RefBar).close;
    out[i] = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  }
  return out;
}

/** The smoothed mean of true range, first value at bar `period - 1`. */
export function averageTrueRange(bars: readonly RefBar[], period: number): RefSeries {
  return wilderMean(trueRange(bars), period);
}

export interface RefTrail {
  /** The band, or not-a-number while the average range is still warming up. */
  readonly value: number;
  /** -1 while the band is below price, 1 while it is above. */
  readonly direction: -1 | 1;
}

/**
 * The trailing band: a rail a multiple of the average range from the midpoint,
 * which may only move inward while price stays on its side of it, and which
 * flips to the other rail when price closes through the one it was following.
 *
 * The reference reports a value on the bar the average range is seeded on. The
 * gate asserts that this library reports absence there and agrees on every bar
 * after it, which is the one place the two deliberately differ.
 */
export function trailingBand(
  bars: readonly RefBar[],
  multiplier: number,
  period: number,
): RefTrail[] {
  const n = bars.length;
  const out: RefTrail[] = bars.map(() => ({ value: NaN, direction: 1 }));
  const range = averageTrueRange(bars, period);

  let previousUpper = NaN;
  let previousLower = NaN;
  let previousBand = NaN;
  let started = false;

  for (let i = 0; i < n; i += 1) {
    const width = range[i] as number;
    if (!Number.isFinite(width)) continue;
    const bar = bars[i] as RefBar;
    const midpoint = (bar.high + bar.low) / 2;
    const rawUpper = midpoint + multiplier * width;
    const rawLower = midpoint - multiplier * width;
    const previousClose = i > 0 ? (bars[i - 1] as RefBar).close : NaN;

    const upper = !started
      ? rawUpper
      : rawUpper < previousUpper || previousClose > previousUpper
        ? rawUpper
        : previousUpper;
    const lower = !started
      ? rawLower
      : rawLower > previousLower || previousClose < previousLower
        ? rawLower
        : previousLower;

    let band: number;
    let direction: -1 | 1;
    if (!started || previousBand === previousUpper) {
      if (bar.close <= upper) {
        band = upper;
        direction = 1;
      } else {
        band = lower;
        direction = -1;
      }
    } else if (bar.close >= lower) {
      band = lower;
      direction = -1;
    } else {
      band = upper;
      direction = 1;
    }

    out[i] = { value: band, direction };
    previousUpper = upper;
    previousLower = lower;
    previousBand = band;
    started = true;
  }
  return out;
}
