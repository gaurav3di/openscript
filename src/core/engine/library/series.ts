/**
 * The series calls that hold state, `stdlib.md` sections 4 and 9.
 *
 * **Why these are written here and not called through to the numeric library.**
 * Every function in `src/core/stdlib` is a tail: a closure holding its own
 * variables, advanced one bar at a time. That shape is right for a library and
 * is the wrong shape for a state region, because `compiled-program.md` 2.11
 * requires a region to be snapshottable by a mechanical copy and a closure
 * cannot be copied by anything that does not know what is inside it. Rebuilding
 * one by replaying its inputs is what 6.2 refuses in as many words. So each
 * function below is the same arithmetic written against an explicit record, and
 * `tests/engine/library.test.ts` folds each one over a series and compares it
 * with the numeric library's own answer, bar by bar and bit for bit. That test
 * is what makes two implementations safe rather than a promise that they agree.
 *
 * Every one of them is short, because `state.ts` already holds the two pieces
 * they are all built from: a rolling lookback and a seeded recurrence.
 */
import { roundHalfAway } from '../../stdlib/index.js';
import type { Value } from '../values/index.js';
import { entry, lengthAt, numberAt } from './binding.js';
import type { CallContext, ManifestEntry } from './binding.js';
import { present, ring, safe, seeded, slot } from './state.js';
import type { StateField, StateRecord } from './state.js';

/** The source of a series call, which is absent unless it is a number. */
function source(args: readonly Value[], index: number): number | null {
  return numberAt(args, index);
}

/** A condition argument: true, false, or absent, which is its own answer. */
function condition(args: readonly Value[], index: number): boolean | null {
  const value = args[index];
  return typeof value === 'boolean' ? value : null;
}

/** `sma(src, len)`: the mean of the last `len` values, oldest first. */
export function smaStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  key = 'q',
): number | null {
  const lookback = ring(state, key, len);
  lookback.push(value);
  return lookback.mean();
}

/** `ema(src, len)`: weight `2 / (len + 1)`, seeded with the first `len` values. */
export function emaStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  key = 'e',
): number | null {
  if (len === null) return null;
  const weight = 2 / (len + 1);
  const rest = 1 - weight;
  return seeded(state, key, len, (previous, next) => next * weight + previous * rest)(value);
}

/**
 * `rma(src, len)`: the smoothing the classic oscillators use.
 *
 * Deliberately a different arrangement from `ema`. The two are the same
 * function in exact arithmetic and two different numbers in binary64, and each
 * is the arrangement its name has always meant: writing `rma` as a weight of
 * `1 / len` in `ema`'s shape would disagree in the last bits with every
 * implementation of the oscillators built on it.
 */
export function rmaStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  key = 'r',
): number | null {
  if (len === null) return null;
  return seeded(state, key, len, (previous, next) => (previous * (len - 1) + next) / len)(value);
}

/** `wma(src, len)`: linearly weighted, the newest value weighted `len`. */
function wmaStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  key = 'w',
): number | null {
  const lookback = ring(state, key, len);
  lookback.push(value);
  if (len === null || !lookback.complete()) return null;
  const divisor = (len * (len + 1)) / 2;
  let total = 0;
  // Oldest bar first, which is weight 1 first and weight `len` last.
  for (let back = len - 1; back >= 0; back -= 1) {
    total += (lookback.at(back) as number) * (len - back);
  }
  return safe(total / divisor);
}

/** Where the extreme sits in a complete lookback, as bars back from this one. */
function extremeBack(read: (back: number) => number | null, len: number, wantHigh: boolean): number {
  let best = read(len - 1) as number;
  let bestBack = len - 1;
  // Oldest first, so an equal value later in the lookback replaces the earlier
  // one and the answer is the most recent bar that set the extreme.
  for (let position = 1; position < len; position += 1) {
    const back = len - 1 - position;
    const value = read(back) as number;
    if (wantHigh ? value >= best : value <= best) {
      best = value;
      bestBack = back;
    }
  }
  return bestBack;
}

function extremeStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  wantHigh: boolean,
  asBars: boolean,
): number | null {
  const lookback = ring(state, 'q', len);
  lookback.push(value);
  if (len === null || !lookback.complete()) return null;
  const back = extremeBack((k) => lookback.at(k), len, wantHigh);
  return asBars ? back : safe(lookback.at(back) as number);
}

