/**
 * The studies built out of the pieces in `series.ts`: range, deviation, bands
 * and the two trend calls.
 *
 * Each one is a composition and nothing more, which is the point of writing the
 * library as tails in the first place: `atr` is `rma` over true range, `rsi` is
 * two `rma`s over the two halves of a change, `bollinger` is `sma` and `stdev`,
 * and `macd` is three `ema`s. A composition keeps one accumulation order rather
 * than inventing a second, and it is why the warmups in `stdlib.md` compose
 * instead of being asserted.
 *
 * The several calls that return more than one number return an array, which is
 * the language's own way of handing back a trio (`stdlib.md` sections 5 and 6),
 * so the value they push is a fresh reference into the heap on every bar.
 */
import type { Value } from '../values/index.js';
import { reference } from '../values/index.js';
import { boolAt, entry, lengthAt, numberAt } from './binding.js';
import type { CallContext, ManifestEntry } from './binding.js';
import { changeStep, emaStep, rmaStep, smaStep } from './series.js';
import { flag, present, ring, safe, slot } from './state.js';
import type { StateRecord } from './state.js';

/** An array of values built fresh for this bar, as a multi-value call returns. */
function trio(ctx: CallContext, items: Value[]): Value {
  return reference(ctx.heap.allocate({ kind: 'array', items }));
}

/**
 * True range, with the one deliberate exception to absence propagation in the
 * whole library.
 *
 * On bar 0 it is `high - low`: the other two terms need the previous close,
 * which does not exist there, and propagating absence would start `atr` one bar
 * later than every reference implementation while adding nothing, because the
 * bar's own range is a true statement about that bar.
 */
export function trueRangeOf(ctx: CallContext, allowFirstBar: boolean): number | null {
  const { high, low, previousClose } = ctx.bar;
  if (ctx.bar.index === 0) {
    return allowFirstBar && present(high) && present(low) ? safe(high - low) : null;
  }
  if (!present(high) || !present(low) || !present(previousClose)) return null;
  const within = high - low;
  const upGap = Math.abs(high - previousClose);
  const downGap = Math.abs(low - previousClose);
  return safe(Math.max(within, upGap, downGap));
}

function atrOf(ctx: CallContext, len: number | null): number | null {
  return rmaStep(ctx.state, trueRangeOf(ctx, true), len, 'a');
}

/** `variance(src, len, sample)`: the mean square deviation over the lookback. */
function varianceOf(
  state: StateRecord,
  value: number | null,
  len: number | null,
  sample: boolean,
  key = 'q',
): number | null {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (len === null) return null;
  const divisor = sample ? len - 1 : len;
  if (!lookback.complete() || divisor <= 0) return null;
  const mean = lookback.mean();
  if (!present(mean)) return null;
  let squares = 0;
  // Oldest bar first, the order every lookback in this engine sums in.
  for (let back = len - 1; back >= 0; back -= 1) {
    const deviation = (lookback.at(back) as number) - mean;
    squares += deviation * deviation;
  }
  return safe(squares / divisor);
}

function stdevOf(
  state: StateRecord,
  value: number | null,
  len: number | null,
  sample: boolean,
  key = 'q',
): number | null {
  const squared = varianceOf(state, value, len, sample, key);
  if (!present(squared) || squared < 0) return null;
  return safe(Math.sqrt(squared));
}

/** `bollinger(src, len, mult)`: basis, upper, lower. */
function bollingerOf(
  state: StateRecord,
  value: number | null,
  len: number | null,
  mult: number | null,
): (number | null)[] {
  const middle = smaStep(state, value, len);
  const deviation = stdevOf(state, value, len, false, 'd');
  if (!present(middle) || !present(deviation) || mult === null) return [middle, null, null];
  return [middle, safe(middle + mult * deviation), safe(middle - mult * deviation)];
}

/**
 * `rsi(src, len)`: from bar `len`, not bar `len - 1`.
 *
 * It needs `len` changes and a change needs two bars, so the smoothing's
 * lookback is bars 1 to `len`. Every entry in `stdlib.md` section 5 that
 * consumes changes rather than levels carries the same extra bar.
 */
function rsiOf(ctx: CallContext, value: number | null, len: number | null): number | null {
  const delta = changeStep(ctx.state, value, 1);
  const up = present(delta) ? safe(Math.max(delta, 0)) : null;
  const down = present(delta) ? safe(Math.max(-delta, 0)) : null;
  const averageUp = rmaStep(ctx.state, up, len, 'u');
  const averageDown = rmaStep(ctx.state, down, len, 'd');
  if (!present(averageUp) || !present(averageDown)) return null;
  // No down bar in the lookback is the top of the scale. This also catches a
  // lookback that never moved at all, where both averages are zero and the
  // ratio has no value; every reference implementation reads 100 there.
  if (averageDown === 0) return 100;
  return safe(100 - 100 / (1 + averageUp / averageDown));
}

