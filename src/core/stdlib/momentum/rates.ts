/**
 * The readings taken from change rather than from level: `mom`, `roc`, `cmo`,
 * `trix`, `tsi` and `dpo`.
 *
 * Each one's warmup carries the extra bar a change costs, and `stdlib.md`
 * section 5 states it in the entry rather than leaving it to be derived.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, isPresent, result, tailOf } from '../values/index.js';
import { emaTail, smaTail } from '../averages/index.js';
import { changeStep, changeTail, historyStep, historyTail, sumTail } from '../series/index.js';

/** `mom(src, len)`: `src - src[len]`, from bar `len`. */
export function momTail(len = 10): Tail<Value, Value> {
  return changeTail(len);
}

/** `mom(src, len)` over a whole series. */
export function mom(src: Series, len = 10): Value[] {
  return fold(momTail(len), src);
}

/** `roc(src, len)`: the same change as a percentage of the older value, from bar `len`. */
export function rocStep(
  state: StateRecord,
  key: string,
  value: Value,
  len: number | null,
): Value {
  const then = historyStep(state, `${key}h`, value, len);
  const delta = changeStep(state, `${key}c`, value, len);
  if (!isPresent(then) || !isPresent(delta) || then === 0) return NONE;
  return result((100 * delta) / then);
}

/** `roc(src, len)` as a tail. */
export function rocTail(len = 9): Tail<Value, Value> {
  return tailOf((state, value: Value) => rocStep(state, '', value, len));
}

/** `roc(src, len)` over a whole series. */
export function roc(src: Series, len = 9): Value[] {
  return fold(rocTail(len), src);
}

/**
 * `cmo(src, len)`: up sum less down sum over their total, -100 to 100, from bar
 * `len`.
 *
 * Unsmoothed, which is the whole point of it: the sums are taken over the
 * lookback outright rather than through an average, so a turn shows on the bar it
 * happens.
 */
export function cmoTail(len = 9): Tail<Value, Value> {
  const step = changeTail(1);
  const ups = sumTail(len);
  const downs = sumTail(len);
  return {
    next(value: Value): Value {
      const delta = step.next(value);
      const up = isPresent(delta) ? result(Math.max(delta, 0)) : NONE;
      const down = isPresent(delta) ? result(Math.max(-delta, 0)) : NONE;
      const rise = ups.next(up);
      const fall = downs.next(down);
      if (!isPresent(rise) || !isPresent(fall)) return NONE;
      const total = rise + fall;
      if (total === 0) return NONE;
      return result((100 * (rise - fall)) / total);
    },
  };
}

/** `cmo(src, len)` over a whole series. */
export function cmo(src: Series, len = 9): Value[] {
  return fold(cmoTail(len), src);
}

/**
 * `trix(src, len)`: the rate of change of a triple exponential mean, from bar
 * `3 * len - 2`.
 *
 * `stdlib.md` section 5 says rate of change, so this is the percentage change
 * of the smoothed series over one bar. The other reading in circulation takes
 * the change of the logarithm of the average instead; it is a different number
 * and it is not what the entry describes.
 */
export function trixTail(len = 18): Tail<Value, Value> {
  const first = emaTail(len);
  const second = emaTail(len);
  const third = emaTail(len);
  const back = historyTail(1);
  return {
    next(value: Value): Value {
      const smoothed = third.next(second.next(first.next(value)));
      const before = back.next(smoothed);
      if (!isPresent(smoothed) || !isPresent(before) || before === 0) return NONE;
      return result((100 * (smoothed - before)) / before);
    },
  };
}

/** `trix(src, len)` over a whole series. */
export function trix(src: Series, len = 18): Value[] {
  return fold(trixTail(len), src);
}

/**
 * `tsi(src, longLen, shortLen)`: double smoothed momentum, from bar
 * `longLen + shortLen - 1`.
 *
 * The change smoothed twice, over the size of the change smoothed the same way
 * twice, so the result is a direction rather than a magnitude and the noise
 * `mom` carries is gone.
 */
export function tsiTail(longLen = 25, shortLen = 13): Tail<Value, Value> {
  const step = changeTail(1);
  const longMomentum = emaTail(longLen);
  const shortMomentum = emaTail(shortLen);
  const longSize = emaTail(longLen);
  const shortSize = emaTail(shortLen);
  return {
    next(value: Value): Value {
      const delta = step.next(value);
      const size = isPresent(delta) ? result(Math.abs(delta)) : NONE;
      const direction = shortMomentum.next(longMomentum.next(delta));
      const magnitude = shortSize.next(longSize.next(size));
      if (!isPresent(direction) || !isPresent(magnitude) || magnitude === 0) return NONE;
      return result((100 * direction) / magnitude);
    },
  };
}

/** `tsi(src, longLen, shortLen)` over a whole series. */
export function tsi(src: Series, longLen = 25, shortLen = 13): Value[] {
  return fold(tsiTail(longLen, shortLen), src);
}

/**
 * `dpo(src, len)`: price with its displaced mean removed, from bar
 * `len + floor(len / 2)`.
 *
 * The mean is read `floor(len / 2) + 1` bars back rather than at this bar,
 * which is what "displaced" means here and what the declared warmup requires:
 * the average's own first value at bar `len - 1`, plus the displacement, is
 * exactly `len + floor(len / 2)`. Removing an undisplaced mean would be a
 * different study with a warmup of `len - 1`.
 */
export function dpoTail(len = 21): Tail<Value, Value> {
  const average = smaTail(len);
  const displaced = historyTail(Math.floor(len / 2) + 1);
  return {
    next(value: Value): Value {
      const mean = displaced.next(average.next(value));
      if (!isPresent(value) || !isPresent(mean)) return NONE;
      return result(value - mean);
    },
  };
}

/** `dpo(src, len)` over a whole series. */
export function dpo(src: Series, len = 21): Value[] {
  return fold(dpoTail(len), src);
}
