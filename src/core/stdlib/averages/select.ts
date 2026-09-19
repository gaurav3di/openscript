/**
 * `ma(src, len, type)`: one call whose shape a select input can switch.
 *
 * The point of it is that a study can offer its user a choice of average
 * without the script branching six ways, and without the six branches each
 * owning their own state. One call site, one state region, one line on the
 * chart.
 *
 * The tail takes a source paired with its volume because one of the types is
 * volume weighted. A caller that will never select that type passes absence for
 * the volume and loses nothing.
 */
import type { Series, Tail, Value } from '../values/index.js';
import { NONE, fold } from '../values/index.js';

import type { Weighted } from './simple.js';
import { smaTail, vwmaTail, wmaTail } from './simple.js';
import { emaTail, rmaTail } from './exponential.js';
import { hmaTail } from './shaped.js';

/** The averages `ma` can be switched to, as `stdlib.md` section 4 lists them. */
export type MaType = 'sma' | 'ema' | 'wma' | 'rma' | 'hma' | 'vwma';

/**
 * `ma(src, len, type)`, with the warmup of whichever type was named.
 *
 * An unrecognised type is absence throughout, not a silent fall back to the
 * simple mean. A study that quietly drew a different average from the one its
 * settings say would be wrong in a way nobody could see.
 */
export function maTail(len: number, type: MaType): Tail<Weighted, Value> {
  if (type === 'vwma') {
    return vwmaTail(len);
  }
  const plain =
    type === 'sma'
      ? smaTail(len)
      : type === 'ema'
        ? emaTail(len)
        : type === 'wma'
          ? wmaTail(len)
          : type === 'rma'
            ? rmaTail(len)
            : type === 'hma'
              ? hmaTail(len)
              : null;
  if (plain === null) {
    return { next: (): Value => NONE };
  }
  return {
    next(input: Weighted): Value {
      return plain.next(input.src);
    },
  };
}

/** `ma(src, len, type)` over a whole series. */
export function ma(src: Series, volume: Series, len: number, type: MaType): Value[] {
  return fold(
    maTail(len, type),
    src.map((value, index) => ({ src: value, volume: volume[index] ?? NONE })),
  );
}
