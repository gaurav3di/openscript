/**
 * The promise in `host-interface.md` 8.1, held to an edit.
 *
 * "A map from an input's `key` to a value ... it survives every edit that does
 * not rename it." Everything below is that one sentence and nothing else. A
 * user stores a value against a row of the settings dialog; then the author of
 * the study edits the file, renaming nothing; then the user opens the chart
 * again and the value has to be on the row they put it on.
 *
 * **These tests are written against the promise, not against the scheme that
 * keeps it.** Nothing here spells a key. A map is built the way a host builds
 * one, by asking the compiled program for each row's key and storing a value
 * under it, and it is read back the way a user reads one, by running the study
 * and looking at what each row's own plot draws. A test that asserted the keys
 * were no longer `input0` would pass against any scheme at all, including one
 * that keeps every value on the wrong row after a delete.
 *
 * The rows below are `input()` calls written where a value belongs, with no
 * name in front of them, because that is the shape that had no stable key:
 * every one was keyed by its position, so inserting a tunable above another
 * moved a stored value onto a different row silently, and 8.3 had nothing to
 * refuse because both rows were numbers. `issues/0014` is why that shape is the
 * only way to tune a declaration option, so it is not a corner.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { CompiledProgram } from '../../src/core/emit/index.js';
import type { HostBar } from '../../src/core/engine/index.js';
import { compile, engineFor, flat, timeOf } from './support.js';

const HEADER = 'version 1\nstudy("Tuning")\n';

/** Four closes, because nothing here depends on the bars at all. */
function someBars(): readonly HostBar[] {
  const out: HostBar[] = [];
  for (let i = 0; i < 4; i += 1) out.push(flat(10 + i, timeOf(i)));
  return out;
}

function programOf(text: string): CompiledProgram {
  const compiled = compile('settings.oscript', text);
  assert.deepEqual(
    compiled.diagnostics.map((one) => `${one.code} at ${one.span.line}`),
    [],
    'the script did not compile',
  );
  return compiled.program;
}

/**
 * The map a host would have stored, one value per row, keyed as the host keys.
 *
 * `label` is the row as a user sees it in the dialog and `key` is what the host
 * files the value under (2.6), so this is exactly the two columns of a settings
 * panel. Building the map through the program rather than from a literal is
 * what makes the test about the promise: it stores whatever the compiler says
 * to store, and the assertions are about where the value comes out.
 */
function stored(text: string, values: Readonly<Record<string, number>>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const row of programOf(text).inputs) {
    const value = values[row.label];
    assert.ok(value !== undefined, `the fixture has no value for the row labelled ${row.label}`);
    map[row.key] = value;
  }
  return map;
}

/**
 * What each row is worth when this file runs against that stored map.
 *
 * Read back from a plot column rather than from `inputs[]`, so a key that
 * resolved to the wrong row shows up as the wrong number on the chart, which is
 * what a user would see. Each row's plot is titled with the row's own label.
 */
function drawn(text: string, settings: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const compiled = compile('settings.oscript', text);
  const run = engineFor(compiled, { settings }).run(someBars());
  assert.equal(run.diagnostic, undefined, 'the run did not finish');
  const last = run.bars[run.bars.length - 1];
  const out: Record<string, unknown> = {};
  for (const plot of compiled.program.outputs.plots) {
    // A title may itself be a reference to an input (2.8); none here is, and a
    // fixture that quietly became one would compare against a key rather than a
    // row label.
    assert.equal(typeof plot.title, 'string', 'a plot in this fixture titled itself from a setting');
    out[String(plot.title)] = last?.columns[plot.channel];
  }
  return out;
}

/** A file of rows written in place, each plotted under its own title. */
function inPlace(rows: readonly (readonly [string, number])[]): string {
  return HEADER + rows.map(([title, value]) => `plot(input(${value}, "${title}"), "${title}")\n`).join('');
}

/**
 * The same rows bound to names, which is the shape that always had a key.
 *
 * The name is derived from the row's own title rather than from its position,
 * because a name that counted the rows would be renamed by the insert and the
 * control would then fail for the reason 8.1 excepts rather than hold for the
 * reason it promises.
 */
function named(rows: readonly (readonly [string, number])[]): string {
  const lines = rows.map(([title, value]) => `row${title} = input(${value}, "${title}")\n`);
  const plots = rows.map(([title]) => `plot(row${title}, "${title}")\n`);
  return HEADER + lines.join('') + plots.join('');
}

const THREE: readonly (readonly [string, number])[] = [
  ['Alpha', 1],
  ['Beta', 2],
  ['Gamma', 3],
];

/** What the user typed into each row, distinct from every default above. */
const TYPED = { Alpha: 11, Beta: 22, Gamma: 33, Delta: 44 };

