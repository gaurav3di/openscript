/**
 * `ma(src, len, type)`: one call whose shape a select input can switch.
 *
 * The point of it is that a study can offer its user a choice of average
 * without the script branching six ways, and without the six branches each
 * owning their own state. One call site, one state region, one line on the
 * chart.
 *
 * The step takes a source paired with its volume because one of the types is
 * volume weighted. A caller that will never select that type passes absence for
 * the volume and loses nothing.
 *
 * **Each type keeps its own corner of the region.** The key carries the type
 * name, so a run that switched type halfway would start the new average from
 * its own warmup rather than from whatever the old one had left in the record.
 */
import type { Series, StateRecord, Tail, Value } from '../values/index.js';
import { NONE, fold, tailOf } from '../values/index.js';

import type { Weighted } from './simple.js';
import { smaStep, vwmaStep, wmaStep } from './simple.js';
import { emaStep, rmaStep } from './exponential.js';
import { hmaStep } from './shaped.js';

/** The averages `ma` can be switched to, as `stdlib.md` section 4 lists them. */
export type MaType = 'sma' | 'ema' | 'wma' | 'rma' | 'hma' | 'vwma';

const TYPES: readonly string[] = ['sma', 'ema', 'wma', 'rma', 'hma', 'vwma'];

/** Whether a string names one of the six averages `ma` accepts. */
export function isMaType(name: string | null): name is MaType {
  return name !== null && TYPES.includes(name);
}

/**
 * `ma(src, len, type)`, with the warmup of whichever type was named.
 *
 * An unrecognised type is absence throughout, not a silent fall back to the
 * simple mean. A study that quietly drew a different average from the one its
 * settings say would be wrong in a way nobody could see.
 */
export function maStep(
  state: StateRecord,
  key: string,
  input: Weighted,
  len: number | null,
  type: MaType | null,
): Value {
  if (type === null) return NONE;
  const mine = `${key}${type}`;
  if (type === 'vwma') return vwmaStep(state, mine, input, len);
  if (type === 'sma') return smaStep(state, mine, input.src, len);
  if (type === 'ema') return emaStep(state, mine, input.src, len);
  if (type === 'wma') return wmaStep(state, mine, input.src, len);
  if (type === 'rma') return rmaStep(state, mine, input.src, len);
  if (type === 'hma') return hmaStep(state, mine, input.src, len);
  return NONE;
}

/** `ma(src, len, type)` as a tail. */
export function maTail(len: number, type: MaType): Tail<Weighted, Value> {
  return tailOf((state, input: Weighted) => maStep(state, 'q', input, len, type));
}

/** `ma(src, len, type)` over a whole series. */
export function ma(src: Series, volume: Series, len: number, type: MaType): Value[] {
  return fold(
    maTail(len, type),
    src.map((value, index) => ({ src: value, volume: volume[index] ?? NONE })),
  );
}
