/**
 * The run record, built at the door and put through the encoding it travels in.
 *
 * A record is the conformance case a second engine is handed, so the claim this
 * file exists to hold is narrow and load bearing: **a record is plain data, all
 * the way down, including the compiled program inside it.** The program here is
 * a real one out of the compiler rather than a hand written stand-in, because a
 * stand-in would prove the sample portable and say nothing about the thing a
 * record actually carries.
 *
 * As in the money shapes beside these, every type is imported from
 * `src/core/index.js` rather than from the module that declares it, so a type
 * left out of the backtest door or out of the core door fails this file at
 * compile time; and every literal is written against `Portable<T>`, so a member
 * JSON cannot carry stops it compiling at the member rather than at a boundary
 * months later.
 *
 * The two bar forms are both built. Inline is the conformance form, because a
 * case holds every byte of its own input; referenced is the operational form,
 * because nothing that grows with history may travel in a request body. They
 * are one union with two shapes, and a union nobody builds both arms of is a
 * union that compiles.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalise, programHash } from '../../src/core/index.js';
import type {
  BacktestSettings,
  BarsInRecord,
  RecordedBar,
  RecordedDiagnostic,
  RecordedFrame,
  RecordedOrder,
  Report,
  RunComparison,
  RunRecord,
} from '../../src/core/index.js';
import { portabilityProblems } from '../accounting/support.js';
import type { Portable } from '../accounting/support.js';
import { compile } from '../engine/support.js';

/** 2020-01-01T00:00:00Z, and a day, so a bar time is a number and not a clock. */
const T0 = 1_577_836_800_000;
const DAY = 86_400_000;

const SOURCE = `version 1
study("Record", overlay = true)

plot(close, "Close", aqua)
`;

const COMPILED = compile('record.oscript', SOURCE);

const SETTINGS: Portable<BacktestSettings> = {
  range: { from: T0, to: T0 + 2 * DAY },
  contract: {
    symbol: 'AAA',
    exchange: 'XX',
    currency: 'CUR',
    tickSize: 0.05,
    lotSize: 1,
    pointValue: 1,
    digits: 2,
  },
  costs: {
    currency: 'CUR',
    digits: 2,
    slippageTicks: 1,
    lines: [
      { name: 'brokerage', base: 'turnover', side: 'both', rate: 0.0003, min: null, max: 20, of: [] },
    ],
    source: 'supplied',
  },
  fill: {
    limitNeedsThrough: true,
    stopFillsAtOpenOnGap: true,
    levels: 'destination',
    version: 1,
  },
  inputs: { len: 14, smooth: true, label: 'AAA' },
  now: T0 + 2 * DAY,
  tolerance: { abs: 0, rel: 0, reason: null },
};

const ROWS: readonly Portable<RecordedBar>[] = [
  { time: T0, open: 99, high: 101, low: 98.5, close: 100, volume: 1200, oi: null },
  { time: T0 + DAY, open: 100, high: 105, low: 99.5, close: 104.25, volume: 1400, oi: null },
];

const INLINE: Portable<BarsInRecord> = {
  form: 'inline',
  hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  count: 2,
  rows: ROWS,
};

const REFERENCED: Portable<BarsInRecord> = {
  form: 'referenced',
  hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  count: 2,
  firstTime: T0,
  lastTime: T0 + DAY,
};

const FRAMES: readonly Portable<RecordedFrame>[] = [
  { afterBar: 1, intent: 1, status: 'working', filledQty: 0, avgFillPrice: null, orderRef: 'REF-1', text: null },
  { afterBar: 1, intent: 1, status: 'filled', filledQty: 4, avgFillPrice: 104.25, orderRef: 'REF-1', text: null },
];

