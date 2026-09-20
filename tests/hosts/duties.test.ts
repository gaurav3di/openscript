/**
 * The omission, made structural.
 *
 * A strategy shipped that placed no orders, on every host built the way
 * `spec/host-interface.md` describes one, and 1184 green tests could not see
 * it. The reason was not that somebody forgot to write a test. It was that
 * every harness in this repository built its host against the engine rather
 * than against the page: the engine offered a position row, the page said a
 * host is never asked for one, and each harness supplied the field because the
 * field was there to supply. Nothing compared the two lists, so the two lists
 * were free to disagree, and the disagreement was invisible from inside.
 *
 * The same shape did it twice. An engine asked a host for two per-bar session
 * facts no section offers, every fixture supplied them, and the commonest
 * intraday study drew nothing at all on a host built from the page.
 *
 * So this file compares the lists, in all three directions a field can travel:
 *
 * 1. **The duties this suite serves are the duties the page names.** A row in
 *    `DUTIES` with no row in section 2's table is a duty somebody invented.
 * 2. **The engine's host interface carries nothing without a duty behind it.**
 *    This is the assertion that was missing. `EngineHost.position` had no duty
 *    in section 2 and no section of its own, and would have failed here on the
 *    day it was added rather than a phase later.
 * 3. **No harness supplies a field the page does not list.** Every host literal
 *    anywhere under `tests/` is read, and a key outside the hand-over fails,
 *    so reaching around the shared builder is as hard as going through it.
 *
 * None of the three is a promise anybody has to remember.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import {
  DUTIES,
  HAND_OVER,
  HOST_BAR_FIELDS,
  PAGE_INSTRUMENT,
  RECORD_FIELDS,
  STATE_FIELDS,
  engineHostFor,
  handOvers,
  pageHost,
  readRecord,
} from './index.js';

const ROOT = new URL('../../../', import.meta.url);

const PAGE = readFileSync(new URL('spec/host-interface.md', ROOT), 'utf8');

/** One section of the page, from its heading to the next heading of its level. */
function sectionOf(heading: string): string {
  const from = PAGE.indexOf(`\n## ${heading}`);
  assert.notEqual(from, -1, `host-interface.md has no section headed ${heading}`);
  const rest = PAGE.slice(from + 1);
  const to = rest.indexOf('\n## ', 1);
  return to === -1 ? rest : rest.slice(0, to);
}

/** One row of the duty table: the duty it names, and whether it is optional. */
interface Row {
  readonly name: string;
  readonly optional: boolean;
}

/**
 * The table of section 2, read out of the page rather than retyped here.
 *
 * Read rather than transcribed on purpose: a transcription is a copy, and a
 * copy is the thing that drifts. A duty added to the page with nothing serving
 * it fails the first assertion below, and a duty served here that the page
 * never names fails it from the other side.
 */
function dutyRows(): readonly Row[] {
  const out: Row[] = [];
  for (const line of sectionOf('2. The six duties').split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    // A body row is `| 1. Bars | ... | ... | No |`: six cells once the empty
    // ends of the split are counted, and a leading ordinal on the first.
    if (cells.length !== 6) continue;
    const named = /^\d+\.\s+(.+)$/.exec(cells[1] ?? '');
    if (named === null) continue;
    out.push({ name: named[1] as string, optional: (cells[4] ?? '') === 'Yes' });
  }
  return out;
}

test('every duty this suite serves is a duty the page names, and every duty is served', () => {
  const rows = dutyRows();
  assert.equal(rows.length, 6, 'section 2 is the six duties, and the table should hold six rows');

  const served = DUTIES.filter((duty) => !NAMED_BESIDE.includes(duty.name));
  assert.deepEqual(
    served.map((duty) => `${duty.name}: ${duty.optional ? 'optional' : 'required'}`),
    rows.map((row) => `${row.name}: ${row.optional ? 'optional' : 'required'}`),
    'the duties this suite serves, against the table of section 2',
  );

  // The two the section names beside the table, as the things a host supplies
  // that are specified elsewhere. They are named so that a reader working
  // through the list is not missing one, and they are here for the same reason.
  const beside = sectionOf('2. The six duties');
  for (const name of NAMED_BESIDE) {
    assert.equal(
      beside.toLowerCase().includes(name.toLowerCase()),
      true,
      `section 2 should name the ${name.toLowerCase()} beside its table`,
    );
  }
});

/** The two things section 2 names in prose rather than in its table. */
const NAMED_BESIDE: readonly string[] = ['Drawing surface', 'Chart clock'];

