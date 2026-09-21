/**
 * The loop: a compiled program, some bars, and the record of what happened.
 *
 * **Everything is collected as it arrives.** Each bar hands back what it
 * applied and what the frames delivered before it did to the ledger, and that
 * is what the record is built from. Nothing is read back at the end except one
 * snapshot of the ledger, and that snapshot is copied rather than kept:
 * `engine.orders()` hands back the ledger's own array, which the fold writes
 * into and a refused bar truncates, so a driver holding on to it would report
 * whatever the array happened to say last rather than what the run did.
 *
 * **Every bar supplied executes and only the ones inside the window are
 * reported.** A bar before the window is warmup: it runs, its orders are real,
 * and a position opened on it is carried in. What it does not get is an equity
 * point. `range.ts` decides which is which and refuses a window holding no bar
 * at all, before the first bar rather than after the last.
 *
 * **The bar count handed over is the total.** An engine told that each bar is
 * the only bar reports `bar.isLast` true on every one of them, and a strategy
 * that flattens on the last bar then flattens on all of them.
 *
 * **Frames are delivered at the boundary and folded there.** What the venue
 * answered after bar k reaches the engine before bar k + 1 executes, which is
 * where `host-interface.md` 7.4 puts the intake, and the outcome of that fold
 * is reported on bar k + 1. A frame answered after the last bar has no boundary
 * left to fold at: it is not delivered, it is not recorded as delivered, and
 * the order it was about is in the ledger at whatever it last said.
 */
import { reportOf, scheduleFromDeclaration } from '../accounting/index.js';
import type { ChargeSchedule, Contract, RecordedFill } from '../accounting/index.js';
import type { Diagnostic } from '../diagnostics/index.js';
import type { CompiledProgram } from '../emit/index.js';
import { load } from '../engine/index.js';
import type {
  BarResult,
  Engine,
  EngineHost,
  Instrument,
  LedgerRow,
  OrderFrame,
  OrderIntent,
  RoutedEffect,
} from '../engine/index.js';
import { declarationOf } from './declaration.js';
import type { RunDeclaration } from './declaration.js';
import { marksFor, windowFor } from './range.js';
import type { ReportWindow } from './range.js';
import { diagnosticIn, orderIn, recordOf } from './record.js';
import type {
  RecordedBar,
  RecordedDiagnostic,
  RecordedFrame,
  RecordedOrder,
  RunRecord,
} from './record.js';
import { Simulator } from './simulate.js';
import { checkSettings } from './settings.js';
import type { BacktestSettings } from './settings.js';

/** What a run came to, or why it could not be carried out at all. */
export type BacktestResult =
  | { readonly ok: true; readonly record: RunRecord }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * The facts of `host-interface.md` 4.1 that the contract does not hold.
 *
 * The contract already states six of the twelve, the ones the money is priced
 * under, and a fact stated in two places is a fact that can disagree with
 * itself: a tick size the engine rounds to and a different one the venue
 * worsens a fill by is a run under two instruments. So the other six are
 * stated here and the six the contract holds cannot be, which the compiler
 * enforces rather than a check at run time.
 */
export type InstrumentFacts = Omit<
  Instrument,
  'symbol' | 'exchange' | 'tickSize' | 'lotSize' | 'pointValue' | 'currency'
>;

