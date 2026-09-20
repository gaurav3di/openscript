/**
 * Duty 2: the instrument record, `host-interface.md` 4.1, and its session, 4.3.
 *
 * Twelve facts and no thirteenth. The names are the page's, the value spellings
 * are the ones 4.1 fixes, and the required rule is the page's own: `hasVolume`
 * is stated by every host, `timezone` is stated by a host that states a
 * `session`, and every other fact is stated when the host has it and left out
 * when it does not.
 *
 * **Absent is a fact here, not a gap.** A host that does not know a tick size
 * states none, and a script reads absence and can test it. So every optional
 * field below is optional in the shape as well, and a builder that filled one
 * in with a default would be the substitution rule of 4.2 broken by the test
 * suite rather than by a platform.
 */

/** The session window, `host-interface.md` 4.3. */
export interface PageSession {
  readonly start: string;
  readonly end: string;
  readonly days?: readonly number[];
}

/**
 * The record, `host-interface.md` 4.1.
 *
 * `hasVolume` is the one fact with no absent case, so it is the one field here
 * that is not optional.
 */
export interface PageInstrument {
  readonly symbol?: string;
  readonly exchange?: string;
  /** A canonical timeframe string, `stdlib.md` 15.2. A bare number is minutes. */
  readonly interval?: string;
  /** An IANA zone name, never a fixed offset. Required with a `session`. */
  readonly timezone?: string;
  readonly tickSize?: number;
  readonly lotSize?: number;
  readonly pointValue?: number;
  readonly currency?: string;
  /** One of the seven 4.1 lists, and nothing else. */
  readonly instrumentType?: InstrumentType;
  /** The one fact a host must state, 4.2. */
  readonly hasVolume: boolean;
  readonly hasOpenInterest?: boolean;
  readonly session?: PageSession;
}

/** The seven words 4.1 allows, and a host with none of them states nothing. */
export type InstrumentType =
  | 'equity'
  | 'future'
  | 'option'
  | 'index'
  | 'currency'
  | 'commodity'
  | 'other';

/** The fields 4.1 prints, in the order it prints them. */
export const RECORD_FIELDS: readonly string[] = [
  'symbol',
  'exchange',
  'interval',
  'timezone',
  'tickSize',
  'lotSize',
  'pointValue',
  'currency',
  'instrumentType',
  'hasVolume',
  'hasOpenInterest',
  'session',
];

/**
 * The record spelled as 4.1's own worked example spells one.
 *
 * All twelve stated, because the example states all twelve. A test that wants a
 * host which knows less says so, by passing its own record.
 */
export const PAGE_INSTRUMENT: PageInstrument = {
  symbol: 'SAMPLE',
  exchange: 'SAMPLE_VENUE',
  interval: '60',
  timezone: 'UTC',
  tickSize: 0.05,
  lotSize: 25,
  pointValue: 1,
  currency: 'XXX',
  instrumentType: 'future',
  hasVolume: true,
  hasOpenInterest: false,
  session: { start: '09:00', end: '17:30', days: [1, 2, 3, 4, 5] },
};

/** The same record with some facts replaced, which is all a test ever changes. */
export function pageInstrument(over: Partial<PageInstrument>): PageInstrument {
  return { ...PAGE_INSTRUMENT, ...over };
}

/**
 * Everything about a record that the page refuses, listed rather than thrown.
 *
 * Read the way `readIntent` and `readRequest` read their shapes: both
 * directions, so a fact the page does not print is a fault and a required fact
 * left out is a fault, and a failure names which.
 */
export function readRecord(record: PageInstrument): readonly string[] {
  const problems: string[] = [];
  const raw = record as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!RECORD_FIELDS.includes(key)) {
      problems.push(`the record states ${key}, which section 4.1 does not print`);
    }
  }
  if (typeof raw['hasVolume'] !== 'boolean') {
    problems.push('hasVolume is the one fact 4.1 requires and the record does not state it');
  }
  if (raw['session'] !== undefined && typeof raw['timezone'] !== 'string') {
    problems.push('a session is stated with no timezone to read it in, which 4.1 refuses');
  }
  const type = raw['instrumentType'];
  if (type !== undefined && !INSTRUMENT_TYPES.includes(String(type))) {
    problems.push(`instrumentType is ${String(type)}, which is not one of the seven 4.1 lists`);
  }
  for (const key of ['tickSize', 'lotSize'] as const) {
    const value = raw[key];
    if (value !== undefined && !(typeof value === 'number' && value > 0)) {
      problems.push(`${key} is not a positive number, and zero is not a tick size`);
    }
  }
  return problems;
}

const INSTRUMENT_TYPES: readonly string[] = [
  'equity',
  'future',
  'option',
  'index',
  'currency',
  'commodity',
  'other',
];
