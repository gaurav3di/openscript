/**
 * What a catalogue entry's `fix` sentence hands a reader, held to two rules.
 *
 * The blocks are compiled. The sentence beside them never was, and it is the
 * part a reader acts on: the after block is an illustration, and the fix is the
 * instruction. OS7009's fix told a reader to test `order.working(tag)`, which is
 * a call marked planned, so the instruction was itself a refusal and it sat in
 * five documents being read. OS3003's fix handed a reader
 * `precision = input(2, "precision")` while its own after block had been edited
 * to show something else, because that form did not compile at the time; the
 * block was checked, the sentence was not, and the two disagreed in the
 * reader's favour exactly nowhere.
 *
 * ## The two rules
 *
 * **Rule 3. Every call a fix names is one a script may write today.** The
 * question is put to the compiler rather than to a list here: the name is
 * written as a call inside the same fragment program the blocks are compiled
 * in, and the answer is whatever the checker says. OS2001 or OS2009 means the
 * language does not have the name. OS2020 means it is named for legibility and
 * is not in this release. A namespace fact a fix names without brackets,
 * `pos.equity` or `session.isOpen`, is asked the same question as a read.
 *
 * An entry carrying `deferred` may name a planned call, because its own
 * sentence already says the behaviour is not here yet and a fix for a refusal
 * nothing raises can only be written in the language that will raise it. That
 * expires by itself in both directions: the day the call lands it stops being
 * planned, and the day the code is raised the deferral has to go.
 *
 * **Rule 4. A fix that writes a call out with a reader's own values in it shows
 * that call in its after block.** "Wrap it in `floor()`" names a remedy. `input(2,
 * "precision")` and `alert("text", id = "emaCross")` are a form the reader will
 * paste, and a form written out is a form the compiler should have seen. The
 * after block is where the compiler sees one, so a worked form that appears in
 * no block is a form nothing has checked. That is the OS3003 shape.
 *
 * ## What these do not cover, said plainly
 *
 * - **The fix is not compiled.** It is prose with code in it, and the code in it
 *   is a fragment of a line rather than a line: `{option} = input(2, "{option}")`
 *   compiles on its own and the thing that refused it was the declaration it was
 *   meant to go inside. Rule 4 reaches that case through the block instead.
 * - **Rule 4 asks for one call, not for all of them.** Eleven entries hand a
 *   reader two remedies and demonstrate one: OS1001 lists five substitutions and
 *   its block shows `not` for `!`, OS4001 offers `floor()`, `round()` and
 *   `max(0, n)` and its block shows `floor`. Requiring every named call would
 *   punish those entries for being complete, so the rule asks whether the block
 *   demonstrates any of what the sentence offers.
 * - **An after block that writes no call at all is counted and named**, not
 *   skipped: there is nothing on that side to compare against. One entry is in
 *   that state today, OS5001, whose fix offers a budget line and whose block
 *   fixes the loop condition instead.
 * - **Neither rule can tell whether the advice is right.** A fix naming real,
 *   available calls that would not help is a fix no machine can fault, and this
 *   check does not claim otherwise.
 */