/** The few choices a driver has that are not settings of the run itself. */
export interface DriveOptions {
  /** Whether the bars travel in the record. Inline is the conformance form. */
  readonly form?: 'inline' | 'referenced';
  /**
   * What the host states about the instrument beside the contract, so the
   * record it produces is a conformance case.
   *
   * A case holds `instrument.json`, which `conformance.md` section 2 says is
   * the record of `host-interface.md` 4.1, and that page requires one fact of
   * every host: `hasVolume`, because no derivation recovers it (4.2). The
   * engine reads the record and does not refuse a run without it, so a caller
   * that leaves this out gets a record that replays and reruns like any other
   * and cannot become a case, exactly as one without `sourceText` cannot.
   *
   * A session stated without a timezone is refused at load, OS6012, by the
   * same rule that refuses it for any host.
   */
  readonly instrument?: InstrumentFacts;
  /**
   * The script's own text, so the record it produces is a conformance case.
   *
   * A compiled program identifies its source and cannot reproduce it, and a
   * case has to hold `script.os`. A caller holding only a program leaves this
   * out and gets a record that replays and reruns like any other; the one
   * thing it cannot do is be handed to somebody else's engine as a case.
   *
   * It is checked against the program's own source hash, so text from a
   * different revision than the one that was compiled is refused rather than
   * written into a case that could never make its own expected output.
   */
  readonly sourceText?: string;
}

/**
 * One run, from a compiled program to a record of it.
 *
 * A refusal before the first bar comes back as a refusal and not as a record:
 * a program that would not load, a setting that cannot be applied and a window
 * holding no bars are all runs that did not happen, and a record of one would
 * be a document asserting figures nothing computed. A failure during a bar is
 * the other way round: the run happened, it stopped, and the record carries
 * both what it did and the diagnostic that stopped it.
 */
export function backtest(
  program: CompiledProgram,
  bars: readonly RecordedBar[],
  settings: BacktestSettings,
  options: DriveOptions = {},
): BacktestResult {
  const framed = windowFor(bars, settings.range);
  if (!framed.ok) return { ok: false, diagnostic: framed.diagnostic };

  // The venue is built after the program is loaded, because the bar a market
  // order is priced at is the declaration's and the declaration is resolved at
  // load. The route is wired first and reaches it through this binding, which
  // is what lets one host serve both halves.
  let venue: Simulator | undefined;
  const instrument = instrumentFor(settings.contract, options.instrument ?? {});
  const loaded = load(program, {
    settings: settings.inputs,
    host: hostFor(instrument, settings.now, (effect, bar) => venue?.route(effect, bar)),
  });
  if (!loaded.ok) return { ok: false, diagnostic: loaded.diagnostic };

  const engine = loaded.engine;
  const declared = declarationOf(engine.program, loaded.inputs);
  const problem = checkSettings(settings, declared);
  if (problem !== null) return { ok: false, diagnostic: problem };

  const schedule = scheduleFor(settings, declared);
  venue = new Simulator({
    bars,
    contract: settings.contract,
    fill: settings.fill,
    slippageTicks: schedule.slippageTicks,
    fillOn: declared.fillOn,
    qtyType: declared.qtyType,
  });

  const run = walk(engine, venue, bars, framed.covered);
  const ordinals = ordinalsOf(venue.intents);
  const marks = marksFor(bars, framed.covered);

  return {
    ok: true,
    record: recordOf({
      program: engine.program,
      ...(options.sourceText === undefined ? {} : { sourceText: options.sourceText }),
      settings,
      instrument,
      bars,
      form: options.form ?? 'inline',
      frames: run.frames.map((one) => framedAs(one.frame, one.afterBar, ordinals)),
      fills: run.fills,
      orders: ordersOf(engine.orders(), venue.intents, ordinals),
      diagnostics: run.diagnostics,
      report: reportOf(run.fills, marks, schedule, settings.contract, declared.capital),
    }),
  };
}

/** A frame, and the boundary it was handed over at. */
interface Delivered {
  readonly frame: OrderFrame;
  readonly afterBar: number;
}

/** What one walk of the bars produced. */
interface Walked {
  readonly fills: readonly RecordedFill[];
  readonly frames: readonly Delivered[];
  readonly diagnostics: readonly RecordedDiagnostic[];
}

/**
 * The bars, in order, with the venue answering between them.
 *
 * The one ordering rule: deliver, then append, then collect what the append
 * reported, then ask the venue what this bar did. A driver that asked the venue
 * before appending would price a fill against a bar the strategy had not seen.
 */
