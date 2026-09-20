/**
 * Where the source hands a catalogue code to something.
 *
 * A diagnostic in this compiler is built one way: a code, a span and the values
 * that fill the message are handed to a call, and the call reads the catalogue
 * for the words. So a code that is raised somewhere is a code that appears as an
 * argument of a call somewhere, and a code that appears nowhere as an argument
 * has no path that can produce it, whatever the documentation says about it.
 *
 * That is the whole definition this module implements, and it is deliberately
 * narrower than "the code appears in the file".
 *
 * **A mention is not a raise.** A comment explaining why a case raises OS4004
 * instead, a type that lists the codes a refusal record may carry, a `case`
 * label reading a code back and a comparison against one all put the characters
 * in the file and none of them makes the code reachable. The masking module is
 * what removes the comments; the argument test is what removes the rest, and it
 * removes them by their shape rather than by a list of the ones seen so far,
 * which is the only version of this that survives somebody writing a new shape.
 *
 * **A generated file is not evidence.** The compiler's view of the catalogue is
 * generated from the catalogue, so every code in the catalogue appears in it by
 * construction. Counting it would make the question answer itself: 145 codes
 * documented, 145 codes found, nothing raised. Generated files are therefore not
 * read here, and that is not an exemption, it is the difference between evidence
 * and a copy of the claim.
 *
 * **Tests are not evidence either.** A code produced only by a fixture is a code
 * the product cannot produce. The caller chooses the roots, and the check that
 * uses this passes the shipped source.
 */
import { readFileSync } from 'node:fs';
import { MARK, maskCode } from './javascript.mjs';

/** A catalogue code, as the literal would decode to. */
const CODE = /^OS\d{4}$/;

/** Built from the catalogue rather than written, so not evidence about it. */
const GENERATED = '.generated.';

/** The brackets that an argument list is delimited by, as against the others. */
const OPENERS = '([{';
const CLOSERS = ')]}';

/**
 * Every place a file hands a catalogue code to a call.
 *
 * The text is masked first, so comments are gone and every string literal has
 * become a marker in the position the literal stood in. The markers are then
 * paired with the literals in the order the masking produced them, which is the
 * order they appear in the file, and each one is asked two questions: is the
 * innermost bracket still open a round bracket, and is the character in front of
 * it the bracket itself or a comma. Both true is an argument of a call.
 *
 * Nothing here knows the name of any function that raises. A check that listed
 * them would pass a file the day somebody added the eleventh way to report, and
 * it would pass silently, which is the failure this whole area exists to stop.
 */
export function sitesIn(file) {
  const text = readFileSync(file, 'utf8');
  const { code, strings } = maskCode(text);
  const found = [];

  const stack = [];
  let previous = '';
  let literal = 0;
  let i = 0;

  while (i < code.length) {
    if (code.startsWith(MARK, i)) {
      const entry = strings[literal++];
      // A marked literal carries its name after the marker, and the name is
      // letters and an underscore, so the same scan clears both spellings.
      let end = i + MARK.length;
      while (end < code.length && /[A-Za-z_]/.test(code[end])) end++;

      if (entry !== undefined && CODE.test(entry.decoded)) {
        const argument = (previous === '(' || previous === ',') && stack[stack.length - 1] === '(';
        if (argument) {
          found.push({
            file,
            code: entry.decoded,
            line: lineOf(text, entry.index),
            quoted: entry.value,
          });
        }
      }

      previous = '_';
      i = end;
      continue;
    }

    const c = code[i];
    if (OPENERS.includes(c)) stack.push(c);
    else if (CLOSERS.includes(c)) stack.pop();
    if (!/\s/.test(c)) previous = c;
    i++;
  }

  return { sites: found, literals: literal, counted: strings.length };
}

/**
 * The raise sites of every file, grouped by the code they raise.
 *
 * The caller gets the sites rather than a set of codes, because a report that
 * cannot say which file raised a code cannot be acted on, and because the other
 * direction of the check needs the file and the line of a raise the catalogue
 * says should not exist.
 */
export function raiseSites(files) {
  const byCode = new Map();
  let read = 0;
  let literals = 0;

  for (const file of files) {
    if (file.includes(GENERATED)) continue;
    read++;
    const { sites, literals: seen } = sitesIn(file);
    literals += seen;
    for (const site of sites) {
      const held = byCode.get(site.code);
      if (held === undefined) byCode.set(site.code, [site]);
      else held.push(site);
    }
  }

  return { byCode, read, literals };
}

/** The one-based line a character index sits on, for a report somebody reads. */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}
