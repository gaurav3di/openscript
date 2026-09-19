/**
 * The lookback volume readings: `cmf`, `mfi`, `eom`, `forceIndex` and
 * `relativeVolume`.
 */
import type { Bar, Tail, Value } from '../values/index.js';
import { NONE, fold, hl2, hlc3, isPresent, result } from '../values/index.js';
import { emaTail, smaTail } from '../averages/index.js';
import { changeTail, sumTail } from '../series/index.js';

import { moneyFlow } from './accumulation.js';

/** `cmf(len)`: accumulation over the lookback as a fraction of its volume, from bar `len - 1`. */
export function cmfTail(len = 20): Tail<Bar, Value> {
  const flows = sumTail(len);
  const quantities = sumTail(len);
  return {
    next(bar: Bar): Value {
      const flow = flows.next(moneyFlow(bar));
      const traded = quantities.next(bar.volume);
      if (!isPresent(flow) || !isPresent(traded) || !(traded > 0)) return NONE;
      return result(flow / traded);
    },
  };
}

/** `cmf(len)` over a run of bars. */
export function cmf(bars: readonly Bar[], len = 20): Value[] {
  return fold(cmfTail(len), bars);
}

/**
 * `mfi(len)`: the strength reading computed on money flow rather than price,
 * from bar `len`.
 *
 * A bar's whole flow counts on one side or the other, by whether the typical
 * price rose or fell, so the first lookback is bars 1 to `len` and the extra bar
 * is in the declared warmup.
 */
export function mfiTail(len = 14): Tail<Bar, Value> {
  const positives = sumTail(len);
  const negatives = sumTail(len);
  let previousTypical: Value = NONE;
  let seenABar = false;
  return {
    next(bar: Bar): Value {
      const typical = hlc3(bar);
      const before = previousTypical;
      const started = seenABar;
      seenABar = true;
      previousTypical = typical;

      let up: Value = NONE;
      let down: Value = NONE;
      if (started && isPresent(typical) && isPresent(before) && isPresent(bar.volume)) {
        const flow = result(typical * bar.volume);
        up = typical > before ? flow : 0;
        down = typical < before ? flow : 0;
      }

      const rise = positives.next(up);
      const fall = negatives.next(down);
      if (!isPresent(rise) || !isPresent(fall)) return NONE;
      // No down bar in the lookback is the top of the scale, as in `rsi`.
      if (fall === 0) return 100;
      return result(100 - 100 / (1 + rise / fall));
    },
  };
}

/** `mfi(len)` over a run of bars. */
export function mfi(bars: readonly Bar[], len = 14): Value[] {
  return fold(mfiTail(len), bars);
}

/**
 * `eom(len)`: how far price moved per unit of volume, from bar `len`.
 *
 * The midpoint's move, times the bar's range, over the volume traded, then
 * averaged over the lookback. The midpoint move needs the previous bar, so the
 * average's lookback starts at bar 1 and the first reading is at bar `len`.
 *
 * **No scaling constant.** Implementations of this reading usually multiply by
 * a large divisor whose only job is to bring the number into a readable range,
 * and they do not agree on it. `stdlib.md` section 7 declares `eom(len = 14)`
 * with no such argument, so there is none here and the reading is the quantity
 * itself. That leaves it very small on a liquid instrument, which is recorded
 * as a gap in the specification rather than papered over with a constant this
 * library invented.
 */
export function eomTail(len = 14): Tail<Bar, Value> {
  const move = changeTail(1);
  const average = smaTail(len);
  return {
    next(bar: Bar): Value {
      const travelled = move.next(hl2(bar));
      let term: Value = NONE;
      if (
        isPresent(travelled) &&
        isPresent(bar.high) &&
        isPresent(bar.low) &&
        isPresent(bar.volume) &&
        bar.volume !== 0
      ) {
        term = result((travelled * (bar.high - bar.low)) / bar.volume);
      }
      return average.next(term);
    },
  };
}

/** `eom(len)` over a run of bars. */
export function eom(bars: readonly Bar[], len = 14): Value[] {
  return fold(eomTail(len), bars);
}

/** `forceIndex(len)`: change times volume, smoothed, from bar `len`. */
export function forceIndexTail(len = 13): Tail<Bar, Value> {
  const move = changeTail(1);
  const smooth = emaTail(len);
  return {
    next(bar: Bar): Value {
      const moved = move.next(bar.close);
      const force =
        isPresent(moved) && isPresent(bar.volume) ? result(moved * bar.volume) : NONE;
      return smooth.next(force);
    },
  };
}

/** `forceIndex(len)` over a run of bars. */
export function forceIndex(bars: readonly Bar[], len = 13): Value[] {
  return fold(forceIndexTail(len), bars);
}

/** `relativeVolume(len)`: this bar's volume over its own recent average, from bar `len - 1`. */
export function relativeVolumeTail(len = 20): Tail<Bar, Value> {
  const average = smaTail(len);
  return {
    next(bar: Bar): Value {
      const mean = average.next(bar.volume);
      if (!isPresent(mean) || !isPresent(bar.volume) || mean === 0) return NONE;
      return result(bar.volume / mean);
    },
  };
}

/** `relativeVolume(len)` over a run of bars. */
export function relativeVolume(bars: readonly Bar[], len = 20): Value[] {
  return fold(relativeVolumeTail(len), bars);
}
