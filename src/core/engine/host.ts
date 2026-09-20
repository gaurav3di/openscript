/**
 * What a host supplies, `compiled-program.md` 5.2.
 *
 * An engine reads all of this from the host and none of it from anywhere else.
 * The interface is small on purpose: every fact on it is one a host already
 * has, and nothing on it is something an engine could work out and then
 * disagree with the host about.
 *
 * Every fact is optional and an absent one reads as absence in a script rather
 * than as a zero or an error. A study that sizes something by the lot size has
 * to be able to tell "one" from "nobody told me", which is the same argument
 * 2.10 makes for an absent volume.
 *
 * **There is no clock on this interface except `chart.now`.** Section 8.4 is
 * explicit: no wall clock during a bar, except `chart.now()`, whose value the
 * host supplies and the conformance suite fixes. The engine's own wall clock
 * budget is passed separately, in `LoadOptions`, because it decides when to
 * stop rather than what a script computes.
 */
import type { PendingEffect } from './channels.js';
import type { Value } from './values/index.js';

/** The instrument record, `host-interface.md` 4.1, as the engine reads it. */
export interface Instrument {
  readonly symbol?: string;
  readonly exchange?: string;
  /** The chart's interval code, which `chart.intervalMinutes` is derived from. */
  readonly interval?: string;
  /** An IANA zone name, never a fixed offset, `host-interface.md` 4.1. */
  readonly timezone?: string;
  readonly tickSize?: number;
  readonly lotSize?: number;
  readonly pointValue?: number;
  readonly currency?: string;
  readonly instrumentType?: string;
  /** The one fact a host must state, because no derivation recovers it. */
  readonly hasVolume?: boolean;
  readonly hasOpenInterest?: boolean;
}

/** The strategy's position, until a backtester owns one. */
export interface Position {
  readonly size?: number;
  readonly avgPrice?: number;
}

/** Where an applied effect goes: an order route, a log, or nothing at all. */
export type EffectRoute = (effect: PendingEffect, bar: number) => void;

export interface EngineHost {
  readonly instrument?: Instrument;
  /** The chart clock, for `chart.now()`. Fixed by the host, never read here. */
  readonly now?: number;
  readonly position?: Position;
  /**
   * Where step 9 sends an applied effect.
   *
   * An engine with no route still runs every study ever written and refuses
   * exactly the strategies, because `orders` is then a capability it does not
   * declare and OS6006 names it at load.
   */
  readonly route?: EffectRoute;
}

/** A number the host stated, or absence when it stated none. */
export function hostNumber(value: number | undefined): Value {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function hostString(value: string | undefined): Value {
  return typeof value === 'string' ? value : null;
}

/** A condition the host stated, or absence when it stated none. */
export function hostBool(value: boolean | undefined): Value {
  return typeof value === 'boolean' ? value : null;
}