const ORDERS: readonly Portable<RecordedOrder>[] = [
  {
    intent: 1,
    orderRef: 'REF-1',
    tag: 'entry',
    leg: 'main',
    positionRef: 1,
    symbol: 'AAA',
    exchange: 'XX',
    product: 'intraday',
    side: 'buy',
    qty: 4,
    qtyType: 'units',
    type: 'market',
    price: null,
    trigger: null,
    status: 'filled',
    filledQty: 4,
    avgFillPrice: 104.25,
    rejection: null,
    placedAt: T0 + DAY,
    updatedAt: T0 + DAY,
    units: 4,
  },
];

const DIAGNOSTICS: readonly Portable<RecordedDiagnostic>[] = [
  { code: 'OS8010', line: 3, column: 1, severity: 'warning', barIndex: null },
];

/**
 * A run that placed one order and closed nothing, which is where the figures
 * that are null rather than zero have to be null.
 *
 * A win rate of zero is the claim that everything lost; a win rate of null is
 * the claim that nothing has been decided yet, and the two are read differently
 * by anybody who acts on them.
 */
const REPORT: Portable<Report> = {
  summary: {
    capital: 100000,
    currency: 'CUR',
    netProfit: 0,
    grossProfit: 0,
    grossLoss: 0,
    charges: 1.25,
    returnPercent: 0,
    tradeCount: 0,
    openTradeCount: 1,
    wins: 0,
    losses: 0,
    scratches: 0,
    winRate: null,
    averageWin: 0,
    averageLoss: 0,
    expectancy: 0,
    expectancyStandardError: 0,
    profitFactor: null,
    maxDrawdown: 0,
    maxDrawdownPercent: 0,
    maxDrawdownAt: null,
    longestDrawdownBars: 0,
    averageBarsHeld: null,
    barsInMarket: 1,
    barCount: 2,
  },
  trades: [],
  equity: [],
  monthly: [],
  markers: [],
};

const RECORD: Portable<RunRecord> = {
  recordVersion: 1,
  engine: { name: 'reference', version: '0.3.0' },
  languageVersion: '1',
  program: COMPILED.program,
  programHash: programHash(COMPILED.program),
  source: COMPILED.program.source,
  settings: SETTINGS,
  bars: INLINE,
  frames: FRAMES,
  fills: [],
  orders: ORDERS,
  diagnostics: DIAGNOSTICS,
  report: REPORT,
};

const COMPARISON: Portable<RunComparison> = {
  comparable: true,
  differences: [{ what: 'costs', detail: 'one schedule carries a levy the other does not' }],
  deltas: [{ name: 'netProfit', before: 0, after: 14.9, delta: 14.9 }],
  separation: 1.87,
  sharedTrades: 3,
};

/** Every sample above, named as a finding would have to name it. */
const SAMPLES: readonly (readonly [string, unknown])[] = [
  ['the settings', SETTINGS],
  ['the inline bars', INLINE],
  ['the referenced bars', REFERENCED],
  ['the record', RECORD],
  ['the comparison', COMPARISON],
];

test('the fixture compiles, so the record holds a real program', () => {
  // A stand-in program would make every claim below a claim about the stand-in.
  assert.deepEqual(COMPILED.diagnostics.map((one) => one.code), []);
});

test('a run record is portable data, the compiled program included', () => {
  // Catches a member nothing can write down anywhere in the record: a date, a
  // map, a class instance, a number that is not finite, a member that is
  // undefined where the type says it is a number, and an object that comes back
  // to itself. Any of those reaches a second engine as a case it cannot read.
  for (const [what, sample] of SAMPLES) {
    assert.deepEqual(portabilityProblems(sample, what), []);
  }
});

test('a run record comes back from the canonical encoding unchanged', () => {
  // The record travels as canonical text and is compared as bytes, so the
  // question is not whether it encodes but whether it decodes to the same
  // value. A member the encoder drops or a number it cannot spell fails here.
  for (const [what, sample] of SAMPLES) {
    assert.deepStrictEqual(JSON.parse(canonicalise(sample)), sample, what);
  }
});