/** `change(src, len)`: `src - src[len]`. */
export function changeStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  key = 'c',
): number | null {
  const lookback = ring(state, key, len === null ? null : len + 1);
  lookback.push(value);
  if (len === null || !lookback.filled()) return null;
  const now = lookback.at(0);
  const then = lookback.at(len);
  if (!present(now) || !present(then)) return null;
  return safe(now - then);
}

/** `history(src, n)`: the value as it stood `n` bars ago. */
function historyStep(
  state: StateRecord,
  value: number | null,
  back: number | null,
  key = 'h',
): number | null {
  const lookback = ring(state, key, back === null ? null : back + 1);
  lookback.push(value);
  return back !== null && lookback.filled() ? lookback.at(back) : null;
}

/**
 * The crossing test, which keeps the two series apart rather than subtracting.
 *
 * A difference would round, and the whole test turns on whether one series was
 * at or below the other, which is the one place a rounded zero would change the
 * answer.
 */
function crossStep(
  state: StateRecord,
  a: number | null,
  b: number | null,
  direction: 'up' | 'down' | 'either',
): boolean | null {
  const left = ring(state, 'a', 2);
  const right = ring(state, 'b', 2);
  left.push(a);
  right.push(b);
  if (!left.filled()) return null;
  const nowA = left.at(0);
  const nowB = right.at(0);
  const beforeA = left.at(1);
  const beforeB = right.at(1);
  if (!present(nowA) || !present(nowB) || !present(beforeA) || !present(beforeB)) return null;
  const up = beforeA <= beforeB && nowA > nowB;
  const down = beforeA >= beforeB && nowA < nowB;
  if (direction === 'up') return up;
  if (direction === 'down') return down;
  return up || down;
}

function runStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  wantUp: boolean,
): boolean | null {
  const lookback = ring(state, 'q', len === null ? null : len + 1);
  lookback.push(value);
  if (len === null || !lookback.filled()) return null;
  // Oldest first, comparing each bar with the one before it.
  for (let back = len - 1; back >= 0; back -= 1) {
    const now = lookback.at(back);
    const before = lookback.at(back + 1);
    if (!present(now) || !present(before)) return null;
    if (wantUp ? !(now > before) : !(now < before)) return false;
  }
  return true;
}

/** The lookback's values as a plain list, for a call that has to sort them. */
function ordered(read: (back: number) => number | null, len: number): number[] {
  const out: number[] = [];
  for (let back = len - 1; back >= 0; back -= 1) out.push(read(back) as number);
  return out;
}

function percentileStep(
  state: StateRecord,
  value: number | null,
  len: number | null,
  p: number | null,
): number | null {
  const lookback = ring(state, 'q', len);
  lookback.push(value);
  if (len === null || p === null || !lookback.complete()) return null;
  if (!(p >= 0 && p <= 100)) return null;
  const sorted = ordered((back) => lookback.at(back), len).sort((a, b) => a - b);
  const rank = (p / 100) * (len - 1);
  const below = Math.floor(rank);
  const above = below + 1;
  const low = sorted[below] as number;
  if (above >= len) return safe(low);
  const high = sorted[above] as number;
  return safe(low + (rank - below) * (high - low));
}

/** `pivotHigh` and `pivotLow`, answered on the bar the pivot becomes knowable. */
function pivotStep(
  state: StateRecord,
  value: number | null,
  left: number | null,
  right: number | null,
  wantHigh: boolean,
): number | null {
  const span = left === null || right === null ? null : left + right + 1;
  const lookback = ring(state, 'q', span);
  lookback.push(value);
  if (span === null || right === null || !lookback.filled()) return null;
  const candidate = lookback.at(right);
  if (!present(candidate)) return null;
  for (let back = span - 1; back >= 0; back -= 1) {
    if (back === right) continue;
    const other = lookback.at(back);
    if (!present(other)) return null;
    // Strict on both sides: a run of equal highs has no single highest bar, and
    // picking one of them would make the answer depend on the scan direction.
    if (wantHigh ? other >= candidate : other <= candidate) return null;
  }
  return safe(candidate);
}

function stateful(name: string, params: string, call: ManifestEntry['call']): ManifestEntry {
  return entry(name, params, call, { state: true });
}

