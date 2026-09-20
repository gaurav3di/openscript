/**
 * A host built from `spec/host-interface.md` and from nothing else.
 *
 * Every other host in this repository was written against the engine it drives,
 * which is why a field the page prints and the engine never sends, and a field
 * the engine reads and the page never prints, both survived every suite here
 * and were found by somebody outside. So this module is written the other way
 * round: each shape is a section of that document typed out, the field names
 * are the page's, and a fact the page does not print cannot be reached from
 * here.
 *
 * **Every duty, not the convenient ones.** The earlier version of this host
 * served duties 2 and 3 and stopped, so the one duty a strategy needs was the
 * one nothing in the repository exercised through a page-built host, and a
 * shipped strategy that placed no orders coexisted with a green suite. The
 * duties below are section 2's table in full, and `DUTIES` is that table typed
 * out so a test can hold the two against each other.
 *
 * **Nothing here reads the engine's own types except at the hand-over.** That
 * one function is a cast of a structure this module built, and section 1 is
 * what allows it: the document fixes a set of named facts and not a transport,
 * so a host hands the same facts over however its engine takes them.
 */
import { load } from '../../src/core/engine/index.js';
import type {
  BarResult,
  Engine,
  EngineHost,
  HostBar,
  Instrument,
  LoadOptions,
  RequestProvider,
} from '../../src/core/engine/index.js';

import { deliverTo, engineBar, handOvers } from './feed.js';
import type { Delivery, PageBar } from './feed.js';
import { PAGE_INSTRUMENT } from './record.js';
import type { PageInstrument } from './record.js';
import { PageDestination } from './orders.js';
import type { DestinationOptions } from './orders.js';
import { rangeFor, readRequest } from './reads.js';
import type { PageAnswer, PageRange, PageRefusal, PageRequest, PageSeries } from './reads.js';

/**
 * One duty of section 2's table, and what a host hands the engine for it.
 *
 * `handOver` is the name the fact travels under when it crosses at load, and
 * `null` where the duty is not a field at all: bars and their state are the
 * call the host makes on each execution, a settings map is read once at load
 * beside the program, and the drawing surface is the side the engine writes
 * rather than the side it reads.
 *
 * The list is what makes an omission structural. A field on the engine's host
 * interface with no row here has no duty behind it, and a row here with no
 * field is a duty nothing serves; `duties.test.ts` refuses both, and holds this
 * table against the page's own.
 */
export interface Duty {
  /** The duty, spelled as the table of section 2 spells it. */
  readonly name: string;
  readonly handOver: string | null;
  readonly optional: boolean;
}

export const DUTIES: readonly Duty[] = [
  { name: 'Bars', handOver: null, optional: false },
  { name: 'Instrument facts', handOver: 'instrument', optional: false },
  { name: 'Bars on request', handOver: 'requestBars', optional: true },
  { name: 'Bar state', handOver: null, optional: false },
  { name: 'Orders', handOver: 'route', optional: true },
  { name: 'Settings storage', handOver: null, optional: true },
  // Named in section 2 beside the table, as the two things a host supplies that
  // are specified elsewhere, so that a reader working through the list is not
  // missing one.
  { name: 'Drawing surface', handOver: null, optional: false },
  { name: 'Chart clock', handOver: 'now', optional: true },
];

/** Every name a fact may cross under, which is the whole of the hand-over. */
export const HAND_OVER: readonly string[] = DUTIES.map((duty) => duty.handOver).filter(
  (name): name is string => name !== null,
);

export interface PageHostOptions {
  /** Duty 2. The record this host states, which is 4.1's own example by default. */
  readonly instrument?: PageInstrument;
  /** Duty 1, the chart's own bars, which the range arithmetic is measured on. */
  readonly bars?: readonly PageBar[];
  /** The chart clock, for `chart.now()`. */
  readonly now?: number;
  /** Duty 3: a host that lists nothing serves no request. */
  readonly serves?: readonly PageSeries[];
  /** A host that has reached its source and been refused, 5.4. */
  readonly refuses?: PageRefusal;
  /** A host that is still fetching, 5.3. */
  readonly waiting?: boolean;
  /** Duty 5: a destination for orders. A host without one takes no strategy. */
  readonly destination?: DestinationOptions;
  /** Duty 6: a value per input key, 8.1. A host with no storage stores none. */
  readonly settings?: Readonly<Record<string, unknown>>;
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
  /** Duty 5, present only on a host that wired a destination. */
  readonly destination: PageDestination | undefined;
  private readonly options: PageHostOptions;

