/**
 * The money shapes, built at the door a host actually reaches for.
 *
 * Two things are under test here and the first one is the reason the file
 * exists at all. **Every shape is imported from `src/core/index.js`**, not from
 * the module that declares it, so a type that is declared and left out of the
 * accounting door, or out of the core door above it, fails this file at compile
 * time. That is the defect this repository has already had in another form: a
 * surface a module holds and its door does not name is a surface nobody outside
 * can use and everybody inside believes is public.
 *
 * The second is portability. A literal here is written against `Portable<T>`,
 * which turns a member JSON cannot carry into `never`, so adding a date, a map
 * or a function to any of these shapes stops this file compiling at the member
 * that cannot travel. The values are then walked and put through the canonical
 * encoding, because a type cannot see a number that is not finite or a member
 * that is undefined where the type says it is a number.
 *
 * The literals are exhaustive on purpose. A renamed field, a field taken away
 * and a field whose type stopped admitting absence are all a compile failure in
 * this file rather than a surprise in Phase 6, which is the whole point of
 * agreeing these shapes before anything computes them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalise } from '../../src/core/index.js';
import type {
  BarMark,
  ChargeBreakdown,
  ChargeSchedule,
  Contract,
  EquityPoint,
  MonthlyReturn,
  RecordedFill,
  Report,
  Summary,
  Trade,
  TradeAnalysis,
  TradeMarker,
} from '../../src/core/index.js';
import { portabilityProblems } from './support.js';
import type { Portable } from './support.js';

/** 2020-01-01T00:00:00Z, and a day, so a bar time is a number and not a clock. */
const T0 = 1_577_836_800_000;
const DAY = 86_400_000;

const CONTRACT: Portable<Contract> = {
  symbol: 'AAA',
  exchange: 'XX',
  currency: 'CUR',
  tickSize: 0.05,
  lotSize: 1,
  pointValue: 1,
  digits: 2,
};

/**
 * A schedule using all four bases, and a line levied on two earlier lines.
 *
 * The charge on a charge is the case the ordering rule exists for, so the
 * sample carries one: its `of` names two lines that are declared before it, and
 * a schedule that could not say that is a schedule two engines evaluate in two
 * orders.
 */
const SCHEDULE: Portable<ChargeSchedule> = {
  currency: 'CUR',
  digits: 2,
  slippageTicks: 1,
  lines: [
    { name: 'brokerage', base: 'turnover', side: 'both', rate: 0.0003, min: null, max: 20, of: [] },
    { name: 'clearing', base: 'units', side: 'both', rate: 0.01, min: null, max: null, of: [] },
    { name: 'handling', base: 'order', side: 'both', rate: 1.5, min: null, max: null, of: [] },
    {
      name: 'levy',
      base: 'charges',
      side: 'sell',
      rate: 0.18,
      min: 0.01,
      max: null,
      of: ['brokerage', 'handling'],
    },
  ],
  source: 'supplied',
};

const BREAKDOWN: Portable<ChargeBreakdown> = {
  lines: [
    { name: 'brokerage', amount: 0.12 },
    { name: 'clearing', amount: 0.04 },
    { name: 'handling', amount: 1.5 },
    { name: 'levy', amount: 0.29 },
  ],
  total: 1.95,
};

/**
 * Two fills on one reference: the entry that took it off zero and the exit that
 * returned it, which is the whole definition of a trade written as data.
 */
const FILLS: readonly Portable<RecordedFill>[] = [
  {
    seq: 1,
    intentId: 1,
    orderRef: 'REF-1',
    tag: 'entry',
    positionRef: 1,
    side: 'buy',
    units: 4,
    price: 100,
    barIndex: 2,
    barTime: T0 + 2 * DAY,
    refSizeBefore: 0,
    refSizeAfter: 4,
  },
  {
    seq: 2,
    intentId: 2,
    orderRef: 'REF-2',
    tag: 'exit',
    positionRef: 1,
    side: 'sell',
    units: 4,
    price: 104.25,
    barIndex: 5,
    barTime: T0 + 5 * DAY,
    refSizeBefore: 4,
    refSizeAfter: 0,
  },
];

/** A warmup bar, a bar with a close, and a bar whose close the host did not have. */
const MARKS: readonly Portable<BarMark>[] = [
  { barIndex: 0, time: T0, close: 99.5, inReport: false },
  { barIndex: 1, time: T0 + DAY, close: 99.75, inReport: true },
  { barIndex: 2, time: T0 + 2 * DAY, close: null, inReport: true },
];

/** One closed trade and one still open, which is the pair every statistic splits on. */
const TRADES: readonly Portable<Trade>[] = [
  {
    index: 1,
    positionRef: 1,
    side: 'long',
    openedOnBar: 2,
    openedAt: T0 + 2 * DAY,
    closedOnBar: 5,
    closedAt: T0 + 5 * DAY,
    barsHeld: 3,
    units: 4,
    entryPrice: 100,
    exitPrice: 104.25,
    entries: 1,
    exits: 1,
    grossProfit: 17,
    charges: 2.1,
    netProfit: 14.9,
    maxFavourable: 19,
    maxAdverse: -3.5,
    isOpen: false,
  },
  {
    index: 2,
    positionRef: 2,
    side: 'short',
    openedOnBar: 6,
    openedAt: T0 + 6 * DAY,
    closedOnBar: null,
    closedAt: null,
    barsHeld: null,
    units: 2,
    entryPrice: 103.5,
    exitPrice: null,
    entries: 1,
    exits: 0,
    grossProfit: 0,
    charges: 1.05,
    netProfit: -1.05,
    maxFavourable: 0.5,
    maxAdverse: -1.25,
    isOpen: true,
  },
];

