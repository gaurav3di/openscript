/**
 * The shared arithmetic the reference studies in this half of the gate are
 * built from, transcribed from the published indicator code in this project's
 * sibling chart package.
 *
 * It is deliberately not written the way `src/core/stdlib` is written: plain
 * arrays indexed forward, a running seed, and not-a-number in a slot the
 * reference has no value for. A reference that shared an arrangement with the
 * thing under test would agree with it for the wrong reason.
 *
 * **One place the transcription departs from the sibling's code, and it is the
 * same place the phase two gate already departed from it.** The sibling's
 * simple mean carries a running total across the window and subtracts the value
 * that leaves it, and its linearly weighted mean sums newest bar first. Neither
 * arrangement is what those averages are defined as, both drift, and
 * `compiled-program.md` section 8.3 refuses a running total outright and
 * section 8.2 fixes the iteration order as oldest bar first. So `mean` and
 * `weightedMean` below sum a fresh window in index order, which is what
 * `tests/stdlib/vectors.ts` already says the committed band vectors were
 * produced from. The two arrangements differ by about one part in a quadrillion
 * on this fixture: a difference in the sibling's accumulation, not in the
 * arithmetic either side is computing.
 *
 * Everywhere else the transcription follows the sibling exactly, including
 * where the sibling computes a different quantity from the one this language
 * specifies. Those are findings and they are reported as findings; they are not
 * smoothed over here.
 */

/** One value per bar, with not-a-number where the reference has none. */
export type Ref = number[];