function walk(
  engine: Engine,
  venue: Simulator,
  bars: readonly RecordedBar[],
  covered: ReportWindow,
): Walked {
  const fills: RecordedFill[] = [];
  const frames: Delivered[] = [];
  const diagnostics: RecordedDiagnostic[] = [];
  const intents = new Map<number, OrderIntent>();
  const refs = new Map<number, string>();
  const sizes = new Map<number, number>();

  let pending: readonly Delivered[] = [];
  let seq = 0;

  for (let index = 0; index < covered.total; index += 1) {
    const bar = bars[index];
    if (bar === undefined) continue;

    for (const one of pending) {
      const ref = one.frame.orderRef;
      if (typeof ref === 'string') refs.set(one.frame.intentId, ref);
      engine.deliver(one.frame);
      frames.push(one);
    }
    pending = [];

    const result = engine.append(
      { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
        volume: bar.volume, oi: bar.oi },
      { isConfirmed: true, isRealtime: false },
      covered.total,
    );

    for (const intent of intentsIn(result)) intents.set(intent.intentId, intent);
    seq = settle(result, index, bar, { intents, refs, sizes }, fills, seq);

    if (result.diagnostic !== undefined) {
      diagnostics.push(diagnosticIn(result.diagnostic, index));
      break;
    }

    pending = venue.framesFor(index).map((frame) => ({ frame, afterBar: index }));
  }

  return { fills, frames, diagnostics };
}

/** What the run is holding while it folds one bar's frames into fills. */
interface Books {
  readonly intents: ReadonlyMap<number, OrderIntent>;
  readonly refs: ReadonlyMap<number, string>;
  readonly sizes: Map<number, number>;
}

/**
 * The fills one bar's fold settled.
 *
 * **The position sizes either side of step 6 are kept here and not read back
 * from the engine**, because the engine reports a leg's net and a fill settles
 * against one position reference: the two are different numbers whenever a leg
 * holds more than one position, which is every flip. They are folded in the
 * order the frames were folded in, from the same deltas, so they are the same
 * arithmetic the position book did rather than a second reading of its result.
 * When `FrameOutcome` carries them, these two lines come from the engine and
 * this fold keeps only the sequence number.
 *
 * A refused frame settles nothing and is not a fill. Today the fold reports the
 * refusal as a word rather than a code, so nothing here can write it into the
 * record as a diagnostic; that is OS7018 and OS7019, and both are deferred.
 */
function settle(
  result: BarResult,
  index: number,
  bar: RecordedBar,
  books: Books,
  fills: RecordedFill[],
  from: number,
): number {
  let seq = from;
  for (const outcome of result.frames) {
    if (outcome.refused !== undefined) continue;
    if (outcome.delta <= 0 || outcome.price === null) continue;
    const intent = books.intents.get(outcome.intentId);
    if (intent === undefined || intent.side === null) continue;

    const before = books.sizes.get(intent.positionRef) ?? 0;
    const after = before + (intent.side === 'sell' ? -outcome.delta : outcome.delta);
    books.sizes.set(intent.positionRef, after);
    seq += 1;

    fills.push({
      seq,
      intentId: outcome.intentId,
      orderRef: books.refs.get(outcome.intentId) ?? '',
      tag: intent.tag,
      positionRef: intent.positionRef,
      side: intent.side,
      units: outcome.delta,
      price: outcome.price,
      // The bar the fold happened at, which is the bar the position exists
      // from. Where the fill itself traded is the bar before it or this bar's
      // own open, and neither is a bar the strategy could have acted on it in.
      barIndex: index,
      barTime: bar.time,
      refSizeBefore: before,
      refSizeAfter: after,
    });
  }
  return seq;
}

/** Every intent one bar handed over, in the order the bar applied them. */
function intentsIn(result: BarResult): readonly OrderIntent[] {
  const out: OrderIntent[] = [];
  for (const effect of result.effects) for (const intent of effect.intents) out.push(intent);
  return out;
}

/**
 * The ordinal of every intent, which is how a case names one.
 *
 * One, two, three in the order the run placed them, because no engine can know
 * the id another minted and a case that named one would only ever be readable
 * by the engine that wrote it.
 */