/**
 * The members of one interface, read out of the source that declares it.
 *
 * Textual because a TypeScript interface is not there at runtime, and reading
 * the declaration is the only way to ask what an engine accepts. The shape read
 * is narrow enough to be safe: a member line, whether it is written as a
 * property or as a method.
 */
function membersOf(file: string, name: string): readonly string[] {
  const text = readFileSync(new URL(file, ROOT), 'utf8');
  const from = text.indexOf(`export interface ${name} {`);
  assert.notEqual(from, -1, `${file} declares no interface ${name}`);
  const open = text.indexOf('{', from);
  let depth = 0;
  let close = open;
  for (; close < text.length; close += 1) {
    const ch = text[close];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = withoutComments(text.slice(open + 1, close));
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const member = /^\s*(?:readonly\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\??\s*:|\()/.exec(line);
    if (member !== null) out.push(member[1] as string);
  }
  return out;
}

test('the engine reads nothing from a host that has no duty behind it', () => {
  const members = membersOf('src/core/engine/host.ts', 'EngineHost');
  assert.deepEqual(
    [...members].sort(),
    [...HAND_OVER].sort(),
    'the fields the engine takes from a host, against the duties host-interface.md gives it. ' +
      'A field here with no duty behind it is a fact the page says a host never supplies, and ' +
      'every harness in this repository will supply it because it is there to supply.',
  );
});

/**
 * The facts a library call reads from the host, which is the other list.
 *
 * The record of 4.1 is where an instrument fact is defined, and `pos.size` is
 * not one of them. It was read from here for a whole phase, which is why every
 * harness had a position row to supply and why a strategy on a host that had
 * none placed nothing.
 */
test('a library call reads no host fact the record does not define', () => {
  const facts = membersOf('src/core/engine/library/binding.ts', 'HostFacts');
  assert.deepEqual(
    facts,
    [
      // The record of 4.1, less the session: a session is a window the engine
      // reads a per-bar fact out of rather than a fact a call returns, 4.3.
      ...RECORD_FIELDS.filter((name) => name !== 'session'),
      // The chart clock, which section 2 names beside its table.
      'now',
      // The two replies about a read of duty 3, `stdlib.md` 15.1. Not facts
      // about the instrument, and the only other thing a call asks a host.
      'requestReady',
      'requestError',
    ],
    'the facts a call reads from a host, against the record host-interface.md 4.1 defines',
  );
});

test('the host hands over what it serves and nothing more', () => {
  const everything = engineHostFor(
    pageHost({ now: 1, serves: [], destination: {} }),
  );
  assert.deepEqual(
    Object.keys(everything).sort(),
    [...HAND_OVER].sort(),
    'a host serving every duty hands over every field and no other',
  );

  // The optional duties, declared at load by their absence rather than
  // discovered during a bar. A host that serves none of them offers nothing for
  // them, which is what makes OS6006 a load refusal.
  const least = engineHostFor(pageHost());
  assert.deepEqual(
    Object.keys(least).sort(),
    DUTIES.filter((duty) => !duty.optional && duty.handOver !== null)
      .map((duty) => duty.handOver as string)
      .sort(),
    'a host serving only the duties it must hands over only those',
  );
});

/** Comments blanked, newlines kept, so a line number and an offset still hold. */
function withoutComments(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        out.push(' ');
        i += 1;
      }
      continue;
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      out.push(' ', ' ');
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        out.push(text[i] === '\n' ? '\n' : ' ');
        i += 1;
      }
      if (i < text.length) {
        out.push(' ', ' ');
        i += 2;
      }
      continue;
    }
    out.push(text[i] as string);
    i += 1;
  }
  return out.join('');
}

/** Every `.ts` file under a directory, so nothing is listed by hand. */
function filesUnder(directory: URL, out: string[] = [], prefix = ''): readonly string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const here = `${prefix}${entry.name}`;
    if (entry.isDirectory()) filesUnder(new URL(`${entry.name}/`, directory), out, `${here}/`);
    else if (entry.name.endsWith('.ts')) out.push(here);
  }
  return out;
}

/**
 * The keys of every host object literal one file writes.
 *
 * A host reaches the engine two ways and only two: as the `host` option of a
 * load, and as a binding annotated `EngineHost`. Both are found here, the
 * braces are matched, and the keys written at the top level of the literal are
 * read out. A literal built by spreading another is not opened further: the one
 * it spreads is itself a literal this rule already reached, or it came from the
 * shared builder, which is the point.
 */