/** A bar as these functions read one. */
export interface RefBar {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

function filled(n: number): Ref {
  return new Array<number>(n).fill(NaN);
}

/**
 * The arithmetic mean of the last `period` values, from bar `period - 1`.
 *
 * A fresh window summed oldest bar first, for the reason the file header gives.
 * A window holding a value the reference has none for has no mean, so it stays
 * a gap rather than averaging over the bars that happen to be there.
 */
export function mean(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = filled(n);
  if (period <= 0 || n < period) return out;
  for (let i = period - 1; i < n; i += 1) {
    let sum = 0;
    let ok = true;
    for (let k = period - 1; k >= 0; k -= 1) {
      const v = values[i - k] as number;
      if (!Number.isFinite(v)) ok = false;
      sum += v;
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

/** The linearly weighted mean: the newest bar carries weight `period`. */
export function weightedMean(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = filled(n);
  if (period <= 0 || n < period) return out;
  const divisor = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i += 1) {
    let acc = 0;
    for (let k = period - 1; k >= 0; k -= 1) acc += (values[i - k] as number) * (period - k);
    out[i] = acc / divisor;
  }
  return out;
}

/**
 * The exponential mean seeded with the simple average of its first `period`
 * values, absent before bar `period - 1`.
 */
export function expMean(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = filled(n);
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

/** The smoothing the classic oscillators use: the same seed, then `(prev * (p - 1) + v) / p`. */
export function smoothMean(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = filled(n);
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
 * Smooth a series that already carries gaps, one gapless run at a time.
 *
 * The sibling's own helper, transcribed. A recursive smoother handed a
 * not-a-number never recovers, so a study that smooths another study's output
 * restarts on the first full window of real values after the gap instead of
 * going blank for the rest of the series.
 */
export function smoothRuns(
  values: readonly number[],
  period: number,
  smooth: (input: readonly number[], p: number) => Ref,
): Ref {
  const out = filled(values.length);
  let i = 0;
  while (i < values.length) {
    if (!Number.isFinite(values[i])) {
      i += 1;
      continue;
    }
    let end = i;
    while (end < values.length && Number.isFinite(values[end])) end += 1;
    const run = smooth(values.slice(i, end), period);
    for (let k = 0; k < run.length; k += 1) out[i + k] = run[k] as number;
    i = end;
  }
  return out;
}

/** The rolling population standard deviation over `period`. */
export function deviation(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = filled(n);
  const means = mean(values, period);
  for (let i = period - 1; i < n; i += 1) {
    const m = means[i] as number;
    if (!Number.isFinite(m)) continue;
    let acc = 0;
    for (let k = period - 1; k >= 0; k -= 1) {
      const d = (values[i - k] as number) - m;
      acc += d * d;
    }
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

/** The mean absolute deviation from the simple mean, which the channel index is calibrated on. */
export function absDeviation(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = filled(n);
  const means = mean(values, period);
  for (let i = period - 1; i < n; i += 1) {
    const m = means[i] as number;
    if (!Number.isFinite(m)) continue;
    let acc = 0;
    for (let k = period - 1; k >= 0; k -= 1) acc += Math.abs((values[i - k] as number) - m);
    out[i] = acc / period;
  }
  return out;
}

/** The rolling maximum over `period` bars, a gap where the window has one. */
export function highestOf(values: readonly number[], period: number): Ref {
  return extremeOf(values, period, true, false);
}

/** The rolling minimum over `period` bars, a gap where the window has one. */
export function lowestOf(values: readonly number[], period: number): Ref {
  return extremeOf(values, period, false, false);
}

/** How many bars back the window's extreme was set, 0 being this bar. */
export function highestBarsOf(values: readonly number[], period: number): Ref {
  return extremeOf(values, period, true, true);
}

export function lowestBarsOf(values: readonly number[], period: number): Ref {
  return extremeOf(values, period, false, true);
}

function extremeOf(
  values: readonly number[],
  period: number,
  wantHigh: boolean,
  asBars: boolean,
): Ref {
  const n = values.length;
  const out = filled(n);
  if (period <= 0) return out;
  for (let i = period - 1; i < n; i += 1) {
    let best = values[i - (period - 1)] as number;
    let back = period - 1;
    let ok = Number.isFinite(best);
    // Oldest first, so an equal value later in the window replaces the earlier
    // one and the answer is the most recent bar that set the extreme.
    for (let position = 1; position < period; position += 1) {
      const at = period - 1 - position;
      const v = values[i - at] as number;
      if (!Number.isFinite(v)) ok = false;
      if (wantHigh ? v >= best : v <= best) {
        best = v;
        back = at;
      }
    }
    if (ok) out[i] = asBars ? back : best;
  }
  return out;
}

/** `src - src[n]`, a gap for the first `n` bars. */
export function changeOf(values: readonly number[], n = 1): Ref {
  const len = values.length;
  const out = filled(len);
  for (let i = n; i < len; i += 1) out[i] = (values[i] as number) - (values[i - n] as number);
  return out;
}

/** `100 * (src - src[n]) / src[n]`, a gap for the first `n` bars. */
export function rateOfChange(values: readonly number[], n: number): Ref {
  const len = values.length;
  const out = filled(len);
  if (n <= 0) return out;
  for (let i = n; i < len; i += 1) {
    const base = values[i - n] as number;
    out[i] = base === 0 ? NaN : (100 * ((values[i] as number) - base)) / base;
  }
  return out;
}

/** The rolling total over `period` bars, oldest bar first. */
export function windowSum(values: readonly number[], period: number): Ref {
  const n = values.length;
  const out = filled(n);
  if (period <= 0 || n < period) return out;
  for (let i = period - 1; i < n; i += 1) {
    let acc = 0;
    for (let k = period - 1; k >= 0; k -= 1) acc += values[i - k] as number;
    out[i] = acc;
  }
  return out;
}

/** The running total from the first bar. A term the reference has none for counts as zero. */
export function runningTotal(values: readonly number[]): Ref {
  const n = values.length;
  const out = new Array<number>(n);
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    const v = values[i] as number;
    if (Number.isFinite(v)) acc += v;
    out[i] = acc;
  }
  return out;
}

/** The least squares line through the last `period` points, read `offset` bars back. */
export function regression(values: readonly number[], period: number, offset = 0): Ref {
  const n = values.length;
  const out = filled(n);
  if (period <= 1 || n < period) return out;
  const sumX = ((period - 1) * period) / 2;
  const sumXSqr = ((period - 1) * period * (2 * period - 1)) / 6;
  const divisor = period * sumXSqr - sumX * sumX;
  if (divisor === 0) return out;
  for (let i = period - 1; i < n; i += 1) {
    let sumY = 0;
    let sumXY = 0;
    let ok = true;
    for (let k = 0; k < period; k += 1) {
      const y = values[i - (period - 1 - k)] as number;
      if (!Number.isFinite(y)) ok = false;
      sumY += y;
      sumXY += y * k;
    }
    if (!ok) continue;
    const slope = (period * sumXY - sumX * sumY) / divisor;
    const intercept = (sumY - slope * sumX) / period;
    out[i] = intercept + slope * (period - 1 - offset);
  }
  return out;
}

/** The fixed four bar symmetric mean, weights 1, 2, 2, 1 over 6, from bar 3. */
export function symmetricMean(values: readonly number[]): Ref {
  const n = values.length;
  const out = filled(n);
  for (let i = 3; i < n; i += 1) {
    const a = values[i - 3] as number;
    const b = values[i - 2] as number;
    const c = values[i - 1] as number;
    const d = values[i] as number;
    out[i] = (a + 2 * b + 2 * c + d) / 6;
  }
  return out;
}

/**
 * The range position reading, where the three series are independent.
 *
 * The strength form of it passes one series in for all three, which is why this
 * cannot simply take bars.
 */
export function rangePosition(
  source: readonly number[],
  high: readonly number[],
  low: readonly number[],
  period: number,
): Ref {
  const n = source.length;
  const out = filled(n);
  const hi = highestOf(high, period);
  const lo = lowestOf(low, period);
  for (let i = 0; i < n; i += 1) {
    const top = hi[i] as number;
    const bottom = lo[i] as number;
    const span = top - bottom;
    out[i] = span === 0 ? NaN : (100 * ((source[i] as number) - bottom)) / span;
  }
  return out;
}

/** The true range: the widest of this bar's span and its two gaps to the previous close. */
export function trueRangeOf(bars: readonly RefBar[]): Ref {
  const n = bars.length;
  const out = filled(n);
  for (let i = 0; i < n; i += 1) {
    const bar = bars[i] as RefBar;
    if (i === 0) {
      out[i] = bar.high - bar.low;
      continue;
    }
    const previous = (bars[i - 1] as RefBar).close;
    out[i] = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previous),
      Math.abs(bar.low - previous),
    );
  }
  return out;
}

/** The average true range: the smoothing above, over the true range. */
export function averageTrueRange(bars: readonly RefBar[], period: number): Ref {
  return smoothMean(trueRangeOf(bars), period);
}

/** The typical price of a bar, added high to low to close and then divided. */
export function typicalOf(bars: readonly RefBar[]): number[] {
  return bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
}

/** The midpoint of a bar's range. */
export function midOf(bars: readonly RefBar[]): number[] {
  return bars.map((bar) => (bar.high + bar.low) / 2);
}

/** Bars elapsed since the condition last held, a gap before the first time it did. */
export function barsSinceOf(condition: readonly boolean[]): Ref {
  const n = condition.length;
  const out = filled(n);
  let last = -1;
  for (let i = 0; i < n; i += 1) {
    if (condition[i] === true) last = i;
    if (last >= 0) out[i] = i - last;
  }
  return out;
}

/** Element-wise arithmetic over two reference columns, absence propagating. */
export function combine(
  a: readonly number[],
  b: readonly number[],
  how: (left: number, right: number) => number,
): Ref {
  const n = Math.max(a.length, b.length);
  const out = filled(n);
  for (let i = 0; i < n; i += 1) {
    const left = a[i] as number;
    const right = b[i] as number;
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    out[i] = how(left, right);
  }
  return out;
}

/** One column mapped, absence propagating. */
export function mapped(a: readonly number[], how: (value: number) => number): Ref {
  return a.map((value) => (Number.isFinite(value) ? how(value) : NaN));
}