  constructor(options: PageHostOptions = {}) {
    this.options = options;
    this.destination =
      options.destination === undefined ? undefined : new PageDestination(options.destination);
  }

  get instrument(): PageInstrument {
    return this.options.instrument ?? PAGE_INSTRUMENT;
  }

  get bars(): readonly PageBar[] {
    return this.options.bars ?? [];
  }

  get now(): number | undefined {
    return this.options.now;
  }

  /** Duty 6, 8.1: a value per input key, and nothing where a host stores none. */
  get settings(): Readonly<Record<string, unknown>> | undefined {
    return this.options.settings;
  }

  /**
   * Whether this host implements duty 3 at all.
   *
   * Section 2: an optional duty is declared at load and not discovered during a
   * bar, so a host that serves no request offers no provider and a program that
   * needs one is refused at load with OS6006 naming the tag. A host that lists
   * an empty shelf has implemented the duty and knows nothing, which is a
   * refusal per read and a different answer.
   */
  get servesRequests(): boolean {
    const options = this.options;
    return options.serves !== undefined || options.refuses !== undefined || options.waiting === true;
  }

  /**
   * Duty 3, 5.2, answered from the fields that section prints.
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

    const range = rangeFor(request, this.bars);
    if (range === undefined) return { refused: { code: 'OS6008' } };
    this.ranges.push(range);
    // Bars this host actually holds inside the range it worked out. Nothing is
    // padded or synthesised to fill a range it cannot cover, 5.3, and history
    // that stops short of the warmup is served short rather than refused:
    // OS6008 is nothing over the range the chart covers, not history that does
    // not reach as far back as the request asked.
    const served = held.bars.filter((bar) => bar.time >= range.from && bar.time < range.to);
    if (served.length === 0) return { refused: { code: 'OS6008' } };
    return { bars: served };
  }
}

/** A host with the facts a test names and 4.1's own example behind the rest. */
export function pageHost(options: PageHostOptions = {}): PageHost {
  return new PageHost(options);
}

/**
 * The hand-over, which is the one thing the document does not fix.
 *
 * Section 1: the shapes are a set of named facts and not a transport, so a host
 * hands the same facts over however its engine takes them. Every fact above
 * crosses here unchanged, nothing that is not above crosses at all, and the
 * keys of what leaves this function are `HAND_OVER` exactly.
 */
export function engineHostFor(host: PageHost): EngineHost {
  const provider: RequestProvider = (query) => {
    const answer = host.answer(query);
    if (answer === undefined) return undefined;
    if ('waiting' in answer) return { pending: true };
    if ('refused' in answer) return { refused: answer.refused };
    return { bars: answer.bars.map(engineBar) as readonly HostBar[] };
  };
  const destination = host.destination;
  return {
    instrument: host.instrument as Instrument,
    ...(host.now === undefined ? {} : { now: host.now }),
    ...(destination === undefined ? {} : { route: (effect) => destination.receive(effect) }),
    ...(host.servesRequests ? { requestBars: provider } : {}),
  };
}

/**
 * Load a program on this host, with duty 6 read once at load.
 *
 * 8.2: settings are read before step 1 of bar 0 and cannot change mid-run, so
 * they travel with the load and not with a bar. A host with no storage passes
 * none and every input takes its declared default, which 8.4 says is
 * conforming.
 */
export function loadOn(
  program: unknown,
  host: PageHost,
  options: LoadOptions = {},
): { readonly engine: Engine | undefined; readonly code: string | undefined } {
  const settings = host.settings;
  const loaded = load(program, {
    host: engineHostFor(host),
    ...(settings === undefined ? {} : { settings }),
    ...options,
  });
  return loaded.ok
    ? { engine: loaded.engine, code: undefined }
    : { engine: undefined, code: loaded.diagnostic.code };
}

/**
 * Drive a whole dataset through a loaded engine, as this host delivers it.
 *
 * The frames the destination has to send are handed over **between bars**,
 * which is where 7.4 puts the intake: the route is called at step 9, during an
 * execution, and a host that delivered from inside it would be speaking into a
 * bar that had already begun. So the queue is drained after each hand-over and
 * before the next, one frame per call, which is the only way in.
 */
export function runOn(
  engine: Engine,
  host: PageHost,
  delivery: Delivery = 'history',
): readonly BarResult[] {
  const out: BarResult[] = [];
  const destination = host.destination;
  for (const one of handOvers(host.bars, delivery)) {
    const result = deliverTo(engine, one);
    out.push(result);
    if (result.diagnostic !== undefined) return out;
    if (destination === undefined) continue;
    for (const frame of destination.drain()) engine.deliver(frame);
  }
  return out;
}