const EQUITY: readonly Portable<EquityPoint>[] = [
  {
    barIndex: 5,
    time: T0 + 5 * DAY,
    realised: 17,
    charges: 2.1,
    openProfit: 0,
    cash: 100014.9,
    equity: 100014.9,
    exposure: 0,
    drawdown: 0,
    drawdownPercent: 0,
    runUp: 14.9,
    runUpPercent: 0.000149,
  },
  {
    barIndex: 6,
    time: T0 + 6 * DAY,
    realised: 17,
    charges: 3.15,
    openProfit: -0.5,
    cash: 100013.85,
    equity: 100013.35,
    exposure: 207,
    drawdown: -1.55,
    drawdownPercent: -0.0000154977,
    runUp: 13.35,
    runUpPercent: 0.0001335,
  },
];

const MONTHLY: readonly Portable<MonthlyReturn>[] = [
  { year: 2020, month: 1, netProfit: 14.9, returnPercent: 0.0149, trades: 1 },
];

const MARKERS: readonly Portable<TradeMarker>[] = [
  {
    barIndex: 2,
    time: T0 + 2 * DAY,
    tradeIndex: 1,
    kind: 'entry',
    side: 'buy',
    units: 4,
    price: 100,
    tag: 'entry',
  },
  {
    barIndex: 5,
    time: T0 + 5 * DAY,
    tradeIndex: 1,
    kind: 'exit',
    side: 'sell',
    units: 4,
    price: 104.25,
    tag: 'exit',
  },
];

/**
 * A summary with nothing closed against it but one trade, which is where the
 * three figures that are null rather than zero have to be null: no loss means
 * no profit factor, and a win rate of zero is a different claim from one that
 * cannot be stated yet.
 */
const SUMMARY: Portable<Summary> = {
  capital: 100000,
  currency: 'CUR',
  netProfit: 14.9,
  grossProfit: 17,
  grossLoss: 0,
  charges: 3.15,
  returnPercent: 0.0149,
  tradeCount: 1,
  openTradeCount: 1,
  wins: 1,
  losses: 0,
  scratches: 0,
  winRate: 1,
  averageWin: 14.9,
  averageLoss: 0,
  expectancy: 14.9,
  expectancyStandardError: 0,
  profitFactor: null,
  maxDrawdown: -1.55,
  maxDrawdownPercent: -0.0000154977,
  maxDrawdownAt: T0 + 6 * DAY,
  longestDrawdownBars: 1,
  maxRunUp: 14.9,
  maxRunUpPercent: 0.000149,
  maxRunUpAt: T0 + 5 * DAY,
  averageBarsHeld: 3,
  barsInMarket: 4,
  barCount: 7,
};

/**
 * The run's one closed trade taken apart, which is the long side alone: the
 * short trade is open, so it is in neither side, in no extreme and in no
 * streak. The short side's win rate is null for the same reason the summary's
 * profit factor is: nothing decided it.
 */
const ANALYSIS: Portable<TradeAnalysis> = {
  long: { count: 1, wins: 1, losses: 0, scratches: 0, netProfit: 14.9, winRate: 1 },
  short: { count: 0, wins: 0, losses: 0, scratches: 0, netProfit: 0, winRate: null },
  largestWin: 14.9,
  largestLoss: 0,
  maxConsecutiveWins: 1,
  maxConsecutiveLosses: 0,
};

const REPORT: Portable<Report> = {
  summary: SUMMARY,
  analysis: ANALYSIS,
  trades: TRADES,
  equity: EQUITY,
  monthly: MONTHLY,
  markers: MARKERS,
};

/** Every sample above, named as a finding would have to name it. */
const SAMPLES: readonly (readonly [string, unknown])[] = [
  ['the contract', CONTRACT],
  ['the schedule', SCHEDULE],
  ['the breakdown', BREAKDOWN],
  ['the fills', FILLS],
  ['the marks', MARKS],
  ['the report', REPORT],
];

test('every money shape the door names is portable data', () => {
  // Catches a shape that has grown a member nothing can write down: a date, a
  // map, a class instance, a number that is not finite, or a member that is
  // undefined where the type says it is a number. Each of those survives a
  // review, survives this process, and is silently dropped or mangled at the
  // first boundary the record crosses.
  for (const [what, sample] of SAMPLES) {
    assert.deepEqual(portabilityProblems(sample, what), []);
  }
});

test('the portability walker refuses what it says it refuses', () => {
  // A walker whose rule stopped matching would report every shape above as
  // portable, and a rule that cannot fail is indistinguishable from a clean
  // tree. The cases are fabricated here rather than taken from the samples, so
  // that correcting a shape cannot silently disarm the walker.
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;

  const refused: readonly (readonly [string, unknown])[] = [
    ['a date', { at: new Date(T0) }],
    ['a map', { at: new Map([['a', 1]]) }],
    ['a set', { at: new Set([1]) }],
    ['a function', { at: () => 1 }],
    ['a number that is not finite', { at: Number.NaN }],
    ['a member that is undefined', { at: undefined }],
    ['an object that comes back to itself', cycle],
  ];
  for (const [what, one] of refused) {
    assert.equal(portabilityProblems(one).length, 1, `${what} was accepted`);
  }

  assert.deepEqual(portabilityProblems({ at: [1, 'two', null, { three: true }] }), []);
});

test('a report comes back from the canonical encoding unchanged', () => {
  // Catches the same defect from the other side, through the encoding the run
  // record actually travels in rather than through a walker written here: a
  // member the encoder drops, a number it cannot spell, and an object it
  // flattens are all a value that does not come back equal to what went in.
  for (const [what, sample] of SAMPLES) {
    assert.deepStrictEqual(JSON.parse(canonicalise(sample)), sample, what);
  }
});
