/**
 * Where a document names a diagnostic code, and what it says about it there.
 *
 * A code is taught on the page a reader happens to open, not on the page the
 * catalogue keeps. So a check that reads the catalogue and the matrix and stops
 * there has read the two documents nobody meets a refusal in: the deferral is
 * declared in one place and the promise is made in twelve others.
 *
 * This module answers one question per mention, and it is a narrow one. **Not
 * "does this page name the code", which every citation check already asks, but
 * "does the sentence the code sits in say that the code is raised today".** A
 * page may name a deferred code as often as it likes. What it may not do is
 * teach it as something that happens, because a reader takes that as a refusal
 * protecting them and writes a script that relies on being stopped.
 *
 * ## The unit is the sentence, and that is the whole design
 *
 * A paragraph is too generous: a deferral in its last line would excuse a
 * promise in its first, and the reader who stops at the first line is exactly
 * the reader this is for. A whole file is worse again. So a mention carries the
 * smallest piece of text that can be true or false on its own:
 *
 * - a table row, which is what most of these mentions are, because a row is read
 *   across and never with its neighbours,
 * - a list item, for the same reason,
 * - a line of a fenced example, because an example's comments teach as hard as
 *   the prose around them and are read more often,
 * - otherwise the sentence, bounded by the full stops either side of the code.
 *
 * ## And the section, where the note belongs and a reader will meet it
 *
 * A table of fifteen codes with a parenthesis after five of them is worse
 * writing than a table with a sentence under it naming those five and saying
 * what does not happen yet, and worse writing is worse documentation. So a
 * mention is also marked when the section it sits in carries a deferral sentence
 * that **names that code**. The naming is what keeps this from being a
 * loophole: a general apology at the top of a page marks nothing, and a note
 * that names the code has said the one thing the reader needed. A section ends
 * at the next heading of any level, which is as far as a reader scrolls without
 * being told they have moved on.
 *
 * ## The vocabulary, which is a grammar and not a list of exemptions
 *
 * A mention is excused by what the sentence says, never by which code it names
 * or which file it is in. There is no way to write this repository's name into
 * the vocabulary and silence one page: the only way past it is to say, in the
 * sentence a reader is reading, that the code is not raised yet. That is the
 * sentence the reader needed either way, so the check asks for the fix rather
 * than for an annotation.
 */

/** A catalogue code, anywhere in a line of prose. */
export const CODE = /OS\d{4}/g;

/**
 * The words that say a code does not happen yet.
 *
 * Deliberately few. Every deferral in the catalogue opens "Nothing raises this
 * yet", so a page repeating the catalogue's own sentence passes, and a page that
 * has to reach for a word not on this list is usually a page hedging rather than
 * saying it.
 */
export const DEFERRAL = /\b(deferred|defers|not raised|nothing raises|not yet|no code path raises)\b/i;

/**
 * How a page opens the note that says a code is not raised yet.
 *
 * A convention, and it buys the other direction of the rule. A note is a copy of
 * a fact the catalogue owns, and a copy goes stale: the day something raises the
 * code, seventy-seven pages would go on telling a reader it does not happen, and
 * nothing would be looking. So a note opens with these words, and every code its
 * first sentence names has to be one the catalogue still defers. A deferral that
 * ends therefore fails the build on the pages that repeat it, which is the same
 * bargain the catalogue and the matrix already make with each other.
 */
export const NOTE = /^\s*\*\*Not raised yet\.\*\*/;

