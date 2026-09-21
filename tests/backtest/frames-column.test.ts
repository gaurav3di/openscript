/**
 * A frame's instant, from the run that answered it to the file a case is read
 * from.
 *
 * The writer and the reader are held to each other here on purpose. The
 * projection in `src/core/backtest/case.ts` writes `frames.csv` and
 * `scripts/lib/case-reading.mjs` reads one back, and the failure this file
 * exists for is the two disagreeing about which column is which, which neither
 * of them can see alone: a projection that wrote the instant where the
 * reference belongs passes every test of the projection, and so does a reader
 * that reads the columns by a list of its own.
 *
 * The reader is reached by a dynamic load, because the compiled test tree
 * cannot import a module under `scripts/` statically without a second build
 * configuration. The specifier is a name holding a literal, which is the shape
 * the no-eval rules ask for. The same arrangement is in
 * `tests/suite/compare.test.ts` and for the same reason.
 *
 * The wrong implementations below are written against: a projection that drops
 * a frame's instant, one that spells an absent instant as an empty cell rather
 * than the word every other case file uses, a reader that takes that word for a
 * number, and a reader that gives a frame from a file with no `time` column
 * something other than absence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { backtest, caseFilesFrom } from '../../src/core/backtest/index.js';
import type { RecordedFrame, RunRecord, SimulatorOptions } from '../../src/core/backtest/index.js';
import { FACTS, inAndOut, probeText, rising, runSettings } from './support.js';

const READER = '../../../scripts/lib/case-reading.mjs';

/** One row of `frames.csv` as the reader hands it back. */
interface ReadFrame {
  readonly afterBar: number;
  readonly intent: number;
  readonly status: string;
  readonly filledQty: number;
  readonly avgFillPrice: number | null;
  readonly orderRef: string;
  readonly text: string;
  readonly time: number | null;
}

interface ReadingModule {
  parseFrames(text: string): { ok: boolean; rows?: readonly ReadFrame[]; reason?: string };
}

const reading = (await import(READER)) as ReadingModule;

/** One line break, named so a generated file cannot pick up a stray one. */
const BREAK = String.fromCharCode(10);

const BARS = rising(8);

const IDENTITY = {
  id: 'perf/in-and-out',
  description: 'A long entered on one bar and closed on another folds to one trade.',
};

/** The script, the bars and the host choices every run below shares. */
const SHAPE = { entryBar: 1, exitBar: 4, qty: 10 };

/**
 * A run whose destination answers one order over three boundaries.
 *
 * Three instants that are not one instant is the whole point: an order placed
 * on bar one and answered after bars one, two and three is the case a suite of
 * frames arriving at the boundary that placed them cannot tell apart from a
 * run that never moved the field at all.
 */
function spread(): RunRecord {
  const schedule: NonNullable<SimulatorOptions['fill']['schedule']> = [
    { order: 1, afterBars: 0, does: 'fill', units: 0 },
    { order: 1, afterBars: 1, does: 'fill', units: 4 },
    { order: 1, afterBars: 2, does: 'fill', units: 10 },
  ];
  const fill = { ...runSettings().fill, schedule };
  const result = backtest(inAndOut(SHAPE), BARS, runSettings({ fill }), {
    sourceText: probeText(SHAPE),
    instrument: FACTS,
  });
  assert.equal(result.ok, true, 'the run was refused before its first bar');
  if (!result.ok) throw new Error('unreachable');
  return result.record;
}

/** The `frames.csv` a record projects to, which is the file a case holds. */
function framesFile(record: RunRecord): string {
  const made = caseFilesFrom(record, IDENTITY);
  if (!made.ok) throw new Error(made.reason);
  const file = made.files['frames.csv'];
  if (file === undefined) throw new Error('the record projected to no frames.csv');
  return file;
}

/** The rows of that file, read back, or the reason it could not be read. */
function rowsOf(file: string): readonly ReadFrame[] {
  const read = reading.parseFrames(file);
  assert.equal(read.ok, true, read.reason);
  if (read.rows === undefined) throw new Error('unreachable');
  return read.rows;
}

/** Every column of one frame, as a record holds it and as a file reads back. */
function columns(frame: RecordedFrame | ReadFrame): readonly unknown[] {
  return [
    frame.afterBar,
    frame.intent,
    frame.status,
    frame.filledQty,
    frame.avgFillPrice,
    frame.orderRef ?? '',
    frame.text ?? '',
    frame.time,
  ];
}

test('the frames a run answered read back out of its own case file, column for column', () => {
  const record = spread();
  const rows = rowsOf(framesFile(record));

  assert.equal(rows.length, record.frames.length);
  assert.deepEqual(
    rows.map(columns),
    record.frames.map(columns),
    'the file the projection wrote is not the frames the run answered',
  );

  // The three instants are three bars, which is what makes the fold of
  // `updatedAt` provable from the file: an order placed on bar one and last
  // changed after bar three.
  const spoken = rows.filter((row) => row.intent === 1).map((row) => row.time);
  assert.deepEqual(spoken, [BARS[1]?.time, BARS[2]?.time, BARS[3]?.time]);
});

test('an instant the destination never stated is written none and reads back as absence', () => {
  // The spelling matters twice over. An empty cell between two commas is
  // indistinguishable from a file somebody's editor trimmed, and a reader that
  // took the word for a number would hand the engine an instant of NaN.
  const record = spread();
  const first = record.frames[0];
  if (first === undefined) throw new Error('the run answered no frame');
  const silent: RunRecord = { ...record, frames: [{ ...first, time: null }, ...record.frames.slice(1)] };

  const file = framesFile(silent);
  const line = file.split(BREAK)[1] ?? '';
  assert.equal(line.endsWith(',none'), true, line);

  const rows = rowsOf(file);
  assert.equal(rows[0]?.time, null);
  assert.equal(rows[1]?.time, BARS[2]?.time);
});

test('a file with no time column gives every frame no instant and keeps the rest', () => {
  // Section 3: an omitted column is absent on every row. Catches a reader that
  // reads the columns by a list of its own rather than by the file's own
  // header, which would take the row one column short and put the reference
  // where the text belongs.
  const record = spread();
  const lines = framesFile(record).trimEnd().split(BREAK);
  const narrowed = lines.map((line) => line.slice(0, line.lastIndexOf(','))).join(BREAK) + BREAK;

  const rows = rowsOf(narrowed);
  assert.equal(rows.length, record.frames.length);
  for (const row of rows) assert.equal(row.time, null);
  assert.deepEqual(
    rows.map((row) => [row.status, row.filledQty, row.avgFillPrice, row.orderRef]),
    record.frames.map((frame) => [frame.status, frame.filledQty, frame.avgFillPrice, frame.orderRef ?? '']),
  );
});
