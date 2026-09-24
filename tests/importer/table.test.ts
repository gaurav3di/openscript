import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { importScript, isLibraryName, libraryEntries } from '../../src/core/index.js';
import { COLOURS, MAPPINGS } from '../../src/core/importer/index.js';

/**
 * The importer's table, held to the page that teaches it and to the library it
 * maps into.
 *
 * The page prints every row, which makes it a second copy of the table, and a
 * copy nothing compares is the kind this repository has been bitten by every
 * time. So the page is the input here: its rows are read out of it and
 * compared with the importer's, both ways, and so is its worked example.
 */

const PAGE = new URL('../../../docs/writing/importing-a-script.md', import.meta.url);
const page = readFileSync(PAGE, 'utf8');

interface Row {
  readonly source: string;
  readonly target: string;
  readonly difference: string;
}

function pageRows(): readonly Row[] {
  const start = page.indexOf('| Source | OpenScript | Difference |');
  assert.notEqual(start, -1, 'the page prints no mapping table');
  const rows: Row[] = [];
  for (const line of page.slice(start).split('\n').slice(2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    rows.push({ source: cells[0] ?? '', target: cells[1] ?? '', difference: cells[2] ?? '' });
  }
  return rows;
}

function tableRows(): readonly Row[] {
  return MAPPINGS.map((row) => {
    const call = row.params.length > 0 || row.special !== undefined;
    return {
      source: `\`${row.source}${call ? '()' : ''}\``,
      target: row.target.includes(' ') ? row.target : `\`${row.target}\``,
      difference: row.difference,
    };
  });
}

// A row added to the importer and not the page, or edited on one side, would
// teach a reader a mapping the importer does not make.
test('the page prints the importer table, row for row', () => {
  assert.deepEqual(pageRows(), tableRows());
});

// A target misspelled, or a function OpenScript does not have, would be a
// translation that never compiles: every statement using it would come back as
// OS9012 and nothing would say the table was wrong.
test('every target the table names is a name OpenScript has', () => {
  const notCalls = new Set(['none', 'study', 'strategy', 'float', 'buy or sell']);
  for (const row of MAPPINGS) {
    if (notCalls.has(row.target)) continue;
    assert.ok(isLibraryName(row.target), `${row.source} maps to ${row.target}, which OpenScript does not have`);
  }
  for (const colour of COLOURS) assert.ok(isLibraryName(colour), `${colour} is not an OpenScript colour`);
});

// The stateful flag decides where evaluation order matters. One set wrong
// either way either moves a line it need not or leaves an average advancing on
// some bars only, so it is held to the library's own statement of the fact.
test('a row is marked stateful exactly where its OpenScript target keeps state', () => {
  for (const row of MAPPINGS) {
    if (row.params.length === 0 || !isLibraryName(row.target)) continue;
    const stateful = libraryEntries(row.target).some((entry) => entry.stateful);
    assert.equal(row.stateful, stateful, `${row.source}: the table and the library disagree about state`);
  }
});

// A row marked warmup is one whose first bars follow OpenScript's own recipe,
// which only a function that reads a window has.
test('every warmup row maps to a function that reads a window', () => {
  for (const row of MAPPINGS.filter((one) => one.difference === 'warmup')) {
    assert.ok(row.stateful, `${row.source} is marked warmup and keeps no state`);
  }
});

function blockAfter(marker: string): string {
  const at = page.indexOf(marker);
  assert.notEqual(at, -1, `the page has no "${marker}"`);
  const open = page.indexOf('```', at);
  const start = page.indexOf('\n', open) + 1;
  return page.slice(start, page.indexOf('```', start));
}

// The worked example is what a reader compares their own result with, so it is
// run rather than trusted.
test('the page worked example is what the importer produces', () => {
  const result = importScript(blockAfter('A source script:'));
  assert.equal(result.source, blockAfter('What comes back:'));
  assert.deepEqual(
    result.findings.map((one) => one.code),
    ['OS9007', 'OS9007', 'OS9007', 'OS9003'],
  );
});
