/**
 * A bar, and the derived prices a study reaches for by name.
 *
 * The functions `stdlib.md` writes without a source argument, `atr(len)` and
 * `cci(len)` among them, read the bar rather than a series. This library is
 * pure, so it takes the bar explicitly and an engine binds it; the function
 * names and the arithmetic are the specification's, the plumbing is not.
 *
 * `volume` is absent, not zero, on an instrument the host has no volume for
 * (`stdlib.md` section 3.1). Zero is a real reading meaning nobody traded, and
 * conflating the two would make a volume study draw a flat line where it should
 * draw nothing.
 */
import type { Value } from './value.js';
import { NONE, isPresent, result } from './value.js';

/** One bar of price and quantity. */
export interface Bar {
  readonly open: Value;
  readonly high: Value;
  readonly low: Value;
  readonly close: Value;
  readonly volume: Value;
}

/** `(high + low) / 2`, the bar's midpoint. */
export function hl2(bar: Bar): Value {
  if (!isPresent(bar.high) || !isPresent(bar.low)) return NONE;
  return result((bar.high + bar.low) / 2);
}

/** `(high + low + close) / 3`, the typical price. */
export function hlc3(bar: Bar): Value {
  if (!isPresent(bar.high) || !isPresent(bar.low) || !isPresent(bar.close)) return NONE;
  return result((bar.high + bar.low + bar.close) / 3);
}

/** `(open + high + low + close) / 4`, the average price. */
export function ohlc4(bar: Bar): Value {
  if (!isPresent(bar.open) || !isPresent(bar.high)) return NONE;
  if (!isPresent(bar.low) || !isPresent(bar.close)) return NONE;
  return result((bar.open + bar.high + bar.low + bar.close) / 4);
}

/** `(high + low + close + close) / 4`, the close-weighted average price. */
export function hlcc4(bar: Bar): Value {
  if (!isPresent(bar.high) || !isPresent(bar.low) || !isPresent(bar.close)) return NONE;
  return result((bar.high + bar.low + bar.close + bar.close) / 4);
}
