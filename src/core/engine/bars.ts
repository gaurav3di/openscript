/**
 * Step 4 of the bar cycle: the host's bar written into every `"bar"` register.
 *
 * The derived price fields are written out as expressions rather than as
 * formulas because **their order of operations is part of the contract**
 * (`compiled-program.md` 2.10): `hlc3` adds high to low, adds close to that,
 * then divides. A different association gives a different last bit, and a study
 * that matches a reference implementation on one engine and not on another is
 * exactly the failure this project exists to prevent.
 *
 * **An absent volume rather than a zero is deliberate**, on the same ground as
 * the chart contract's treatment of an unknown tick size: a script that sizes
 * something by volume has to be able to tell "no trades" from "nobody told me".
 *
 * Four of the eight bar facts are the host's and four are the engine's, and a
 * fact the engine can derive is never also stated by the host, because two
 * sources for one number can disagree and no rule would say which of them wins.
 */
import type { Value } from './values/index.js';
import { ABSENT, numberValue } from './values/index.js';

/** One bar as a host supplies it. */
export interface HostBar {
  readonly open: number | null;
  readonly high: number | null;
  readonly low: number | null;
  readonly close: number | null;
  /** Absent, not zero, when the host has no volume for this instrument. */
  readonly volume?: number | null;
  /** Bar open time, milliseconds since the Unix epoch, UTC. */
  readonly time: number | null;
  readonly openInterest?: number | null;
}

/** What the host states about the execution, `language.md` 7.2. */
export interface BarState {
  /** This bar's interval has elapsed. True for every historical bar. */
  readonly isConfirmed?: boolean;
  /** A live feed is driving updates. */
  readonly isRealtime?: boolean;
  /** The host says a trading session begins on this bar. */
  readonly isSessionStart?: boolean;
  /** The host says a trading session ends on this bar. */
  readonly isSessionEnd?: boolean;
}

/** The facts about the bar being executed, derived once per execution. */
export interface BarFacts {
  readonly index: number;
  readonly count: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isConfirmed: boolean;
  readonly isRealtime: boolean;
  readonly isNew: boolean;
  readonly updates: number;
  readonly isSessionStart: boolean;
  readonly isSessionEnd: boolean;
}

/** The bar fields 2.10 names, and nothing else. */
export const BAR_FIELDS: readonly string[] = [
  'open',
  'high',
  'low',
  'close',
  'volume',
  'time',
  'hl2',
  'hlc3',
  'ohlc4',
  'hlcc4',
  'oi',
  'bar.index',
  'bar.count',
  'bar.isFirst',
  'bar.isLast',
  'bar.isConfirmed',
  'bar.isRealtime',
  'bar.isNew',
  'bar.updates',
];

export function isBarField(name: string): boolean {
  return BAR_FIELDS.includes(name);
}

function present(value: number | null | undefined): value is number {
  return typeof value === 'number';
}

/** One bar field's value, by the definitions of 2.10. */
export function barField(field: string, bar: HostBar, facts: BarFacts): Value {
  const { open, high, low, close } = bar;
  switch (field) {
    case 'open':
      return open ?? ABSENT;
    case 'high':
      return high ?? ABSENT;
    case 'low':
      return low ?? ABSENT;
    case 'close':
      return close ?? ABSENT;
    case 'volume':
      return bar.volume ?? ABSENT;
    case 'oi':
      return bar.openInterest ?? ABSENT;
    case 'time':
      return bar.time ?? ABSENT;
    case 'hl2':
      return present(high) && present(low) ? numberValue((high + low) / 2) : ABSENT;
    case 'hlc3':
      return present(high) && present(low) && present(close)
        ? numberValue((high + low + close) / 3)
        : ABSENT;
    case 'ohlc4':
      return present(open) && present(high) && present(low) && present(close)
        ? numberValue((open + high + low + close) / 4)
        : ABSENT;
    case 'hlcc4':
      return present(high) && present(low) && present(close)
        ? numberValue((high + low + close + close) / 4)
        : ABSENT;
    case 'bar.index':
      return facts.index;
    case 'bar.count':
      return facts.count;
    case 'bar.isFirst':
      return facts.isFirst;
    case 'bar.isLast':
      return facts.isLast;
    case 'bar.isConfirmed':
      return facts.isConfirmed;
    case 'bar.isRealtime':
      return facts.isRealtime;
    case 'bar.isNew':
      return facts.isNew;
    case 'bar.updates':
      return facts.updates;
    default:
      return ABSENT;
  }
}

/**
 * The eight bar facts.
 *
 * `bar.index` is a position in the supplied data, not a universal address:
 * loading more history shifts every index, which is why a script that has to
 * remember a bar stores `time` instead.
 */
export function factsFor(
  index: number,
  supplied: number,
  state: BarState,
  isNew: boolean,
  updates: number,
): BarFacts {
  return {
    index,
    count: index + 1,
    isFirst: index === 0,
    // True when this is the greatest index the host has supplied. A live chart
    // supplies bars one at a time, so its newest bar is always the last; a run
    // over a whole dataset supplies them together, so only its final bar is.
    isLast: index === supplied - 1,
    isConfirmed: state.isConfirmed ?? true,
    isRealtime: state.isRealtime ?? false,
    isNew,
    updates,
    isSessionStart: state.isSessionStart ?? false,
    isSessionEnd: state.isSessionEnd ?? false,
  };
}
