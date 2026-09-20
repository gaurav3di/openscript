/**
 * A host built from `spec/host-interface.md` and from nothing else.
 *
 * Every other host in this repository is one this repository wrote against the
 * engine it drives, which is why a field the page prints and the engine never
 * sends, or a field the engine sends and the page never prints, survived every
 * suite here and was found by somebody outside. So this file is written the
 * other way round: each shape below is a section of that document typed out,
 * the field names are the page's, and a fact the page does not print cannot be
 * reached from here.
 *
 * Three shapes and one duty:
 *
 * - the instrument record of section 4.1, with the session of 4.3 and the value
 *   spellings 4.1 fixes;
 * - a bar, section 3.1, and the bar state of section 6.4;
 * - a request, section 5.2, checked field by field against that table, so a
 *   field that stops arriving fails a test rather than waiting for a reviewer;
 * - duty 3, served the way section 5.2 says a host serves it: the host owns the
 *   range, works it out from its own bars and the request's `warmup`, and
 *   refuses with a code from 5.4 rather than with an empty answer.
 *
 * **Nothing here reads the engine's own types.** The hand-over at the bottom is
 * the one place the two meet, it is a cast of a structure this file built, and
 * section 1 is what allows it: the document fixes a set of named facts and not a
 * transport, so a host hands the same facts over however its engine takes them.
 */
import type { EngineHost, HostBar, Instrument, RequestProvider } from '../../src/core/engine/index.js';

/** The instrument record, section 4.1. Twelve facts and no thirteenth. */
export interface PageInstrument {
  readonly symbol: string;
  readonly exchange: string;
  readonly interval: string;
  readonly timezone: string;
  readonly tickSize: number;
  readonly lotSize: number;
  readonly pointValue: number;
  readonly currency: string;
  readonly instrumentType: string;
  readonly hasVolume: boolean;
  readonly hasOpenInterest: boolean;
  readonly session: { readonly start: string; readonly end: string; readonly days?: readonly number[] };
}

/**
 * The record, spelled as section 4.1's own example spells one: a canonical
 * timeframe string, an area and location zone, an instrument type from the seven
 * the section lists, and the session of 4.3.
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

/** The same record for another chart, which is the only thing a test changes. */
export function pageInstrument(over: Partial<PageInstrument>): PageInstrument {
  return { ...PAGE_INSTRUMENT, ...over };
}

/** A bar, section 3.1. Seven fields and no eighth. */
export interface PageBar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly oi: number;
}

/** The bar state, section 6.4: the four facts the host states, every execution. */
export interface PageState {
  readonly isNew: boolean;
  readonly isConfirmed: boolean;
  readonly isRealtime: boolean;
  readonly updates: number;
}

/** A request, section 5.2. These seven fields, under these names. */
export interface PageRequest {
  readonly id: number;
  readonly read: 'symbol' | 'timeframe';
  readonly instrument: string | null;
  readonly exchange: string | null;
  readonly timeframe: string;
  readonly mode: 'confirmed' | 'developing' | 'lookahead';
  readonly warmup: number | null;
}

/** A refusal, section 5.4. The code is the catalogue's and the words are the host's. */
export interface PageRefusal {
  readonly code: 'OS6007' | 'OS6008' | 'OS6009' | 'OS6014' | 'OS6015';
  readonly reason?: string;
  readonly available?: string;
}

/** What one read is served with, sections 5.3 and 5.4. */
export type PageAnswer =
  | { readonly bars: readonly PageBar[] }
  | { readonly refused: PageRefusal }
  | { readonly waiting: true };

const FIELDS: readonly string[] = [
  'id',
  'read',
  'instrument',
  'exchange',
  'timeframe',
  'mode',
  'warmup',
];

const MODES: readonly string[] = ['confirmed', 'developing', 'lookahead'];