/** A call as a fix writes one: a name, or a namespace member, then a bracket. */
const CALL = /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\(/g;

/** A namespace fact read without brackets, which the closed list below decides. */
const READ = /\b([a-z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b(?!\()/g;

/** The codes that answer "a script may not write this name". */
const ABSENT = new Set(['OS2001', 'OS2009']);

/** The code that answers "named for legibility, and not in this release". */
const PLANNED = 'OS2020';

/** Every name one piece of text writes as a call. */
export function callsIn(text) {
  const found = new Set();
  for (const match of text.matchAll(CALL)) found.add(match[1]);
  return found;
}

/** The argument text of the call whose opening bracket is at `open`. */
function argumentsAt(text, open) {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    if (text[at] === '(') depth += 1;
    else if (text[at] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, at);
    }
  }
  return '';
}

/**
 * The calls a fix writes out with the reader's own values in them.
 *
 * A string literal or a named argument is what tells a worked form from a
 * mention: `pow(a, b)` and `size(values)` name a remedy with stand-in operands,
 * and `input(2, "{option}")` is a line. A placeholder counts as a value,
 * because the reader sees it filled in.
 */
export function workedFormsIn(text) {
  const found = [];
  for (const match of text.matchAll(CALL)) {
    const written = argumentsAt(text, match.index + match[0].length - 1);
    if (written.trim() === '') continue;
    if (/"/.test(written) || /[A-Za-z_][A-Za-z0-9_]*\s*=\s*\S/.test(written)) {
      found.push(`${match[1]}(${written})`);
    }
  }
  return found;
}

/** Every namespace fact a fix reads without brackets, from the closed list. */
export function readsIn(text, namespaces) {
  const found = new Set();
  for (const match of text.matchAll(READ)) {
    if (namespaces.includes(match[1])) found.add(`${match[1]}.${match[2]}`);
  }
  return found;
}

/**
 * Whether a name is one a script may write, and whether it is planned.
 *
 * Answered by compiling it, so this file holds no list of what the library has.
 * `study`, `strategy` and `limits` are declarations rather than library entries
 * and a list would have had to carry them; the compiler simply does not report
 * them as undefined, which is the same answer without the list.
 */
export function askCompiler(name, kind, ask) {
  const block = kind === 'call' ? `${name}()` : `probe = ${name}`;
  const codes = new Set(ask(block).map((one) => one.code));
  return { absent: [...ABSENT].some((code) => codes.has(code)), planned: codes.has(PLANNED) };
}

/**
 * Both rules over one entry. Returns the problems, and what it counted.
 *
 * `ask` compiles a block inside the fragment program and returns its
 * diagnostics; `namespaces` is the compiler's own closed list.
 */
export function fixProblems(entry, { ask, namespaces, cache = new Map() }) {
  const problems = [];
  const fix = entry.fix ?? '';
  const named = [];

  const asked = (name, kind) => {
    const key = `${kind}:${name}`;
    if (!cache.has(key)) cache.set(key, askCompiler(name, kind, ask));
    return cache.get(key);
  };

  for (const [name, kind] of [
    ...[...callsIn(fix)].map((one) => [one, 'call']),
    ...[...readsIn(fix, namespaces)].map((one) => [one, 'read']),
  ]) {
    named.push(name);
    const answer = asked(name, kind);
    if (answer.absent) {
      problems.push(
        `${entry.code}'s fix tells a reader to use ${name}, and the language has no such name. ` +
          'The fix is the instruction a reader acts on, and one naming something that is not ' +
          'there is a refusal handed out as a remedy.',
      );
      continue;
    }
    if (answer.planned && entry.deferred == null) {
      problems.push(
        `${entry.code}'s fix tells a reader to use ${name}, which is marked planned: a script ` +
          'that follows the fix is refused with OS2020. Write the fix in the language this ' +
          'release has, or say in a "deferred" sentence that the code itself is not raised yet.',
      );
    }
  }

  const worked = workedFormsIn(fix);
  const after = callsIn(entry.example?.after ?? '');
  let uncompared = false;
  if (worked.length > 0) {
    if (after.size === 0) {
      uncompared = true;
    } else if (!named.some((name) => after.has(name))) {
      problems.push(
        `${entry.code}'s fix writes out ${worked.join(', ')} and its after block names none of ` +
          `${named.join(', ')}: it calls ${[...after].join(', ')}. The block is the only part of ` +
          'an entry a compiler sees, so a form the sentence hands a reader and the block does ' +
          'not show is a form nothing has checked. Show it in the block, or word the fix as the ' +
          'remedy it names rather than as a line to paste.',
      );
    }
  }

  return { problems, worked: worked.length, named: named.length, uncompared };
}

/**
 * Both rules, given a case each must refuse and a case each must accept.
 *
 * Written here rather than taken from the catalogue, so that correcting the
 * catalogue cannot disarm the check. Returns the ways the rules have stopped
 * doing what they say, which is empty in a healthy tree.
 */
export function fixSelfTest(options) {
  const broken = [];
  const ran = (entry) => fixProblems(entry, options).problems.length;

  const cases = [
    ['a fix naming a call the language does not have', { code: 'OS0001', fix: 'Use nosuchCall().', example: { after: '' } }, true],
    ['a fix naming a planned call', { code: 'OS0002', fix: 'Guard it with order.working(tag).', example: { after: '' } }, true],
    ['a fix naming a planned call on a deferred entry', { code: 'OS0003', fix: 'Guard it with order.working(tag).', deferred: 'Nothing raises this yet, and the sentence says so at length.', example: { after: '' } }, false],
    ['a fix naming ordinary calls', { code: 'OS0004', fix: 'Wrap it in floor() or round().', example: { after: 'x = floor(1.5)' } }, false],
    ['a worked form the block does not show', { code: 'OS0005', fix: 'Make it tunable: len = input(14, "Length").', example: { after: 'study("X", precision = 2)' } }, true],
    ['a worked form the block does show', { code: 'OS0006', fix: 'Make it tunable: len = input(14, "Length").', example: { after: 'len = input(14, "Length")' } }, false],
  ];

  for (const [what, entry, mustRefuse] of cases) {
    const refused = ran(entry) > 0;
    if (refused === mustRefuse) continue;
    broken.push(mustRefuse ? `the fix rules accepted ${what}` : `the fix rules refused ${what}`);
  }
  return broken;
}
