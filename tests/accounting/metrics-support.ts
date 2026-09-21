/**
 * The trades and the bars the curve and the summary are measured over.
 *
 * Two builders and a corpus, and all three exist for the same reason: a test
 * that spells out seventeen fields to say "a long that made four" is a test
 * nobody reads, and a test nobody reads is a test nobody notices has stopped
 * asserting anything.
 *
 * **The builders derive what a trade would derive.** A caller states the shape
 * of the trade it means, the times, the bars held, the gross and the net follow
 * from it, and an inconsistent trade is not something a test can write by
 * accident. Where a test is about a figure the builder derives, it states that
 * figure itself and the builder stands aside.
 *
 * **The corpus is enumerated rather than generated.** Every arrangement of one
 * and two trades over eight bars, including the ones that open on the same bar,
 * close on the same bar, close on the bar they opened on, and never close at
 * all. There is no seed, no generator and nothing to reproduce: the cases are
 * the same on every machine and every run, and the count is a number this file
 * can be asked for.
 */
import type { BarMark, Contract } from '../../src/core/accounting/shapes.js';
import type { Trade } from '../../src/core/accounting/trades.js';

/** 2020-01-01T00:00:00Z, and a day, so a bar time is a number and not a clock. */
export const T0 = 1_577_836_800_000;
export const DAY = 86_400_000;

/** A point value of one, so a builder can derive a gross without a contract. */
export const CONTRACT: Contract = {
  symbol: 'AAA',
  exchange: 'XX',
  currency: 'CUR',
  tickSize: 0.05,
  lotSize: 1,
  pointValue: 1,
  digits: 2,
};

/** The time of a bar, which is what every figure that names a bar carries. */
export function timeOf(barIndex: number): number {
  return T0 + barIndex * DAY;
}

/** What a caller states; everything else about the trade follows from it. */
export interface TradeFields {
  readonly index?: number;
  readonly positionRef?: number;
  readonly side?: 'long' | 'short';
  readonly openedOnBar?: number;
  readonly closedOnBar?: number | null;
  readonly units?: number;
  readonly entryPrice?: number;
  readonly exitPrice?: number | null;
  readonly entries?: number;
  readonly exits?: number;
  readonly grossProfit?: number;
  readonly charges?: number;
  readonly netProfit?: number;
  readonly maxFavourable?: number;
  readonly maxAdverse?: number;
  readonly barsHeld?: number | null;
}

/**
 * One trade, with the derived halves derived.
 *
 * The gross is worked out at a point value of one, which is `CONTRACT`'s, so a
 * test about the point value states its own gross rather than being quietly
 * measured against a contract it did not use.
 */
export function tradeOf(fields: TradeFields = {}): Trade {
  const index = fields.index ?? 1;
  const side = fields.side ?? 'long';
  const openedOnBar = fields.openedOnBar ?? 0;
  const closedOnBar = fields.closedOnBar ?? null;
  const units = fields.units ?? 1;
  const entryPrice = fields.entryPrice ?? 100;
  const exitPrice = fields.exitPrice ?? null;
  const charges = fields.charges ?? 0;
  const direction = side === 'long' ? 1 : -1;
  const grossProfit =
    fields.grossProfit ?? (exitPrice === null ? 0 : direction * (exitPrice - entryPrice) * units);

  return {
    index,
    positionRef: fields.positionRef ?? index,
    side,
    openedOnBar,
    openedAt: timeOf(openedOnBar),
    closedOnBar,
    closedAt: closedOnBar === null ? null : timeOf(closedOnBar),
    barsHeld:
      fields.barsHeld !== undefined
        ? fields.barsHeld
        : closedOnBar === null
          ? null
          : closedOnBar - openedOnBar,
    units,
    entryPrice,
    exitPrice,
    entries: fields.entries ?? 1,
    exits: fields.exits ?? (closedOnBar === null ? 0 : 1),
    grossProfit,
    charges,
    netProfit: fields.netProfit ?? grossProfit - charges,
    maxFavourable: fields.maxFavourable ?? 0,
    maxAdverse: fields.maxAdverse ?? 0,
    isOpen: closedOnBar === null,
  };
}

/**
 * One bar per close, warmup first.
 *
 * A close of `null` is a bar the host had no price for, which is the case the
 * carried mark exists for and the one a fold is most likely to answer with a
 * zero.
 */
export function marksOf(closes: readonly (number | null)[], warmup = 0): readonly BarMark[] {
  return closes.map((close, barIndex) => ({
    barIndex,
    time: timeOf(barIndex),
    close,
    inReport: barIndex >= warmup,
  }));
}

/** The bars the enumerated corpus is laid out over. */
export const CORPUS_BARS = 8;

/**
 * Every arrangement of one or two trades over `CORPUS_BARS` bars.
 *
 * Each list is in the order the trades opened, which is what the fold requires
 * of a caller, and the second trade of a pair may open on the same bar as the
 * first, which is the arrangement a pointer sweep gets wrong when its
 * comparison is strict where it should not be.
 */
export function corpus(): readonly (readonly Trade[])[] {
  const spans = lives();
  const cases: (readonly Trade[])[] = [];
  for (const first of spans) {
    cases.push([tradeAt(1, first)]);
    for (const second of spans) {
      if (second.openedOnBar < first.openedOnBar) continue;
      cases.push([tradeAt(1, first), tradeAt(2, second)]);
    }
  }
  return cases;
}

/** One trade's life: the bar it opened on and the bar it closed on, if it did. */
interface Life {
  readonly openedOnBar: number;
  readonly closedOnBar: number | null;
}

/** Every life a trade can have over the corpus bars, the endless one included. */
function lives(): readonly Life[] {
  const found: Life[] = [];
  for (let openedOnBar = 0; openedOnBar < CORPUS_BARS; openedOnBar += 1) {
    found.push({ openedOnBar, closedOnBar: null });
    for (let closedOnBar = openedOnBar; closedOnBar < CORPUS_BARS; closedOnBar += 1) {
      found.push({ openedOnBar, closedOnBar });
    }
  }
  return found;
}

/**
 * A corpus trade: prices and charges that differ between the two, so a fold
 * that counts one trade twice or drops the second is a different number rather
 * than the same one.
 */
function tradeAt(index: number, life: Life): Trade {
  return tradeOf({
    index,
    side: index === 1 ? 'long' : 'short',
    openedOnBar: life.openedOnBar,
    closedOnBar: life.closedOnBar,
    units: index === 1 ? 2 : 3,
    entryPrice: index === 1 ? 100 : 120,
    exitPrice: life.closedOnBar === null ? null : index === 1 ? 104 : 118,
    charges: index === 1 ? 0.5 : 0.25,
  });
}
