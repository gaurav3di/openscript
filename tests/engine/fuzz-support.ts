/**
 * Generated strategies, a destination that answers badly, and an oracle folded
 * from what the host itself sent and answered.
 *
 * **The oracle reads nothing the engine kept.** Every property in
 * `fuzz.test.ts` is computed from two records the host owns: the intents it was
 * handed, and the frames it chose to send back. An oracle folded from the
 * ledger would agree with the engine by construction, which is how a defect
 * survives a suite: the last two rounds each found one the engine's own numbers
 * called correct.
 *
 * **Generated rather than written out**, because both defects of issue 0019
 * needed a shape no fixture had: a close of a tag on the side its leg is not
 * on, and a second stated close under a declaration counting in lots, answered
 * out of order. The generator is biased where those live, at tagged calls and
 * at the three quantity types that are not units, and the destination answers
 * late, partially, out of order, with rejections, with more than was asked, and
 * not at all.
 *
 * Deterministic: the seed is the run number, so a failure names a run a reader
 * can reproduce exactly by asking for that one.
 */
import type { OrderFrame, OrderIntent } from '../../src/core/engine/index.js';
import { CONFIRMED, at, ended, frame, partial, runFor } from './orders-support.js';
import type { Run } from './orders-support.js';

/** A generator with no dependency and no global state, seeded per run. */
export function randomFrom(seed: number): () => number {
  let state = (seed * 2654435761) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** One order call the generator wrote, and where in the run it sits. */
export interface Call {
  readonly bar: number;
  /** Whether this call flattens something, which is what a close does. */
  readonly isClose: boolean;
  /** The part it flattens: the tag it named, or the leg where it named none. */
  readonly closes: string | null;
  /** Whether it wrote its own quantity, which is the one 17.1 defers on. */
  readonly stated: boolean;
}

/** One generated strategy: its source, and what each bar asked for. */
export interface Plan {
  readonly lines: readonly string[];
  readonly calls: readonly Call[];
  readonly qtyType: string;
  readonly bars: number;
}

/** Biased to a named part, because that is where the direction of a close is decided. */
const TAGS: readonly string[] = ['', 'A', 'A', 'B', 'B'];
/** Biased to the three the engine cannot count in units, where both defects live. */
const QTY_TYPES: readonly string[] = ['lots', 'cash', 'equityPercent', 'lots', 'cash', 'units'];

interface Drafted {
  readonly bar: number;
  readonly kind: string;
  readonly tag: string;
  readonly qty: number;
}

/** One call as a script writes it, given the tags the file actually places. */
function spell(one: Drafted, placed: readonly string[]): string {
  const tag = one.tag === '' ? '' : `, tag = "${one.tag}"`;
  switch (one.kind) {
    case 'buy':
    case 'sell':
      return `${one.kind}(qty = ${one.qty}${tag})`;
    case 'reverse':
      return `order.reverse(${one.tag === '' ? '' : `tag = "${one.tag}"`})`;
    case 'exit':
      return `exit(profit = ${one.qty}, loss = ${one.qty}${tag})`;
    case 'closeTag': {
      // A close may only name a tag some order in the file places, OS7016, and
      // that is read from the file rather than from the run.
      const named = placed[one.qty % placed.length] ?? '';
      return named === '' ? 'close()' : `close(tag = "${named}")`;
    }
    case 'cancel':
      return one.tag === '' ? 'cancelAll()' : `cancel(tag = "${one.tag}")`;
    case 'place':
      return `order.place(side = "${one.qty % 2 === 0 ? 'buy' : 'sell'}", qty = ${one.qty}${tag})`;
    case 'closeQty':
      return `close(qty = ${1 + (one.qty % 3)})`;
    default:
      return 'close()';
  }
}

/** What a close in this call flattens, for the oracle, or nothing at all. */
function closesWhat(one: Drafted, placed: readonly string[]): { tag: string | null; close: boolean } {
  if (one.kind === 'closeTag') {
    const named = placed[one.qty % placed.length] ?? '';
    return { tag: named === '' ? null : named, close: true };
  }
  if (one.kind === 'close' || one.kind === 'closeQty') return { tag: null, close: true };
  return { tag: null, close: false };
}

/**
 * What a bar may ask for, weighted.
 *
 * Biased to a close that names a tag, which is where the direction of a
 * flattening order is decided, and kept broad enough that the other calls are
 * what puts a part on the side its leg is not on: a rejected half of an
 * opposing entry is how a leg comes to be long under one tag and short under
 * another, and no single call writes that shape.
 *
 * The cancellations are here because a cancelled order releases what it was
 * holding, which is the other way a part comes back to something a close can
 * send, and `order.place` because a script that computes its side takes the
 * same path as `buy` and `sell` and nothing else in this suite writes one.
 * Both refuse sometimes, OS7009 and OS7017, and a refusal ends that run: the
 * properties are asserted over what it sent before it stopped.
 */
const KINDS: readonly string[] = [
  'buy',
  'buy',
  'buy',
  'sell',
  'sell',
  'sell',
  'close',
  'closeTag',
  'closeTag',
  'closeTag',
  'closeTag',
  'closeQty',
  'reverse',
  'exit',
  'cancel',
  'place',
  'place',
];

/** One generated strategy, from one seed. */
export function planFor(seed: number, bars: number): Plan {
  const next = randomFrom(seed);
  const qtyType = QTY_TYPES[Math.floor(next() * QTY_TYPES.length)] as string;
  const drafted: Drafted[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    if (next() < 0.15) continue;
    const kind = KINDS[Math.floor(next() * KINDS.length)] as string;
    const tag = TAGS[Math.floor(next() * TAGS.length)] as string;
    drafted.push({ bar, kind, tag, qty: 1 + Math.floor(next() * 12) });
  }
  const placed = [
    ...new Set(
      drafted
        .filter((one) => one.kind === 'buy' || one.kind === 'sell' || one.kind === 'reverse')
        .map((one) => one.tag),
    ),
  ];
  const lines = [
    'version 1',
    `strategy("Probe", qty = 2, pyramiding = 50, qtyType = "${qtyType}")`,
  ];
  const calls: Call[] = [];
  for (const one of drafted) {
    lines.push(`if bar.index == ${one.bar}`, `    ${spell(one, placed)}`);
    const what = closesWhat(one, placed);
    calls.push({
      bar: one.bar,
      isClose: what.close,
      closes: what.tag,
      stated: one.kind === 'closeQty',
    });
  }
  return { lines, calls, qtyType, bars };
}

/** What the destination did with one order, which is the whole of its answer. */
export interface Answer {
  readonly intent: OrderIntent;
  /** The cumulative quantity it has acknowledged, as it acknowledged it. */
  filled: number;
  /** Whether it said the order had ended. */
  ended: boolean;
}

/** One frame to send, and the bar the destination gets round to sending it on. */
interface Scheduled {
  readonly bar: number;
  readonly frame: OrderFrame;
  readonly filled: number;
  readonly ends: boolean;
}

/**
 * How one order is answered: late, partially, out of order, refused, or never.
 *
 * The delays are drawn per order rather than per run, so frames overtake one
 * another without the schedule having to arrange it: an order sent on bar two
 * and answered four bars later is answered after one sent on bar five.
 */
function answering(intent: OrderIntent, sentOn: number, next: () => number): readonly Scheduled[] {
  const qty = intent.qty as number;
  const late = (extra: number) => sentOn + 1 + Math.floor(next() * 3) + extra;
  const draw = next();
  if (draw < 0.12) return [];
  if (draw < 0.24) {
    return [{ bar: late(0), frame: ended(intent.intentId, 'rejected', 'no'), filled: 0, ends: true }];
  }
  if (draw < 0.36) {
    const part = Math.max(1, Math.floor(qty / 2));
    return [
      { bar: late(0), frame: partial(intent.intentId, part, 100), filled: part, ends: false },
    ];
  }
  if (draw < 0.5) {
    const part = Math.max(1, Math.floor(qty / 2));
    const first = late(0);
    return [
      { bar: first, frame: partial(intent.intentId, part, 100), filled: part, ends: false },
      { bar: first + 1, frame: frame(intent.intentId, qty, 100), filled: qty, ends: true },
    ];
  }
  if (draw < 0.58) {
    // More than was asked for. 17.8 folds it, and a reference holding it is one
    // no property here answers for: it is excluded by the same rule that
    // excludes an order nobody answered, which is that it was not answered in
    // full.
    return [{ bar: late(0), frame: frame(intent.intentId, qty + 1, 100), filled: qty + 1, ends: true }];
  }
  const at = late(0);
  const full = { bar: at, frame: frame(intent.intentId, qty, 100), filled: qty, ends: true };
  // A destination that repeats a frame, and one that restates a stale
  // cumulative quantity after a later one: 17.8 folds both to nothing, and a
  // property that only held for a tidy destination would be worth nothing.
  if (draw < 0.68) {
    return [full, { ...full, bar: at + 1 }, { ...full, bar: at + 2, filled: qty }];
  }
  if (draw < 0.74) {
    const stale = Math.max(0, qty - 1);
    return [
      full,
      { bar: at + 1, frame: partial(intent.intentId, stale, 100), filled: stale, ends: false },
    ];
  }
  return [full];
}

/** One fill the destination acknowledged: which order, and how much of it. */
export interface Settled {
  readonly intentId: number;
  /** The units it added, signed the way a position is. */
  readonly delta: number;
  /** Whether the destination had already been asked for less than it filled. */
  readonly over: boolean;
}

/** What one generated run came to: what was sent, and what was answered. */
export interface Outcome {
  readonly run: Run;
  readonly plan: Plan;
  /** Every order the destination was handed, with its own answer beside it. */
  readonly answers: ReadonlyMap<number, Answer>;
  /** What each tag held, as the destination's answers had it, at each bar. */
  readonly heldAt: ReadonlyMap<string, readonly number[]>;
  /** What the leg held, the same way, at each bar. */
  readonly legAt: readonly number[];
  /** What each position reference held, the same way, at each bar. */
  readonly refAt: ReadonlyMap<number, readonly number[]>;
  /** Every fill the destination sent, in the order it sent them. */
  readonly settling: readonly Settled[];
  /** The diagnostic that stopped the run, where one did. */
  readonly stopped: string | undefined;
  /** The bar it stopped on, after which the script sends nothing. */
  readonly stoppedAt: number;
}

/**
 * One generated run, driven to the end.
 *
 * The destination is answered before each bar is handed over, because that is
 * where frames fold (`host-interface.md` 7.4), and the tally of what each tag
 * holds is taken at the same instant: it is what the script's own bar is
 * looking at.
 */
export function runPlan(plan: Plan, seed: number): Outcome {
  const next = randomFrom(seed + 7919);
  const run = runFor(plan.lines);
  const answers = new Map<number, Answer>();
  const held = new Map<string, number>();
  const heldAt = new Map<string, number[]>();
  const queue: Scheduled[] = [];
  const settling: Settled[] = [];
  const legAt: number[] = [];
  const refHeld = new Map<number, number>();
  const refAt = new Map<number, number[]>();
  let leg = 0;
  const bars = plan.bars + 6;
  let seen = 0;
  let stopped: string | undefined;
  let stoppedAt = bars;

  for (let index = 0; index < bars; index += 1) {
    for (const one of queue) {
      if (one.bar !== index) continue;
      const answer = answers.get(one.frame.intentId);
      if (answer === undefined) continue;
      run.engine.deliver(one.frame);
      const tag = answer.intent.tag;
      const signed = answer.intent.side === 'buy' ? 1 : -1;
      // A cumulative quantity never decreases (17.8 step 2), so a frame
      // restating a stale one moves nothing here either. The engine folds it to
      // nothing and an oracle that subtracted it would be measuring itself.
      const delta = signed * Math.max(0, one.filled - answer.filled);
      held.set(tag, (held.get(tag) ?? 0) + delta);
      const ref = answer.intent.positionRef;
      refHeld.set(ref, (refHeld.get(ref) ?? 0) + delta);
      leg += delta;
      settling.push({
        intentId: one.frame.intentId,
        delta,
        over: one.filled > (answer.intent.qty ?? 0),
      });
      answer.filled = Math.max(answer.filled, one.filled);
      answer.ended = answer.ended || one.ends;
    }
    for (const [tag, amount] of held) {
      const row = heldAt.get(tag) ?? [];
      while (row.length < index) row.push(row[row.length - 1] ?? 0);
      row.push(amount);
      heldAt.set(tag, row);
    }
    legAt.push(leg);
    for (const [ref, amount] of refHeld) {
      const row = refAt.get(ref) ?? [];
      while (row.length < index) row.push(row[row.length - 1] ?? 0);
      row.push(amount);
      refAt.set(ref, row);
    }
    const result = run.engine.append(at(index, 100 + index), CONFIRMED, bars);
    if (result.diagnostic !== undefined) {
      stopped = result.diagnostic.code;
      stoppedAt = index;
      break;
    }
    while (seen < run.sent.length) {
      const intent = run.sent[seen] as OrderIntent;
      seen += 1;
      if (intent.kind !== 'place' || intent.qty === null || intent.side === null) continue;
      answers.set(intent.intentId, { intent, filled: 0, ended: false });
      for (const one of answering(intent, index, next)) queue.push(one);
    }
  }
  return { run, plan, answers, heldAt, legAt, refAt, settling, stopped, stoppedAt };
}

/**
 * What one part held, as the destination's own answers had it, entering a bar.
 *
 * The leg where no tag names a part, which is the same question one scope out.
 * Frames fold at the bar boundary (`host-interface.md` 7.4), so what a bar's
 * script is looking at is everything answered up to and including that bar's
 * own batch, and that is the instant this is taken at.
 */
export function heldEntering(outcome: Outcome, tag: string | null, bar: number): number {
  const row = tag === null ? outcome.legAt : outcome.heldAt.get(tag);
  if (row === undefined || row.length === 0) return 0;
  return row[Math.min(bar, row.length - 1)] ?? 0;
}

/** What one position reference held, the same way, entering a bar. */
export function settledEntering(outcome: Outcome, ref: number, bar: number): number {
  const row = outcome.refAt.get(ref);
  if (row === undefined || row.length === 0) return 0;
  return row[Math.min(bar, row.length - 1)] ?? 0;
}