/** Whether a line opens or closes a fenced block. */
function isFence(line) {
  return /^\s*(```|~~~)/.test(line);
}

/** Whether a line is a table row, which is read across and never with its neighbours. */
function isRow(line) {
  return /^\s*\|/.test(line);
}

/** Whether a line starts a list item. */
function isItem(line) {
  return /^\s*([-*+]|\d+[.)])\s/.test(line);
}

/** Whether a line is a heading, which ends the block above it. */
function isHeading(line) {
  return /^\s*#{1,6}\s/.test(line);
}

/**
 * The block of lines a mention is read with: from the item or paragraph it opens
 * to the next item, blank line or heading.
 */
function blockAround(lines, at) {
  let start = at;
  while (start > 0) {
    const line = lines[start];
    if (isItem(line) || isHeading(line)) break;
    const above = lines[start - 1];
    if (above.trim() === '' || isHeading(above) || isRow(above) || isFence(above)) break;
    if (isItem(above)) {
      start -= 1;
      break;
    }
    start -= 1;
  }

  let end = at;
  while (end + 1 < lines.length) {
    const below = lines[end + 1];
    if (below.trim() === '' || isHeading(below) || isItem(below) || isRow(below) || isFence(below)) break;
    end += 1;
  }

  return { start, end };
}

/**
 * The sentence a position sits in, within one block of text.
 *
 * Bounded by a full stop followed by a space, which is where a reader stops. A
 * section number inside a sentence ("stdlib.md 17.2") has no space after its
 * stop and does not divide one.
 */
function sentenceAt(text, index) {
  let start = 0;
  for (let i = index; i > 0; i--) {
    if (/[.!?]/.test(text[i - 1]) && /\s/.test(text[i])) {
      start = i;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length - 1; i++) {
    if (/[.!?]/.test(text[i]) && /\s/.test(text[i + 1])) {
      end = i + 1;
      break;
    }
  }
  return text.slice(start, end).trim();
}

/**
 * Every place a document names a catalogue code, with the text it is read with.
 *
 * The line is one-based, so a report points where an editor opens. `marked` is
 * true where the mention itself says the code is not raised yet, or where the
 * section it sits in says so and names it.
 */
export function mentionsIn(file, text) {
  const lines = text.split('\n');
  const found = [];
  let fenced = false;
  let section = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFence(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && isHeading(line)) section += 1;

    const codes = [...line.matchAll(CODE)];
    if (codes.length === 0) continue;

    if (fenced || isRow(line) || isHeading(line)) {
      const kind = fenced ? 'example line' : isRow(line) ? 'table row' : 'heading';
      for (const code of codes) {
        found.push({ file, line: i + 1, section, code: code[0], kind, unit: line.trim() });
      }
      continue;
    }

    const { start, end } = blockAround(lines, i);
    const block = lines.slice(start, end + 1).join(' ');
    const before = lines.slice(start, i).join(' ');
    const offset = before.length === 0 ? 0 : before.length + 1;
    const kind = isItem(lines[start]) ? 'list item' : 'sentence';

    for (const code of codes) {
      const unit = sentenceAt(block, offset + code.index);
      found.push({ file, line: i + 1, section, code: code[0], kind, unit });
    }
  }

  const noted = new Set();
  for (const mention of found) {
    if (DEFERRAL.test(mention.unit)) noted.add(`${mention.section} ${mention.code}`);
  }
  for (const mention of found) {
    mention.marked = noted.has(`${mention.section} ${mention.code}`);
  }

  return found;
}

/**
 * Every note on a page that says some codes are not raised yet.
 *
 * The codes are the ones the **claim** names, which is the note's first sentence
 * up to its first colon. What follows, whether after that colon or in the
 * sentences under it, says what happens instead and names other codes freely:
 * the broader code raised in its place is usually one of them. Reading further
 * would make a note about OS4008 a claim about OS4004 as well, and OS4004
 * happens.
 */
export function notesIn(text) {
  const lines = text.split('\n');
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    if (!NOTE.test(lines[i])) continue;
    let end = i;
    while (end + 1 < lines.length && lines[end + 1].trim() !== '') end++;
    const paragraph = lines.slice(i, end + 1).join(' ').replace(NOTE, '').trim();
    const claim = sentenceAt(paragraph, 0).split(':')[0];
    found.push({ line: i + 1, codes: [...new Set([...claim.matchAll(CODE)].map((m) => m[0]))] });
  }

  return found;
}
