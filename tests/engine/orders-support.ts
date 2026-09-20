/**
 * What an order test measures: the destination, and nothing else.
 *
 * **Every assertion about an order is an assertion about what was handed over.**
 * A rule that stops a call and a rule that sizes it down are both acceptable
 * answers to "this bar sent too much", so a test that asserted the diagnostic
 * alone would hold one answer and fail the other. What every acceptable answer
 * has to produce is a destination that was never handed an order taking a
 * position through zero, which is what `crossings` measures here.
 *
 * The helpers live in one file because two suites ask the same questions of the
 * same recording: `crossing.test.ts` asks them of one bar and `working.test.ts`
 * asks them of a run. Written out twice they would drift, and the one that
 * drifted would be the one nobody was reading.
 */
import type { Diagnostic } from '../../src/core/index.js';
import type { HostBar, OrderFrame, OrderIntent } from '../../src/core/engine/index.js';
import { Engine } from '../../src/core/engine/index.js';
import { HOST, running, timeOf } from './support.js';

export const CONFIRMED = { isConfirmed: true };
export const MOVING = { isConfirmed: false };

export interface Run {
  readonly engine: Engine;
  /** Every intent the destination was handed, which is the whole of what it saw. */
  readonly sent: OrderIntent[];
}

export function runFor(lines: readonly string[]): Run {
  const sent: OrderIntent[] = [];
  const engine = running(lines.join('\n'), {
    host: {
      ...HOST,
      route: (effect) => {
        for (const intent of effect.intents) sent.push(intent);
      },
    },
  });
  return { engine, sent };
}

/** A bar at one price, dated so that a series stays strictly increasing. */
export function at(index: number, close: number): HostBar {
  return { open: close, high: close, low: close, close, volume: 1, time: timeOf(index) };
}

export function frame(intentId: number, filledQty: number, price: number): OrderFrame {
  return { intentId, status: 'filled', filledQty, avgFillPrice: price };
}

/** A frame that leaves the order live, which is a partial fill at a destination. */
export function partial(intentId: number, filledQty: number, price: number): OrderFrame {
  return { intentId, status: 'working', filledQty, avgFillPrice: price };
}

/** A frame that ends the order with nothing filled. */
export function ended(intentId: number, status: string, text = ''): OrderFrame {
  return { intentId, status, filledQty: 0, text };
}

/** Runs bars until one fails, filling every order the bar sent. */
export function ran(run: Run, bars: number): Diagnostic | undefined {
  let answered = 0;
  for (let index = 0; index < bars; index += 1) {
    while (answered < run.sent.length) {
      const intent = run.sent[answered] as OrderIntent;
      answered += 1;
      if (intent.kind !== 'place' || intent.qty === null) continue;
      run.engine.deliver(frame(intent.intentId, intent.qty, 100));
    }
    const result = run.engine.append(at(index, 100 + index), CONFIRMED, bars);
    if (result.diagnostic !== undefined) return result.diagnostic;
  }
  return undefined;
}

/**
 * Runs bars, delivering the frames listed for each bar and nothing else.
 *
 * A destination slower than the chart is the whole subject of `working.test.ts`,
 * so the frames are the fixture rather than a rule: a bar with none listed is a
 * bar the destination said nothing on.
 */
export function ranAnswering(
  run: Run,
  bars: number,
  frames: Readonly<Record<number, readonly OrderFrame[]>>,
): Diagnostic | undefined {
  for (let index = 0; index < bars; index += 1) {
    for (const one of frames[index] ?? []) run.engine.deliver(one);
    const result = run.engine.append(at(index, 100 + index), CONFIRMED, bars);
    if (result.diagnostic !== undefined) return result.diagnostic;
  }
  return undefined;
}

/**
 * Every order the destination was handed that takes a position through zero.
 *
 * The property itself, and the whole of what a host can see. Each intent
 * carries the position reference it settles (`host-interface.md` 7.1), so the
 * orders of one reference are one position's own book: an order that takes that
 * book from long to short, or from short to long, is an order that crossed
 * zero. Filling is not needed and is not done here, because the defect is in
 * what was sent rather than in what came back.
 *
 * Quantities are compared as numbers, which they are only where every order of
 * one reference states the same unit. A reference that mixes a quantity stated
 * in lots with one the engine worked out in units is two kinds of number, and
 * it is left out rather than guessed at: the tests about those declarations say
 * what they assert instead.
 */
export function crossings(run: Run): readonly string[] {
  const book = new Map<number, number>();
  const units = new Map<number, string>();
  const mixed = new Set<number>();
  for (const intent of run.sent) {
    if (intent.kind !== 'place' || intent.qty === null || intent.side === null) continue;
    const seen = units.get(intent.positionRef);
    if (seen === undefined) units.set(intent.positionRef, intent.qtyType);
    else if (seen !== intent.qtyType) mixed.add(intent.positionRef);
  }
  const found: string[] = [];
  for (const intent of run.sent) {
    if (intent.kind !== 'place' || intent.qty === null || intent.side === null) continue;
    if (mixed.has(intent.positionRef)) continue;
    const signed = intent.side === 'buy' ? intent.qty : -intent.qty;
    const before = book.get(intent.positionRef) ?? 0;
    const after = before + signed;
    if (before !== 0 && after !== 0 && Math.sign(after) !== Math.sign(before)) {
      found.push(
        `position ${intent.positionRef} held ${before} and was sent ${signed} on bar ` +
          `${intent.bar.index}`,
      );
    }
    book.set(intent.positionRef, after);
  }
  return found;
}

/** The quantities of one side, in the order the destination was handed them. */
export function quantities(run: Run, side: string): readonly (number | null)[] {
  return run.sent.filter((one) => one.kind === 'place' && one.side === side).map((one) => one.qty);
}

/** What one side sent in total, which is what a ceiling is about. */
export function total(run: Run, side: string): number {
  return quantities(run, side).reduce((sum: number, one) => sum + (one ?? 0), 0);
}

/** The position references the orders of one side carried. */
export function references(run: Run, side: string): readonly number[] {
  return run.sent
    .filter((one) => one.kind === 'place' && one.side === side)
    .map((one) => one.positionRef);
}

/** A leg that may hold several tags at once, so a part can be told from the whole. */
export const PROBE = ['version 1', 'strategy("Probe", qty = 2, pyramiding = 50)'];