/**
 * The edit the promise is about, and the one that used to lose a value.
 *
 * A tunable is inserted in the middle and nothing is renamed. Against a
 * positional key this passes for Alpha, puts Beta's stored 22 on the new Delta
 * row, and leaves Gamma reading its default, all without a diagnostic, because
 * 8.3 validates a number against a number and both are numbers.
 */
test('inserting a tunable in the middle leaves every stored value on its own row', () => {
  const before = inPlace(THREE);
  const map = stored(before, TYPED);

  const after = inPlace([THREE[0]!, THREE[1]!, ['Delta', 4], THREE[2]!]);
  assert.deepEqual(drawn(after, map), {
    Alpha: 11,
    Beta: 22,
    Gamma: 33,
    // The new row was never stored against, so it takes its declared default.
    Delta: 4,
  });
});

/** A row deleted, which moves every row below it under a positional key. */
test('deleting a tunable leaves every remaining value on its own row', () => {
  const before = inPlace(THREE);
  const map = stored(before, TYPED);

  assert.deepEqual(drawn(inPlace([THREE[0]!, THREE[2]!]), map), { Alpha: 11, Gamma: 33 });
  assert.deepEqual(drawn(inPlace([THREE[1]!, THREE[2]!]), map), { Beta: 22, Gamma: 33 });
});

/** The rows put in another order, which renames nothing and moves everything. */
test('reordering the tunables leaves every stored value on its own row', () => {
  const before = inPlace(THREE);
  const map = stored(before, TYPED);

  const after = inPlace([THREE[2]!, THREE[0]!, THREE[1]!]);
  assert.deepEqual(drawn(after, map), { Alpha: 11, Beta: 22, Gamma: 33 });
});

/**
 * The one edit 8.1 allows to lose a value, asserted as a loss.
 *
 * The title is what the user sees and what the row is stored under, so changing
 * it is the rename the sentence excepts. The row falls back to its declared
 * default and the two rows that were not renamed keep their values, which is
 * the half of the promise a scheme that never loses anything would fail: a key
 * that survived a rename would be a key that is not the row's identity.
 *
 * The stored value is not deleted. 8.3: "A stored key with no matching input in
 * the program is not an error", so renaming the row back restores it, which the
 * second half of this test is.
 */
test('renaming a row loses that row value and no other, and renaming it back restores it', () => {
  const before = inPlace(THREE);
  const map = stored(before, TYPED);

  const renamed = inPlace([THREE[0]!, ['Width', 2], THREE[2]!]);
  assert.deepEqual(drawn(renamed, map), { Alpha: 11, Width: 2, Gamma: 33 });

  assert.deepEqual(drawn(before, map), { Alpha: 11, Beta: 22, Gamma: 33 });
});

/**
 * The same four edits over rows bound to names, which is the control.
 *
 * These have always kept their values, because 8.1's key has always been the
 * name for them. If the scheme for a row written in place ever stops matching
 * this, one of the two shapes is keeping a promise the other is not.
 */
test('the same edits over named inputs keep every value, as they always did', () => {
  const before = named(THREE);
  const map = stored(before, TYPED);

  assert.deepEqual(drawn(named([THREE[0]!, THREE[1]!, ['Delta', 4], THREE[2]!]), map), {
    Alpha: 11,
    Beta: 22,
    Gamma: 33,
    Delta: 4,
  });
  assert.deepEqual(drawn(named([THREE[0]!, THREE[2]!]), map), { Alpha: 11, Gamma: 33 });
  assert.deepEqual(drawn(named([THREE[2]!, THREE[0]!, THREE[1]!]), map), {
    Alpha: 11,
    Beta: 22,
    Gamma: 33,
  });
});

/**
 * A row written in place and the same row bound to a name, keyed the same way.
 *
 * Adding or removing `var`, or lifting an input out into a name of its own, are
 * edits to where the value lives rather than to what the row is called. The
 * first two do not move a stored value; the third does, because the name is the
 * key once there is one, and that is a rename of the row in 8.1's sense even
 * though the dialog looks the same. This test exists to state which of the two
 * each edit is rather than to leave a reader to find out.
 */
test('adding var does not move a stored value, and binding a name does', () => {
  const plain = `${HEADER}len = input(14, "Length")\nplot(len, "Length")\n`;
  const persistent = `${HEADER}var len = input(14, "Length")\nplot(len, "Length")\n`;
  const inline = `${HEADER}plot(input(14, "Length"), "Length")\n`;

  const map = stored(plain, { Length: 20 });
  assert.deepEqual(drawn(persistent, map), { Length: 20 });

  // The inline row is keyed by its title, so it takes the default rather than
  // the value stored against the name.
  assert.deepEqual(drawn(inline, map), { Length: 14 });
  assert.deepEqual(drawn(inline, stored(inline, { Length: 20 })), { Length: 20 });
});