/** `supertrend(factor, atrLen)`: the trailing band, and which side it is on. */
function supertrendOf(
  ctx: CallContext,
  factor: number | null,
  atrLen: number | null,
): (number | null)[] {
  const state = ctx.state;
  const width = atrOf(ctx, atrLen);
  const { high, low, close } = ctx.bar;
  const midpoint = present(high) && present(low) ? safe((high + low) / 2) : null;
  if (!present(width) || !present(midpoint) || !present(close) || factor === null) {
    return [null, null];
  }

  const rawUpper = midpoint + factor * width;
  const rawLower = midpoint - factor * width;
  const started = flag(state, 'k');
  const previousUpper = slot(state, 'pu', 0);
  const previousLower = slot(state, 'pl', 0);
  const previousClose = slot(state, 'pc', 0);
  let followingUpper = state['fu'] !== false;

  // The band holds where it is unless price broke it or it moved inward.
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

  let line: number;
  if (!started || followingUpper) {
    if (close <= upper) {
      line = upper;
      followingUpper = true;
    } else {
      line = lower;
      followingUpper = false;
    }
  } else if (close >= lower) {
    line = lower;
    followingUpper = false;
  } else {
    line = upper;
    followingUpper = true;
  }

  const first = !started;
  state['k'] = true;
  state['pu'] = upper;
  state['pl'] = lower;
  state['pc'] = close;
  state['fu'] = followingUpper;

  if (first) return [null, null];
  return [safe(line), followingUpper ? 1 : -1];
}

function stateful(name: string, params: string, call: ManifestEntry['call']): ManifestEntry {
  return entry(name, params, call, { state: true });
}

export const STUDY_ENTRIES: readonly ManifestEntry[] = [
  entry('trueRange', '', (ctx) => trueRangeOf(ctx, true)),

  stateful('atr', 'len', (ctx, args) => atrOf(ctx, lengthAt(ctx, 'atr', 'len', args, 0))),

  stateful('natr', 'len', (ctx, args) => {
    const average = atrOf(ctx, lengthAt(ctx, 'natr', 'len', args, 0));
    const close = ctx.bar.close;
    if (!present(average) || !present(close) || close === 0) return null;
    return safe((100 * average) / close);
  }),

  stateful('stdev', 'src len sample', (ctx, args) =>
    stdevOf(
      ctx.state,
      numberAt(args, 0),
      lengthAt(ctx, 'stdev', 'len', args, 1),
      boolAt(args, 2) === true,
    ),
  ),

  stateful('variance', 'src len sample', (ctx, args) =>
    varianceOf(
      ctx.state,
      numberAt(args, 0),
      lengthAt(ctx, 'variance', 'len', args, 1),
      boolAt(args, 2) === true,
    ),
  ),

  stateful('rsi', 'src len', (ctx, args) =>
    rsiOf(ctx, numberAt(args, 0), lengthAt(ctx, 'rsi', 'len', args, 1)),
  ),

  stateful('bollinger', 'src len mult', (ctx, args) =>
    trio(
      ctx,
      bollingerOf(
        ctx.state,
        numberAt(args, 0),
        lengthAt(ctx, 'bollinger', 'len', args, 1),
        numberAt(args, 2),
      ),
    ),
  ),

  stateful('bbWidth', 'src len mult', (ctx, args) => {
    const bands = bollingerOf(
      ctx.state,
      numberAt(args, 0),
      lengthAt(ctx, 'bbWidth', 'len', args, 1),
      numberAt(args, 2),
    );
    const [basis, upper, lower] = bands;
    if (!present(basis ?? null) || !present(upper ?? null) || !present(lower ?? null)) return null;
    if (basis === 0) return null;
    return safe(((upper as number) - (lower as number)) / (basis as number));
  }),

  stateful('bbPercent', 'src len mult', (ctx, args) => {
    const value = numberAt(args, 0);
    const bands = bollingerOf(
      ctx.state,
      value,
      lengthAt(ctx, 'bbPercent', 'len', args, 1),
      numberAt(args, 2),
    );
    const upper = bands[1] ?? null;
    const lower = bands[2] ?? null;
    if (!present(value) || !present(upper) || !present(lower) || upper === lower) return null;
    return safe((value - lower) / (upper - lower));
  }),

  stateful('macd', 'src fast slow signal', (ctx, args) => {
    const value = numberAt(args, 0);
    const near = emaStep(ctx.state, value, lengthAt(ctx, 'macd', 'fast', args, 1));
    const far = emaStep(ctx.state, value, lengthAt(ctx, 'macd', 'slow', args, 2), 'g');
    const line = present(near) && present(far) ? safe(near - far) : null;
    const trigger = emaStep(ctx.state, line, lengthAt(ctx, 'macd', 'signal', args, 3), 'i');
    const histogram = present(line) && present(trigger) ? safe(line - trigger) : null;
    return trio(ctx, [line, trigger, histogram]);
  }),

  stateful('supertrend', 'factor atrLen', (ctx, args) =>
    trio(
      ctx,
      supertrendOf(ctx, numberAt(args, 0), lengthAt(ctx, 'supertrend', 'atrLen', args, 1)),
    ),
  ),

  stateful('donchian', 'len', (ctx, args) => {
    const len = lengthAt(ctx, 'donchian', 'len', args, 0);
    const highs = ring(ctx.state, 'h', len);
    const lows = ring(ctx.state, 'l', len);
    highs.push(ctx.bar.high);
    lows.push(ctx.bar.low);
    if (len === null || !highs.complete() || !lows.complete()) return trio(ctx, [null, null, null]);
    let top = highs.at(len - 1) as number;
    let bottom = lows.at(len - 1) as number;
    for (let back = len - 1; back >= 0; back -= 1) {
      const high = highs.at(back) as number;
      const low = lows.at(back) as number;
      if (high > top) top = high;
      if (low < bottom) bottom = low;
    }
    return trio(ctx, [safe((top + bottom) / 2), safe(top), safe(bottom)]);
  }),
];