export const SERIES_ENTRIES: readonly ManifestEntry[] = [
  stateful('sma', 'src len', (ctx, args) =>
    smaStep(ctx.state, source(args, 0), lengthAt(ctx, 'sma', 'len', args, 1)),
  ),
  stateful('ema', 'src len', (ctx, args) =>
    emaStep(ctx.state, source(args, 0), lengthAt(ctx, 'ema', 'len', args, 1)),
  ),
  stateful('rma', 'src len', (ctx, args) =>
    rmaStep(ctx.state, source(args, 0), lengthAt(ctx, 'rma', 'len', args, 1)),
  ),
  stateful('wma', 'src len', (ctx, args) =>
    wmaStep(ctx.state, source(args, 0), lengthAt(ctx, 'wma', 'len', args, 1)),
  ),

  stateful('hma', 'src len', (ctx, args) => {
    const len = lengthAt(ctx, 'hma', 'len', args, 1);
    if (len === null) return null;
    const half = Math.max(1, Math.floor(len / 2));
    const outer = Math.max(1, roundHalfAway(Math.sqrt(len)));
    const near = wmaStep(ctx.state, source(args, 0), half, 'f');
    const far = wmaStep(ctx.state, source(args, 0), len, 's');
    const raw = present(near) && present(far) ? safe(2 * near - far) : null;
    return wmaStep(ctx.state, raw, outer, 'o');
  }),

  stateful('highest', 'src len', (ctx, args) =>
    extremeStep(ctx.state, source(args, 0), lengthAt(ctx, 'highest', 'len', args, 1), true, false),
  ),
  stateful('lowest', 'src len', (ctx, args) =>
    extremeStep(ctx.state, source(args, 0), lengthAt(ctx, 'lowest', 'len', args, 1), false, false),
  ),
  stateful('highestBars', 'src len', (ctx, args) =>
    extremeStep(ctx.state, source(args, 0), lengthAt(ctx, 'highestBars', 'len', args, 1), true, true),
  ),
  stateful('lowestBars', 'src len', (ctx, args) =>
    extremeStep(ctx.state, source(args, 0), lengthAt(ctx, 'lowestBars', 'len', args, 1), false, true),
  ),

  stateful('change', 'src', (ctx, args) => changeStep(ctx.state, source(args, 0), 1)),
  stateful('change', 'src len', (ctx, args) =>
    changeStep(ctx.state, source(args, 0), lengthAt(ctx, 'change', 'len', args, 1)),
  ),
  stateful('mom', 'src len', (ctx, args) =>
    changeStep(ctx.state, source(args, 0), lengthAt(ctx, 'mom', 'len', args, 1)),
  ),
  stateful('roc', 'src len', (ctx, args) => {
    const len = lengthAt(ctx, 'roc', 'len', args, 1);
    const value = source(args, 0);
    const then = historyStep(ctx.state, value, len);
    const delta = changeStep(ctx.state, value, len);
    if (!present(then) || !present(delta) || then === 0) return null;
    return safe((100 * delta) / then);
  }),
  stateful('history', 'src n', (ctx, args) => {
    const back = lengthAt(ctx, 'history', 'n', args, 1);
    return historyStep(ctx.state, source(args, 0), back);
  }),

  stateful('sum', 'src len', (ctx, args) => {
    const lookback = ring(ctx.state, 'q', lengthAt(ctx, 'sum', 'len', args, 1));
    lookback.push(source(args, 0));
    return lookback.sum();
  }),
  stateful('sumSkip', 'src len', (ctx, args) => {
    const lookback = ring(ctx.state, 'q', lengthAt(ctx, 'sumSkip', 'len', args, 1));
    lookback.push(source(args, 0));
    return lookback.sumPresent();
  }),
  stateful('avgSkip', 'src len', (ctx, args) => {
    const lookback = ring(ctx.state, 'q', lengthAt(ctx, 'avgSkip', 'len', args, 1));
    lookback.push(source(args, 0));
    if (!lookback.filled()) return null;
    const counted = lookback.presentCount();
    const total = lookback.sumPresent();
    if (counted === 0 || !present(total)) return null;
    return safe(total / counted);
  }),
  stateful('countPresent', 'src len', (ctx, args) => {
    const lookback = ring(ctx.state, 'q', lengthAt(ctx, 'countPresent', 'len', args, 1));
    lookback.push(source(args, 0));
    return lookback.filled() ? lookback.presentCount() : null;
  }),
  stateful('count', 'cond len', (ctx, args) => {
    const lookback = ring(ctx.state, 'q', lengthAt(ctx, 'count', 'len', args, 1));
    lookback.push(condition(args, 0) === true ? 1 : 0);
    return lookback.sum();
  }),

  // `cum` freezes on an absent bar rather than treating it as a zero: a total
  // that quietly skipped a gap would be a total over a shorter history than the
  // script believes it has.
  stateful('cum', 'src', (ctx, args) => {
    const value = source(args, 0);
    if (!present(value)) return null;
    const total = slot(ctx.state, 't', 0) + value;
    ctx.state['t'] = total;
    return safe(total);
  }),

  stateful('rising', 'src len', (ctx, args) =>
    runStep(ctx.state, source(args, 0), lengthAt(ctx, 'rising', 'len', args, 1), true),
  ),
  stateful('falling', 'src len', (ctx, args) =>
    runStep(ctx.state, source(args, 0), lengthAt(ctx, 'falling', 'len', args, 1), false),
  ),

  stateful('crossUp', 'a b', (ctx, args) =>
    crossStep(ctx.state, source(args, 0), source(args, 1), 'up'),
  ),
  stateful('crossDown', 'a b', (ctx, args) =>
    crossStep(ctx.state, source(args, 0), source(args, 1), 'down'),
  ),
  stateful('cross', 'a b', (ctx, args) =>
    crossStep(ctx.state, source(args, 0), source(args, 1), 'either'),
  ),

  // `barsSince` is absent until the condition has held once, which is what
  // makes a condition that has never held distinguishable from one that holds
  // on this bar.
  stateful('barsSince', 'cond', (ctx, args) => {
    const held = condition(args, 0);
    let since = slot(ctx.state, 's', -1);
    if (held === true) since = 0;
    else if (since >= 0) since += 1;
    ctx.state['s'] = since;
    return since < 0 ? null : since;
  }),

  stateful('valueWhen', 'cond src occurrence', (ctx, args) => valueWhenStep(ctx, args)),

  stateful('median', 'src len', (ctx, args) =>
    percentileStep(ctx.state, source(args, 0), lengthAt(ctx, 'median', 'len', args, 1), 50),
  ),
  stateful('percentile', 'src len p', (ctx, args) =>
    percentileStep(
      ctx.state,
      source(args, 0),
      lengthAt(ctx, 'percentile', 'len', args, 1),
      numberAt(args, 2),
    ),
  ),

  stateful('pivotHigh', 'src left right', (ctx, args) =>
    pivotStep(
      ctx.state,
      source(args, 0),
      lengthAt(ctx, 'pivotHigh', 'left', args, 1),
      lengthAt(ctx, 'pivotHigh', 'right', args, 2),
      true,
    ),
  ),
  stateful('pivotLow', 'src left right', (ctx, args) =>
    pivotStep(
      ctx.state,
      source(args, 0),
      lengthAt(ctx, 'pivotLow', 'left', args, 1),
      lengthAt(ctx, 'pivotLow', 'right', args, 2),
      false,
    ),
  ),
];

/**
 * `valueWhen(cond, src, occurrence)`: the source as it stood the last time the
 * condition held, or the one before that.
 *
 * The queue holds only the values the script can still ask for, which is what
 * keeps a region bounded: `occurrence` is read once, on the first bar that
 * reaches the call, and a region whose queue grew with the dataset would not be
 * copyable in the sense 2.11 requires.
 */
function valueWhenStep(ctx: CallContext, args: readonly Value[]): Value {
  const occurrence = numberAt(args, 2) ?? 0;
  if (!Number.isInteger(occurrence) || occurrence < 0) return null;
  const wanted = occurrence + 1;
  const hits = ctx.state['v'];
  const queue: StateField[] = Array.isArray(hits) ? hits : [];
  if (!Array.isArray(hits)) ctx.state['v'] = queue;
  if (condition(args, 0) === true) {
    queue.push(numberAt(args, 1));
    if (queue.length > wanted) queue.shift();
  }
  if (queue.length !== wanted) return null;
  return queue[0] ?? null;
}

