/**
 * A read in a backtest: the chart's own bars folded as the history they are,
 * and another instrument served only when the caller hands over bars for it.
 *
 * The bars rise by one an hour from a four hour boundary, so the first four are
 * one four hour bucket closing at 103 and the next four one closing at 107.
 *
 * The wrong implementations it is written against: a walk that fed the fold one
 * bar at a time, which answers a lookahead read over history with the bucket so
 * far; a drive that served another instrument whether or not it had been handed
 * bars for it; and one that took the provider and never passed it to the host.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { backtest } from '../../src/core/backtest/index.js';
import type { BacktestResult } from '../../src/core/backtest/index.js';
import type { RequestQuery } from '../../src/core/engine/index.js';
import { compile } from '../engine/support.js';
import { FACTS, HOUR, START, rising, runSettings } from './support.js';

const BARS = rising(8);

function study(...lines: readonly string[]): ReturnType<typeof compile>['program'] {
  return compile('reads.oscript', ['version 1', 'study("Reads")', ...lines].join('\n')).program;
}

/** Every channel's value on every bar, from a run that must have happened. */
function rows(result: BacktestResult): readonly (readonly unknown[])[] {
  if (!result.ok) throw new Error(`the run was refused: ${result.diagnostic.code}`);
  return result.rows ?? [];
}

test('a lookahead read over a backtest reads its bucket in full from the first bar', () => {
  // Against a walk that handed the fold one bar at a time, bar 0 read 100,
  // the bucket so far, which is the live chart's reading and not history's.
  const program = study(
    'plot(req.timeframe("4h", close, mode = "lookahead"), "Lookahead")',
    'plot(req.timeframe("4h", close, mode = "developing"), "Developing")',
  );
  const found = rows(backtest(program, BARS, runSettings(), { instrument: FACTS, rows: true }));
  assert.deepEqual(found.map((row) => row[0]), [103, 103, 103, 103, 107, 107, 107, 107]);
  assert.deepEqual(found.map((row) => row[1]), [100, 101, 102, 103, 104, 105, 106, 107]);
});

test('a read of another instrument is refused at load when no bars are handed over for it', () => {
  // Against a drive that served req.symbol whatever it was handed, the run
  // went ahead and drew a line with nothing in it.
  const program = study('plot(req.symbol("OTHER", "4h", close), "Other")');
  const result = backtest(program, BARS, runSettings(), { instrument: FACTS });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostic.code, 'OS6006');
  assert.equal(result.diagnostic.values['tag'], 'req.symbol');
});

test('a read of another instrument is folded from the bars the caller hands over, asked once', () => {
  // Against a drive that took the option and never passed it to the host,
  // the program was refused exactly as it is above.
  const asked: RequestQuery[] = [];
  const other = [0, 4, 8].map((hour, at) => ({
    time: START + hour * HOUR, open: 50 + at, high: 51 + at, low: 49 + at, close: 50 + at, volume: 1, oi: null,
  }));
  const program = study('plot(req.symbol("OTHER", "4h", close), "Other")');
  const found = rows(backtest(program, BARS, runSettings(), {
    instrument: FACTS,
    rows: true,
    requestBars: (query) => {
      asked.push(query);
      return { bars: other };
    },
  }));
  assert.equal(asked.length, 1);
  assert.equal(asked[0]?.instrument, 'OTHER');
  assert.equal(asked[0]?.exchange, 'XX', 'the chart exchange, the default the script did not write');
  assert.deepEqual(found.map((row) => row[0]), [null, null, null, null, 50, 50, 50, 50]);
});
