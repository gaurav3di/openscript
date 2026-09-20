/**
 * The worked example of `compiled-program.md` section 12, executed and compared
 * against the trace the specification prints.
 *
 * This is the engine's conformance test of itself. Somebody implementing an
 * engine in another language reads 12.4 to 12.7 and builds against it, so an
 * engine that produces anything else for that program is an engine their
 * scripts will not agree with, whatever the rest of the specification says.
 *
 * The bars and the expected columns are read out of the specification at test
 * time rather than copied here. A copy would pass forever after the table
 * changed, which is the one failure this test exists to prevent.
 *
 * The example's own source does not compile: it names its moving average `avg`,
 * and `avg(arr)` is a library function, so assigning to it is OS2002. The name
 * is substituted, exactly as the emitter's own test substitutes it, and the
 * substitution is recorded here rather than hidden.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Value } from '../../src/core/engine/index.js';
import { SPEC, compile, engineFor, flat, timeOf } from './support.js';

const TAKEN = 'avg';
const FREE = 'mean';

function specText(): string {
  return readFileSync(SPEC, 'utf8');
}

/** 12.1's source, with the line number gutter the specification prints stripped. */
function workedSource(): string {
  const text = specText();
  const at = text.indexOf('### 12.1 The source');
  const fence = text.indexOf('```', at);
  const from = text.indexOf('\n', fence) + 1;
  const to = text.indexOf('```', from);
  const lines = text.slice(from, to).replace(/\n$/, '').split('\n');
  return lines
    .map((line) => line.replace(/^\s*\d+(?:\s\s|$)/, ''))
    .join('\n')
    .replace(new RegExp(`\\b${TAKEN}\\b`, 'g'), FREE);
}

/**
 * 12.6's table: one row per bar, with the plot column and the marker.
 *
 * The table's last two rows are the two executions of bar 4, so the parse keeps
 * the rows in order and the test walks them in order.
 */
interface Row {
  readonly close: number;
  readonly plot: Value;
  readonly marker: Value;
}

function workedRows(): readonly Row[] {
  const text = specText();
  const at = text.indexOf('### 12.6 Bars 0 to 4');
  const end = text.indexOf('### 12.7', at);
  const rows: Row[] = [];
  for (const line of text.slice(at, end).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((one) => one.trim());
    // | bar | close | state | avg | close > avg | hits | plot | marker |
    const close = Number(cells[2]);
    if (!Number.isFinite(close)) continue;
    const plot = cells[7] ?? '';
    const marker = cells[8] ?? '';
    rows.push({
      close,
      plot: plot === '`null`' ? null : Number(plot),
      marker: marker === 'none' || marker === 'held' ? null : marker,
    });
  }
  return rows;
}

test('the worked example computes the columns 12.6 prints, bar by bar', () => {
  const rows = workedRows();
  assert.equal(rows.length, 6, 'section 12.6 has five bars and one re-execution');

  const engine = engineFor(compile('two-bar-mean.osc', workedSource()));
  const confirmed = rows.length - 2;

  for (let bar = 0; bar < confirmed; bar += 1) {
    const row = rows[bar] as Row;
    const result = engine.append(flat(row.close, timeOf(bar)), { isConfirmed: true }, 5);
    assert.equal(result.diagnostic, undefined);
    assert.equal(result.columns[0], row.plot, `the plot column on bar ${bar}`);
    assert.equal(result.columns[1], row.marker, `the marker channel on bar ${bar}`);
    assert.equal(result.applied, true, `bar ${bar} is confirmed, so step 9 applies`);
  }

  // Bar 4 is the newest bar of a live chart: executed once at 106 and again
  // once the price has fallen back to 104.
  const first = rows[confirmed] as Row;
  const second = rows[confirmed + 1] as Row;

  const moving = engine.append(
    flat(first.close, timeOf(confirmed)),
    { isConfirmed: false, isRealtime: true },
    5,
  );
  assert.equal(moving.columns[0], first.plot, '12.6 publishes the column on a moving bar');
  assert.equal(moving.applied, false, 'the marker is held: the bar is not confirmed');
  // 12.6 writes "held" in that row's marker cell and 12.7 says step 9 discards
  // it. The channel was written by the execution, so an engine that published it
  // anyway would draw the marker on a bar that is still moving and take it back
  // on the next tick.
  assert.equal(moving.columns[1], first.marker, 'a held marker reads back as no marker');

  const again = engine.update(flat(second.close, timeOf(confirmed)), {
    isConfirmed: false,
    isRealtime: true,
  });
  assert.equal(again.columns[0], second.plot, 'the column is rewritten after the rollback');
  assert.equal(again.columns[1], second.marker, 'the branch is not taken the second time');
});

/**
 * Catches an engine that re-executes a moving bar without restoring the
 * checkpoint: it would push 104 onto `[105, 106]`, giving an average of 105,
 * which is a number that corresponds to no two bars on the chart. 12.7 spells
 * that failure out as the whole argument for section 6.
 */
test('without the restore the moving bar would average two bars that never met', () => {
  const rows = workedRows();
  const engine = engineFor(compile('two-bar-mean.osc', workedSource()));
  for (let bar = 0; bar < rows.length - 2; bar += 1) {
    engine.append(flat((rows[bar] as Row).close, timeOf(bar)), { isConfirmed: true }, 5);
  }
  engine.append(flat(106, timeOf(4)), { isConfirmed: false, isRealtime: true }, 5);
  const again = engine.update(flat(104, timeOf(4)), { isConfirmed: false, isRealtime: true });
  assert.equal(again.columns[0], 104.5);
  assert.notEqual(again.columns[0], 105, 'an engine that skipped the restore reads 105 here');
});

/**
 * The column a host reads after the run is the one the last execution wrote.
 *
 * Catches an engine that appends a history entry per execution rather than
 * replacing bar `i`'s: the plot column would grow past the number of bars and
 * every reader of it would be one bar out.
 */
test('a re-executed bar replaces its column rather than adding one', () => {
  const rows = workedRows();
  const engine = engineFor(compile('two-bar-mean.osc', workedSource()));
  for (let bar = 0; bar < rows.length - 2; bar += 1) {
    engine.append(flat((rows[bar] as Row).close, timeOf(bar)), { isConfirmed: true }, 5);
  }
  engine.append(flat(106, timeOf(4)), { isConfirmed: false }, 5);
  engine.update(flat(104, timeOf(4)), { isConfirmed: false });
  engine.update(flat(103, timeOf(4)), { isConfirmed: false });

  const column = engine.column(0);
  assert.equal(column.length, 5, 'five bars were supplied, so the column holds five values');
  assert.equal(column[0], null, 'bar 0 is warmup');
  assert.equal(column[4], 104, 'the last execution of bar 4 decides its column');
});