function ordinalsOf(intents: readonly OrderIntent[]): ReadonlyMap<number, number> {
  const out = new Map<number, number>();
  for (const intent of intents) {
    if (!out.has(intent.intentId)) out.set(intent.intentId, out.size + 1);
  }
  return out;
}

/** One delivered frame, in the columns a case file prints. */
function framedAs(
  frame: OrderFrame,
  afterBar: number,
  ordinals: ReadonlyMap<number, number>,
): RecordedFrame {
  return {
    afterBar,
    intent: ordinals.get(frame.intentId) ?? 0,
    status: frame.status,
    filledQty: frame.filledQty,
    avgFillPrice: frame.avgFillPrice ?? null,
    orderRef: frame.orderRef ?? null,
    text: frame.text ?? null,
  };
}

/** The ledger at the end, copied out of the engine's own array. */
function ordersOf(
  rows: readonly LedgerRow[],
  intents: readonly OrderIntent[],
  ordinals: ReadonlyMap<number, number>,
): readonly RecordedOrder[] {
  return rows.map((row) => {
    const intent = intents.find((one) => one.intentId === row.intentId);
    return orderIn(row, ordinals.get(row.intentId) ?? 0, intent?.qtyType ?? '');
  });
}

/**
 * The cost model the run is carried out under.
 *
 * The host's schedule where it supplied one, and otherwise the declaration's
 * own commission as the one kind of schedule the money layer evaluates. Both
 * cannot be stated at once: that is OS6023 and it is refused before this is
 * asked.
 */
function scheduleFor(settings: BacktestSettings, declared: RunDeclaration): ChargeSchedule {
  if (settings.costs !== null) return settings.costs;
  return scheduleFromDeclaration(
    declared.commission,
    declared.commissionType,
    declared.slippage,
    settings.contract.currency,
    settings.contract.digits,
  );
}

/**
 * The instrument record of `host-interface.md` 4.1 the engine is handed, and
 * the record carries verbatim.
 *
 * Composed once, here, from the contract's six facts and the six stated beside
 * it, so the engine and the record read one document and there is no second
 * composition for the two to disagree by. A fact nobody stated is left out
 * rather than written as undefined: the record travels as JSON, which drops an
 * undefined member, and a document that changes shape in transit is not the
 * document the engine read.
 */
function instrumentFor(contract: Contract, facts: InstrumentFacts): Instrument {
  return {
    ...(contract.symbol === null ? {} : { symbol: contract.symbol }),
    ...(contract.exchange === null ? {} : { exchange: contract.exchange }),
    ...(facts.interval === undefined ? {} : { interval: facts.interval }),
    ...(facts.timezone === undefined ? {} : { timezone: facts.timezone }),
    ...(contract.tickSize === null ? {} : { tickSize: contract.tickSize }),
    ...(contract.lotSize === null ? {} : { lotSize: contract.lotSize }),
    pointValue: contract.pointValue,
    currency: contract.currency,
    ...(facts.instrumentType === undefined ? {} : { instrumentType: facts.instrumentType }),
    ...(facts.hasVolume === undefined ? {} : { hasVolume: facts.hasVolume }),
    ...(facts.hasOpenInterest === undefined ? {} : { hasOpenInterest: facts.hasOpenInterest }),
    ...(facts.session === undefined ? {} : { session: facts.session }),
  };
}

/**
 * The host a backtest is: an instrument record, a clock and a destination.
 *
 * Duty 3 is not served. A backtest holds the chart's own bars and nothing else,
 * so a program that reads another instrument declares a capability this host
 * does not have and is refused at load, by name, rather than drawing a line
 * with nothing in it.
 */
function hostFor(
  instrument: Instrument,
  now: number | null,
  route: (effect: RoutedEffect, bar: number) => void,
): EngineHost {
  return {
    instrument,
    ...(now === null ? {} : { now }),
    route,
  };
}
