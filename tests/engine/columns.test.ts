/**
 * A history handed over as columns, `bar-source.ts` and issue 0005.
 *
 * The record form and the column form are two doors onto one bar cycle, so the
 * test that matters is that they are indistinguishable from inside: the same
 * study over the same bars gives the same columns bar for bar, whichever form
 * the bars arrived in. Each test below names the door it would catch leaking.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { BarColumns, HostBar } from '../../src/core/engine/index.js';
import { HOST, running, timeOf } from './support.js';

const STUDY = [
  'version 1',
  '',
  'study("Columns")',
  '',
  'fast = ema(close, 3)',
  'plot(fast, "Fast", aqua)',
  'plot(isNone(close) ? 1 : 0, "Close absent", aqua)',
  'plot(orElse(volume, -1), "Volume or minus one", aqua)',
].join('\n');

function records(count: number): HostBar[] {
  const out: HostBar[] = [];
  for (let i = 0; i < count; i += 1) {
    const close = 100 + Math.sin(i) * 3;
    out.push({ time: timeOf(i), open: close - 1, high: close + 2, low: close - 2, close, volume: 10 + i });
  }
  return out;
}

function asColumns(bars: readonly HostBar[], typed: boolean): BarColumns {
  const column = (field: keyof HostBar): ArrayLike<number | null> => {
    const values = bars.map((one) => (one[field] ?? null) as number | null);
    return typed ? Float64Array.from(values, (one) => (one === null ? Number.NaN : one)) : values;
  };
  return {
    time: column('time'),
    open: column('open'),
    high: column('high'),
    low: column('low'),
    close: column('close'),
    volume: column('volume'),
  };
}

function columnsOf(result: ReturnType<ReturnType<typeof running>['run']>): unknown[][] {
  return result.bars.map((one) => [...one.columns]);
}

test('a study over columns gives what it gives over records, bar for bar', () => {
  // Catches a column door that reads a field from the wrong array, or at the
  // wrong index, which would still draw a plausible line.
  const bars = records(30);
  const fromRecords = columnsOf(running(STUDY).run(bars));
  assert.deepEqual(columnsOf(running(STUDY).run(asColumns(bars, false))), fromRecords);
  assert.deepEqual(columnsOf(running(STUDY).run(asColumns(bars, true))), fromRecords);
});

test('NaN in a typed column is absence, exactly as null in a record', () => {
  // Catches NaN reaching the script as a number: it would propagate through
  // arithmetic as a value the language does not have.
  const bars = records(6);
  bars[3] = { ...(bars[3] as HostBar), close: null, volume: null };
  const fromRecords = columnsOf(running(STUDY).run(bars));
  const fromColumns = columnsOf(running(STUDY).run(asColumns(bars, true)));
  assert.deepEqual(fromColumns, fromRecords);
  assert.deepEqual(fromColumns[3]?.slice(1), [1, -1]);
});

test('a column shorter than time reads as absent past its end', () => {
  const bars = records(5);
  const columns = { ...asColumns(bars, false), volume: [1, 2, 3] };
  const result = running(STUDY).run(columns);
  assert.equal(result.bars.length, 5);
  assert.deepEqual(result.bars.map((one) => one.columns[2]), [1, 2, 3, -1, -1]);
});

test('a NaN time is a bar with no time, OS6025, and no columns at all is OS6010', () => {
  const bars = records(4);
  const columns = asColumns(bars, true);
  (columns.time as Float64Array)[2] = Number.NaN;
  assert.equal(running(STUDY).run(columns).diagnostic?.code, 'OS6025');
  const empty: BarColumns = { time: [], open: [], high: [], low: [], close: [] };
  assert.equal(running(STUDY).run(empty).diagnostic?.code, 'OS6010');
});

test('bars appended after a columnar run follow it, as they follow a run of records', () => {
  // Catches a live bar written into the host's own column, or compared against
  // nothing: the next bar is ordered against the last column bar.
  const bars = records(4);
  const engine = running(STUDY);
  engine.run(asColumns(bars, true));
  const next = engine.append({ ...(bars[3] as HostBar), time: timeOf(4) }, { isConfirmed: true });
  assert.equal(next.diagnostic, undefined);
  const repeat = running(STUDY);
  repeat.run(asColumns(bars, true));
  assert.equal(repeat.append(bars[3] as HostBar, { isConfirmed: true }).diagnostic?.code, 'OS6011');
});

test("a request's answer handed over as columns folds as its records do", () => {
  // Catches the fold reading a columnar answer through the record door, which
  // would find no bar at any index and leave the read absent on every bar.
  const study = 'version 1\nstudy("Other")\nplot(req.symbol("BBB", "60", close), "Other close", aqua)';
  const other: HostBar[] = [0, 1, 2].map((hour) => ({
    time: timeOf(0) + hour * 3_600_000,
    open: 50 + hour,
    high: 51 + hour,
    low: 49 + hour,
    close: 50.5 + hour,
    volume: 1,
  }));
  const chart = records(200);
  const through = (bars: readonly HostBar[] | BarColumns): unknown[][] => {
    const host = { ...HOST, requestBars: () => ({ bars }) };
    return columnsOf(running(study, { host }).run(chart));
  };
  const fromRecords = through(other);
  assert.ok(fromRecords.some((one) => one[0] !== null), 'the read answers on some bar');
  assert.deepEqual(through(asColumns(other, true)), fromRecords);
});