/**
 * One request, read against the table of section 5.2.
 *
 * It returns what the page says arrives and a list of everything about the
 * request that the page does not account for: a field it prints that did not
 * come, a field that came under another name, a type that is not the one printed.
 * A host cannot act on a field it was never told about, so a request carrying
 * one is a defect in the page rather than a bonus, and both directions are
 * reported.
 */
export function readRequest(query: unknown): { request: PageRequest; problems: readonly string[] } {
  const problems: string[] = [];
  const raw = (query ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!FIELDS.includes(key)) problems.push(`the request carries ${key}, which section 5.2 does not print`);
  }
  for (const key of FIELDS) {
    if (!(key in raw)) problems.push(`section 5.2 prints ${key} and the request does not carry it`);
  }
  if (typeof raw['id'] !== 'number') problems.push('id is not a number');
  if (raw['read'] !== 'symbol' && raw['read'] !== 'timeframe') problems.push('read is not one of the two');
  if (raw['instrument'] !== null && typeof raw['instrument'] !== 'string') {
    problems.push('instrument is neither an identity nor absent');
  }
  if (raw['exchange'] !== null && typeof raw['exchange'] !== 'string') {
    problems.push('exchange is neither a string nor absent');
  }
  if (typeof raw['timeframe'] !== 'string') problems.push('timeframe is not a string');
  if (!MODES.includes(String(raw['mode']))) problems.push('mode is not one of the three');
  if (raw['warmup'] !== null && typeof raw['warmup'] !== 'number') {
    problems.push('warmup is neither a number nor absent');
  }
  return { request: raw as unknown as PageRequest, problems };
}

const MINUTE = 60_000;

/**
 * How long one requested bar is, from its timeframe string.
 *
 * `stdlib.md` section 15.2 fixes the spelling and a bare number is minutes. This
 * is the part of the range arithmetic a host cannot avoid owning, because the
 * request states the warmup in requested bars and a fetch takes instants.
 */
export function lengthOf(timeframe: string): number {
  const written = /^(\d+)([smhDWM]?)$/.exec(timeframe);
  if (written === null) return 0;
  const count = Number(written[1]);
  switch (written[2]) {
    case 's':
      return count * 1000;
    case 'h':
      return count * 60 * MINUTE;
    case 'D':
      return count * 24 * 60 * MINUTE;
    case 'W':
      return count * 7 * 24 * 60 * MINUTE;
    case 'M':
      return count * 30 * 24 * 60 * MINUTE;
    default:
      return count * MINUTE;
  }
}

/** The instant range one request is answered over, which the host works out. */
export interface PageRange {
  readonly from: number;
  readonly to: number;
}

/**
 * The range section 5.2 leaves to the host, worked out here from its own bars.
 *
 * The page's floor is the chart's own span extended backwards by `warmup`
 * requested bars. This host extends by one more, deliberately: a confirmed read
 * takes the last requested bar that closed, so a host that serves exactly the
 * floor has nothing to show on the left edge of the chart until the first
 * requested bar closes. Extending further is a host's to decide and serving less
 * is not, which is what makes the number a floor.
 */
export function rangeFor(request: PageRequest, bars: readonly PageBar[]): PageRange | undefined {
  const first = bars[0];
  const last = bars[bars.length - 1];
  const span = lengthOf(request.timeframe);
  if (first === undefined || last === undefined || span === 0) return undefined;
  const warmup = request.warmup ?? 0;
  return {
    from: Math.floor(first.time / span) * span - (warmup + 1) * span,
    to: Math.floor(last.time / span) * span + span,
  };
}

/** What this host holds for one instrument, one exchange and one timeframe. */
export interface PageSeries {
  readonly instrument: string;
  readonly exchange: string;
  readonly timeframe: string;
  readonly bars: readonly PageBar[];
}

