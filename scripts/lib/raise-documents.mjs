/**
 * The three rules of `check-raises.mjs` that are about documents.
 *
 * The check it belongs to asks one question in two halves. Does the source
 * raise the code the catalogue documents, which is a question about `src/`; and
 * do the documents that restate the catalogue's facts say the same thing it
 * says, which is a question about three kinds of page. The halves are here and
 * there rather than in one file because they were two things fused, and the
 * file had grown past the length this repository allows.
 *
 * **A rule travels with its failure text.** `lib/catalogue.mjs` reads those
 * pages and states no rule, on the grounds that the message is most of what a
 * check is worth and belongs beside the rule it explains. That still holds: the
 * messages are here, beside their rules. What moved is a half, not a layer.
 *
 * Each rule returns what it found rather than reporting it, so the order the
 * run reports problems in stays the run's to decide.
 */
import { readFileSync } from 'node:fs';

import { mentionsIn, notesIn } from './pages.mjs';

/** The catalogue a compiler is generated from, and the two pages restating it. */
export const CATALOGUE = 'spec/errors.json';
export const PROSE = 'spec/errors.md';
export const MATRIX = 'spec/feature-matrix.md';

/** The status a feature matrix row carries when the catalogue defers its code. */
export const DEFERRED_STATUS = 'deferred';

/**
 * Rule 3. The prose catalogue says the same thing as the machine one.
 *
 * The two files state the same facts and are edited by hand, so the deferral is
 * a fact in two places. That is a duplication this project would normally refuse
 * outright, and it is allowed here only because this check compares them on
 * every run: the copy that drifts fails the build rather than misleading a
 * reader, which is the same bargain the rest of the repository makes.
 */
export function checkProse(entries, pages) {
  const problems = [];
  const fail = (message) => problems.push(message);
  for (const entry of entries) {
    const page = pages.get(entry.code);
    if (page === undefined) {
      fail(
        `${PROSE}: has no entry for ${entry.code}, which ${CATALOGUE} defines. Every code a ` +
          `reader can be shown has a page they can look it up on.`,
      );
      continue;
    }

    const reason = entry.deferred ?? null;
    if (reason === null && page.deferred !== null) {
      fail(
        `${PROSE}:${page.deferredLine}: ${entry.code} is marked deferred here and is not deferred ` +
          `in ${CATALOGUE}. The machine catalogue is what the check reads, so this paragraph ` +
          `warns a reader off a refusal that the build believes happens. Remove it, or defer the ` +
          `entry in ${CATALOGUE} as well.`,
      );
      continue;
    }
    if (reason !== null && page.deferred === null) {
      fail(
        `${PROSE}:${page.line}: ${entry.code} is deferred in ${CATALOGUE} and this page does not ` +
          `say so. This is the page somebody reads when they look the code up, and as it stands ` +
          `it teaches a refusal that nothing raises. Add "**Deferred.** " with the same sentence, ` +
          `under the entry's first line.`,
      );
      continue;
    }
    if (reason !== null && page.deferred !== reason) {
      fail(
        `${PROSE}:${page.deferredLine}: ${entry.code}'s deferral does not match ${CATALOGUE}. ` +
          `Two sentences that disagree are two readers with different expectations. ` +
          `The catalogue says: ${reason}`,
      );
    }
  }

  return problems;
}

/**
 * Rule 4. The feature matrix carries the deferral too.
 *
 * The matrix is the document somebody consults to decide what they can rely on,
 * and its `specified` means a section defines the behaviour, which is true of a
 * refusal nothing raises. True and misleading: 645 of its 680 rows said
 * `specified` the day this was written, so the word had become the matrix's way
 * of saying "this is how it works". A
 * row promising a refusal that no code path can produce has to say so in the
 * status column, where a reader is already looking.
 */
export function checkMatrix(entries, rows) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const deferred = new Set(entries.filter((entry) => entry.deferred != null).map((entry) => entry.code));
  let marked = 0;

  for (const row of rows) {
    const promised = row.promised.filter((code) => deferred.has(code));

    if (promised.length > 0 && row.status !== DEFERRED_STATUS) {
      fail(
        `${MATRIX}:${row.line}: section ${row.section}, "${row.feature}" is \`${row.status}\` and ` +
          `promises ${promised.join(', ')}, which ${CATALOGUE} defers. A reader takes this row as ` +
          `a refusal they can rely on. Mark the row \`${DEFERRED_STATUS}\`.`,
      );
      continue;
    }

    if (promised.length === 0 && row.status === DEFERRED_STATUS) {
      fail(
        `${MATRIX}:${row.line}: section ${row.section}, "${row.feature}" is ` +
          `\`${DEFERRED_STATUS}\` and names no code that ${CATALOGUE} defers. Either the deferral ` +
          `ended, in which case the row moves on, or the row names the wrong code.`,
      );
      continue;
    }

    if (promised.length > 0) marked++;
  }

  return { marked, problems };
}

/**
 * Rule 5. No page teaches a deferred code as something that happens today.
 *
 * Every document in the tree, because a reader meets a refusal on whichever page
 * brought them here and has no way of knowing that the deferral is recorded two
 * files away. The prose catalogue is the one exclusion, and it is not an
 * exemption: it is where the deferral is declared, rule 3 holds it to the
 * catalogue sentence by sentence, and every entry there names its own code in
 * its heading and in its message.
 *
 * A mention is marked by its own sentence or by a sentence in its section that
 * names the code, which `lib/pages.mjs` works out and says why.
 */
export function checkPages(entries, files) {
  const problems = [];
  const fail = (message) => problems.push(message);
  const deferred = new Map(
    entries.filter((entry) => entry.deferred != null).map((entry) => [entry.code, entry.deferred]),
  );
  let taught = 0;
  let notes = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');

    // The other direction, so a note cannot outlive the gap it describes. The
    // day something raises the code, the pages that repeat the deferral are
    // where the reader is still being told it does not happen.
    for (const note of notesIn(text)) {
      notes++;
      for (const code of note.codes) {
        if (deferred.has(code)) continue;
        fail(
          `${file}:${note.line}: this note says ${code} is not raised yet, and ${CATALOGUE} ` +
            `does not defer it. Either something raises it now, in which case the note warns a ` +
            `reader off a refusal that happens and comes out, or the note names the wrong code.`,
        );
      }
    }

    for (const mention of mentionsIn(file, text)) {
      const reason = deferred.get(mention.code);
      if (reason === undefined) continue;
      taught++;
      if (mention.marked) continue;
      fail(
        `${file}:${mention.line}: this ${mention.kind} teaches ${mention.code} as current ` +
          `behaviour, and ${CATALOGUE} defers it: ${reason} A reader who meets the code here ` +
          `takes it as a refusal protecting them and writes a script that relies on being ` +
          `stopped. Say that it is not raised yet, in this ${mention.kind} or in a sentence of ` +
          `this section that names the code.`,
      );
    }
  }

  return { taught, notes, problems };
}
