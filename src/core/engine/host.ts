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
import type { HostBar } from './bars.js';
import type { PendingEffect } from './channels.js';
import type { HostFacts } from './library/index.js';
import type { SessionHours } from './session/index.js';
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
  /**
   * The instrument's trading session, `host-interface.md` 4.3.
   *
   * The documented source of every per-bar session fact, and the only one: the
   * engine derives `session.isFirstBar` and `session.isLastBar` from this
   * hours, the bar's time and the timezone above. A host states the hours it
   * schedules, once, and is never asked about a bar.
   */
  readonly session?: SessionHours;
}

/** The strategy's position, until a backtester owns one. */
export interface Position {
  readonly size?: number;
  readonly avgPrice?: number;
}

/** Where an applied effect goes: an order route, a log, or nothing at all. */
export type EffectRoute = (effect: PendingEffect, bar: number) => void;

/**
 * One read, as the host is asked about it, `host-interface.md` 5.2.
 *
 * The whole set is handed over at load and never grows during a run: a
 * request's identity is fixed before bar 0, which is what lets a host fetch in
 * parallel, cache by instrument and timeframe, and have the answers in hand
 * before the first bar runs.
 */
export interface RequestQuery {
  /** The engine's handle, which every answer and every refusal carries back. */
  readonly id: number;
  readonly read: 'timeframe' | 'symbol';
  /** The instrument, or nothing on a read of the chart's own. */
  readonly symbol: string | null;
  /** Where it trades, or nothing when the script named none. */
  readonly exchange: string | null;
  /** A timeframe string, `stdlib.md` 15.2, resolved from the program. */
  readonly timeframe: string;
  readonly mode: 'confirmed' | 'developing' | 'lookahead';
  /**
   * Requested bars of history the expression needs, or nothing when no number
   * is known.
   *
   * A floor rather than a promise: a host that extends the range backwards by
   * less gets a read that is absent for longer, never a wrong number.
   */
  readonly warmup: number | null;
}

/**
 * Why a host cannot answer, `host-interface.md` 5.4.
 *
 * **A refusal is reported and is never an empty answer**, because an empty
 * series looks exactly like an instrument that did not trade. The reason text
 * reaches the script through `req.error(read)`, and the study keeps drawing
 * everything that does not depend on the failed read.
 */
export interface RequestRefusal {
  readonly code: 'OS6007' | 'OS6008' | 'OS6009' | 'OS6014' | 'OS6015';
  /** The host's own words, carried and never paraphrased, for OS6009. */
  readonly reason?: string;
  /** The intervals the host does serve for this instrument, for OS6014. */
  readonly available?: string;
}

/**
 * What a host says about one read.
 *
 * `bars` is the answer: the host's own bars at the requested timeframe, oldest
 * first, never padded or synthesised. `refused` is 5.4.
 *
 * `pending` is a host that is still fetching. The read is absent and
 * `req.isReady` is false, and it stays that way for this run: 5.3 delivers an
 * answer between bars and then recalculates the study over its whole history,
 * which is a fresh load rather than an answer spliced into a run already past
 * the bars it would have changed. A host that wants the engine to fold the
 * chart's own bars instead returns nothing at all.
 */
export type RequestAnswer =
  | { readonly bars: readonly HostBar[] }
  | { readonly pending: true }
  | { readonly refused: RequestRefusal };

/**
 * Where the engine asks for another instrument's or another interval's bars.
 *
 * Returning nothing means the host does not serve this request. On a read of
 * the chart's own instrument that is the ordinary case and the engine folds the
 * bars it already holds; on a read of another instrument the engine holds none
 * of them, so nothing to serve is OS6007.
 */
export type RequestProvider = (query: RequestQuery) => RequestAnswer | undefined;

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
  /**
   * Bars for another instrument or another interval, `host-interface.md` 5.
   *
   * Optional, and the capability follows it: a host with no provider declares
   * no `req.symbol`, so a program that reads another instrument is refused at
   * load with OS6006 naming the tag rather than drawing a study with a silently
   * empty line through it. `req.timeframe` needs no provider, because the
   * engine folds the chart's own bars, which is the read 5.1 says an engine can
   * satisfy from what it already holds.
   */
  readonly requestBars?: RequestProvider;
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

/**
 * What the request set can say about a read, so this file need not know it.
 *
 * `req.isReady` and `req.error` name a read rather than taking its value, which
 * is why the compiler resolved the name to the request's id: a value on a bar
 * cannot say which request produced it (2.16). A read this program does not
 * make has not been answered and has reported no reason.
 */
export interface RequestReplies {
  answered(id: Value): Value;
  failure(id: Value): Value;
}

/**
 * The facts a library call reads, built over one host.
 *
 * The host is fetched through a function rather than captured, because a host
 * may be replaced between two runs of one engine and every read here has to see
 * the one in force now. Every entry is one row of `compiled-program.md` 5.2 and
 * there is no row that is not on that list.
 */
export function hostFactsFor(of: () => EngineHost, reads: RequestReplies): HostFacts {
  return {
    symbol: () => hostString(of().instrument?.symbol),
    exchange: () => hostString(of().instrument?.exchange),
    interval: () => hostString(of().instrument?.interval),
    timezone: () => hostString(of().instrument?.timezone),
    tickSize: () => hostNumber(of().instrument?.tickSize),
    lotSize: () => hostNumber(of().instrument?.lotSize),
    pointValue: () => hostNumber(of().instrument?.pointValue),
    currency: () => hostString(of().instrument?.currency),
    instrumentType: () => hostString(of().instrument?.instrumentType),
    hasVolume: () => hostBool(of().instrument?.hasVolume),
    hasOpenInterest: () => hostBool(of().instrument?.hasOpenInterest),
    now: () => hostNumber(of().now),
    requestReady: (id: Value) => reads.answered(id),
    requestError: (id: Value) => reads.failure(id),
    positionSize: () => hostNumber(of().position?.size),
    positionPrice: () => hostNumber(of().position?.avgPrice),
  };
}