function hostKeysIn(text: string): readonly string[] {
  const code = withoutComments(text);
  const opener = /(?:\bhost\s*:|:\s*EngineHost\s*=)\s*\{/g;
  const keys: string[] = [];
  let found;
  while ((found = opener.exec(code)) !== null) {
    const open = found.index + found[0].length - 1;
    let depth = 0;
    let close = open;
    for (; close < code.length; close += 1) {
      const ch = code[close];
      if (ch === '{' || ch === '(' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ')' || ch === ']') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = code.slice(open + 1, close);
    let nesting = 0;
    for (let i = 0; i < body.length; i += 1) {
      const ch = body[i] as string;
      if (ch === '{' || ch === '(' || ch === '[') nesting += 1;
      else if (ch === '}' || ch === ')' || ch === ']') nesting -= 1;
      if (nesting !== 0) continue;
      const rest = body.slice(i);
      const key = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/.exec(rest);
      if (key === null) continue;
      const before = body.slice(0, i);
      if (/[A-Za-z0-9_$.]$/.test(before.trimEnd())) continue;
      keys.push(key[1] as string);
      i += (key[1] as string).length;
    }
    opener.lastIndex = close;
  }
  return keys;
}

test('no harness supplies a host field the page does not list', () => {
  const tests = new URL('tests/', ROOT);
  // Either list a host field may honestly belong to: what crosses at load, and
  // what a library call reads once it has. Both are bound to the page by the
  // tests above, so a key outside the two is in neither document.
  const allowed = [
    ...HAND_OVER,
    ...membersOf('src/core/engine/library/binding.ts', 'HostFacts'),
  ];
  const offenders: string[] = [];
  let read = 0;
  for (const file of filesUnder(tests)) {
    // The builder's own module is where the hand-over is declared, so the names
    // appear there as data rather than as a host somebody wrote by hand.
    if (file.startsWith('hosts/')) continue;
    read += 1;
    for (const key of hostKeysIn(readFileSync(new URL(file, tests), 'utf8'))) {
      if (!allowed.includes(key)) offenders.push(`${file}: ${key}`);
    }
  }
  assert.equal(read > 0, true, 'this walk found no test files, so it compared nothing');
  assert.deepEqual(
    offenders,
    [],
    'a harness hands the engine a field that no duty of host-interface.md section 2 puts ' +
      'there. That is how a strategy came to read a position the page says a host never ' +
      'supplies: the field existed, so every fixture filled it in, and no host a platform ' +
      'would build ever did. Build the host through tests/hosts/ instead.',
  );
});

/**
 * The shapes, read back off a host rather than taken on trust.
 *
 * A field list in a fixture is a claim about a document. These hold each claim
 * against what the host actually hands over, so a shape that grows a field
 * fails here instead of being handed to an engine that happens to accept it.
 */
test('a bar this host hands over is the seven fields of section 3.1', () => {
  const bar = {
    time: 1,
    open: 2,
    high: 3,
    low: 1.5,
    close: 2.5,
    volume: 10,
    oi: 4,
  };
  const over = handOvers([bar], 'history')[0];
  assert.notEqual(over, undefined, 'a dataset of one bar produced no hand-over');
  assert.deepEqual(
    Object.keys(over?.bar ?? {}).sort(),
    [...HOST_BAR_FIELDS].sort(),
    'the fields of a bar, against the table of section 3.1',
  );
  assert.deepEqual(
    Object.keys(over?.state ?? {}).sort(),
    [...STATE_FIELDS].sort(),
    'the facts a host states about an execution, against section 6.4',
  );
});

test('the record this host states is one section 4.1 allows', () => {
  assert.deepEqual(readRecord(PAGE_INSTRUMENT), [], "4.1's own worked example is not a record");
  assert.deepEqual(
    Object.keys(PAGE_INSTRUMENT).sort(),
    [...RECORD_FIELDS].sort(),
    'the example in 4.1 states all twelve facts, so the record built from it states twelve',
  );

  // The two rules 4.1 states about the record as a whole, each checked by
  // breaking it: the one required fact, and a session with no zone to read it
  // in. Both are load refusals in the engine, and both are faults in the record
  // before they reach one.
  const without = { ...PAGE_INSTRUMENT } as Record<string, unknown>;
  delete without['hasVolume'];
  assert.equal(readRecord(without as never).length, 1, 'a record with no hasVolume passed');
  const unzoned = { ...PAGE_INSTRUMENT } as Record<string, unknown>;
  delete unzoned['timezone'];
  assert.equal(readRecord(unzoned as never).length, 1, 'a session with no timezone passed');
});