export interface PageHostOptions {
  readonly instrument?: Partial<PageInstrument>;
  /** The chart's own bars, duty 1, which the range arithmetic is measured on. */
  readonly bars?: readonly PageBar[];
  readonly now?: number;
  /** Duty 3, which is optional: a host that lists nothing serves no request. */
  readonly serves?: readonly PageSeries[];
  /** A host that has reached its source and been refused, section 5.4. */
  readonly refuses?: PageRefusal;
  /** A host that is still fetching, section 5.3. */
  readonly waiting?: boolean;
}

/**
 * A host, as a platform implementing the page would build one.
 *
 * It keeps every request it was handed and every way one of them failed to
 * match the page, so a test can assert on the hand-over itself rather than only
 * on the numbers a study drew from it.
 */
export class PageHost {
  readonly requests: PageRequest[] = [];
  readonly ranges: PageRange[] = [];
  readonly problems: string[] = [];
  private readonly options: PageHostOptions;

  constructor(options: PageHostOptions = {}) {
    this.options = options;
  }

  get instrument(): PageInstrument {
    return pageInstrument(this.options.instrument ?? {});
  }

  get now(): number | undefined {
    return this.options.now;
  }

  /**
   * Whether this host implements duty 3 at all.
   *
   * Section 2: an optional duty is declared at load and not discovered during a
   * bar, so a host that serves no requests offers no provider and a program that
   * needs one is refused at load with OS6006 naming the tag. A host that lists
   * an empty shelf has implemented the duty and knows nothing, which is a
   * refusal per read and a different answer.
   */
  get servesRequests(): boolean {
    const options = this.options;
    return (
      options.serves !== undefined || options.refuses !== undefined || options.waiting === true
    );
  }

  /**
   * Duty 3, section 5.2, answered from the fields that section prints.
   *
   * A `"timeframe"` read is one the engine satisfies from the bars it already
   * holds, so this host serves no answer to one and has declined nothing. A
   * `"symbol"` read it cannot resolve is a refusal and never an empty answer,
   * which is 5.4's first rule.
   */
  answer(query: unknown): PageAnswer | undefined {
    const { request, problems } = readRequest(query);
    this.requests.push(request);
    for (const one of problems) this.problems.push(one);
    if (request.read === 'timeframe') return undefined;
    if (this.options.refuses !== undefined) return { refused: this.options.refuses };
    if (this.options.waiting === true) return { waiting: true };

    const held = (this.options.serves ?? []).find(
      (one) =>
        one.instrument === request.instrument &&
        one.exchange === request.exchange &&
        one.timeframe === request.timeframe,
    );
    if (held === undefined) return { refused: { code: 'OS6007' } };

    const range = rangeFor(request, this.options.bars ?? []);
    if (range === undefined) return { refused: { code: 'OS6008' } };
    this.ranges.push(range);
    // Bars this host actually holds inside the range it worked out. Nothing is
    // padded or synthesised to fill a range it cannot cover, section 5.3, and
    // history that stops short of the warmup is served short rather than
    // refused: OS6008 is nothing over the range the chart covers, not history
    // that does not reach as far back as the request asked.
    const served = held.bars.filter((bar) => bar.time >= range.from && bar.time < range.to);
    if (served.length === 0) return { refused: { code: 'OS6008' } };
    return { bars: served };
  }
}

/**
 * The hand-over, which is the one thing the document does not fix.
 *
 * Section 1: the shapes are a set of named facts and not a transport, so a host
 * hands the same facts over however its engine takes them. Every fact above
 * crosses here unchanged, and nothing that is not above crosses at all.
 */
export function engineHostFor(host: PageHost): EngineHost {
  const provider: RequestProvider = (query) => {
    const answer = host.answer(query);
    if (answer === undefined) return undefined;
    if ('waiting' in answer) return { pending: true };
    if ('refused' in answer) return { refused: answer.refused };
    return { bars: answer.bars as readonly HostBar[] };
  };
  return {
    instrument: host.instrument as Instrument,
    ...(host.now === undefined ? {} : { now: host.now }),
    ...(host.servesRequests ? { requestBars: provider } : {}),
  };
}
