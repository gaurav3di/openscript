/**
 * The contract, the fill and the line builders the cost model is tested with.
 *
 * Two files ask about one schedule shape: what it charges, and what it is
 * refused for. The builders are here so that neither file states the sample
 * twice, and so that a row in either one states only the thing it is about and
 * takes the rest as read.
 *
 * **The sample contract's point value is not 1 and its fill is not one unit.**
 * Both are deliberate. A cost model that leaves the point value out of turnover,
 * or that charges a per unit line once per fill, is exactly right on a contract
 * whose point value is 1 and a fill of a single unit, so a sample built that way
 * would pass every wrong implementation this pair of files exists to catch.
 */
import type { ChargeBreakdown, ChargeLine, ChargeSchedule, Contract, Money, RecordedFill } from '../../src/core/index.js';

/** A contract whose point value is not 1, so leaving it out is a different number. */
export const CONTRACT: Contract = {
  symbol: 'AAA',
  exchange: 'XX',
  currency: 'CUR',
  tickSize: 0.05,
  lotSize: 1,
  pointValue: 50,
  digits: 2,
};

/** Two units at 100 on a point value of 50: a turnover of 10000, exactly. */
export const FILL: RecordedFill = {
  seq: 1,
  intentId: 1,
  orderRef: 'a',
  tag: 'entry',
  positionRef: 1,
  side: 'buy',
  units: 2,
  price: 100,
  barIndex: 4,
  barTime: null,
  refSizeBefore: 0,
  refSizeAfter: 2,
};

export function contractOf(over: Partial<Contract> = {}): Contract {
  return { ...CONTRACT, ...over };
}

export function fillOf(over: Partial<RecordedFill> = {}): RecordedFill {
  return { ...FILL, ...over };
}

/** A line, defaulted to the harmless shape, so a row states only what it is about. */
export function lineOf(over: Partial<ChargeLine> & { readonly name: string }): ChargeLine {
  return { base: 'order', side: 'both', rate: 0, min: null, max: null, of: [], ...over };
}

export function scheduleOf(
  lines: readonly ChargeLine[],
  over: Partial<ChargeSchedule> = {},
): ChargeSchedule {
  return { currency: 'CUR', digits: 2, slippageTicks: 0, lines, source: 'supplied', ...over };
}

/** What the breakdown says one named line came to, or undefined where it did not apply. */
export function amountOf(breakdown: ChargeBreakdown, name: string): Money | undefined {
  return breakdown.lines.find((one) => one.name === name)?.amount;
}

/**
 * A schedule that can be carried out: a percentage under a cap, a per unit fee,
 * and a charge levied on both of them. It is the base every refused row alters
 * by exactly one thing.
 */
export const SOUND: readonly ChargeLine[] = [
  lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001, max: 20 }),
  lineOf({ name: 'clearing', base: 'units', rate: 0.01 }),
  lineOf({ name: 'levy', base: 'charges', rate: 0.18, of: ['brokerage', 'clearing'] }),
];
