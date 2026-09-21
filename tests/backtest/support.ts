/**
 * What a backtest test runs: a real program, real bars, and one driver.
 *
 * Every strategy below goes through the whole pipeline, source to record,
 * because the driver's contract is with a compiled program and a hand written
 * one is a program no compiler emits. The bars come from a fixed formula and
 * are not market data: what matters is that they are the same on every machine,
 * so a number a test asserts is a number about the driver.
 *
 * The strategies are deliberately dull. A test of the driver wants an order
 * placed on a bar it names and closed on a bar it names, so that what the fill
 * should be is arithmetic a reader can do in their head, and so that a wrong
 * answer names its own cause rather than being an indicator disagreement.
 */
import type { Contract } from '../../src/core/accounting/index.js';
import type { CompiledProgram } from '../../src/core/emit/index.js';
import type { BacktestSettings, InstrumentFacts } from '../../src/core/backtest/index.js';
import { settingsFor } from '../../src/core/backtest/index.js';
import type { RecordedBar } from '../../src/core/backtest/index.js';
import { compile } from '../engine/support.js';

/** One line break, named so a generated script cannot pick up a stray one. */
const BREAK = String.fromCharCode(10);

/** One bar an hour, which is an interval and not a market. */
export const HOUR = 3_600_000;
export const START = 1_748_736_000_000;

/** A placeholder instrument, priced in a currency nobody issues. */
export const CONTRACT: Contract = {
  symbol: 'AAA',
  exchange: 'XX',
  currency: 'CUR',
  tickSize: 0.05,
  lotSize: 1,
  pointValue: 1,
  digits: 2,
};

/**
 * The facts of `host-interface.md` 4.1 the contract does not hold, as a test
 * host states them.
 *
 * `hasVolume` is the one that matters: 4.1 requires it of every host, and a
 * case cannot be harvested from a run whose host never stated it. The interval
 * is the hour the bars above are spaced at, and the zone is the one a wall
 * clock in a test is read in.
 */
export const FACTS: InstrumentFacts = { interval: '60', timezone: 'UTC', hasVolume: true };

/**
 * Bars that rise by one a bar, with a range around the close.
 *
 * A straight line, on purpose: a strategy that buys on bar one and sells on bar
 * four makes exactly three points a unit, and a test asserting three points is
 * asserting the fold rather than a shape.
 */
export function rising(count: number, from = 100): readonly RecordedBar[] {
  const out: RecordedBar[] = [];
  for (let index = 0; index < count; index += 1) {
    const close = from + index;
    out.push({
      time: START + index * HOUR,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000,
      oi: null,
    });
  }
  return out;
}

/** The same bars with one price moved, which is a revision of the history. */
export function revised(bars: readonly RecordedBar[], at: number, close: number): readonly RecordedBar[] {
  return bars.map((bar, index) => (index === at ? { ...bar, close } : bar));
}

/**
 * A strategy that buys on one bar and closes on another.
 *
 * `fillOn` is a parameter because where a market order is priced is the one
 * declaration field the venue reads, and the two spellings produce two
 * different fills from the same bars.
 */
export function inAndOut(options: {
  readonly entryBar?: number;
  readonly exitBar?: number;
  readonly qty?: number;
  readonly qtyType?: string;
  readonly fillOn?: string;
  readonly commission?: number;
  readonly commissionType?: string;
  readonly slippage?: number;
} = {}): CompiledProgram {
  return compile('probe.oscript', probeText(options)).program;
}

/**
 * The same probe, as text.
 *
 * A case holds the script rather than a fingerprint of it, so a test about
 * cases needs the source and the program to be the same revision. Both come
 * from here, so the two cannot drift.
 */
export function probeText(options: {
  readonly entryBar?: number;
  readonly exitBar?: number;
  readonly qty?: number;
  readonly qtyType?: string;
  readonly fillOn?: string;
  readonly commission?: number;
  readonly commissionType?: string;
  readonly slippage?: number;
} = {}): string {
  const entry = options.entryBar ?? 1;
  const exit = options.exitBar ?? 4;
  const lines = [
    'version 1',
    '',
    'strategy("Probe", capital = 100000,',
    `         qty = ${String(options.qty ?? 2)}, qtyType = "${options.qtyType ?? 'units'}",`,
    `         fillOn = "${options.fillOn ?? 'close'}", slippage = ${String(options.slippage ?? 0)},`,
    `         commissionType = "${options.commissionType ?? 'perTrade'}", commission = ${String(options.commission ?? 0)})`,
    '',
    `if bar.index == ${String(entry)}`,
    '    buy(tag = "long")',
    '',
    `if bar.index == ${String(exit)}`,
    '    close()',
    '',
    'plot(close, "Close")',
  ];
  return lines.join(BREAK);
}

/** A strategy that rests a limit below the market and never cancels it. */
export function restingEntry(limit: number): CompiledProgram {
  const lines = [
    'version 1',
    '',
    'strategy("Resting probe", capital = 100000, qty = 1, qtyType = "units",',
    '         fillOn = "close", commissionType = "perTrade", commission = 0)',
    '',
    'if bar.index == 0',
    `    buy(tag = "rest", limit = ${String(limit)})`,
    '',
    'plot(close, "Close")',
  ];
  return compile('resting.oscript', lines.join('\n')).program;
}

/**
 * A strategy that buys early and flattens on the last bar.
 *
 * `bar.isLast` is derived from the count the host states, so this is the
 * strategy that tells a driver handing over the wrong count from one handing
 * over the total: under the wrong one every bar is the last bar.
 */
export function flatOnLast(): CompiledProgram {
  const lines = [
    'version 1',
    '',
    'strategy("Last bar probe", capital = 100000, qty = 1, qtyType = "units",',
    '         fillOn = "close", commissionType = "perTrade", commission = 0)',
    '',
    'if bar.index == 1',
    '    buy(tag = "long")',
    '',
    'if bar.isLast and pos.size > 0',
    '    close()',
    '',
    'plot(close, "Close")',
  ];
  return compile('last.oscript', lines.join('\n')).program;
}

/** The settings a test runs under, with whatever it wanted different. */
export function runSettings(chosen: Partial<BacktestSettings> = {}): BacktestSettings {
  return settingsFor(CONTRACT, chosen);
}
