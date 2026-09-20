/**
 * The two hand written copies of the catalogue's facts, read back.
 *
 * `spec/errors.json` is the catalogue a compiler is generated from. Two other
 * documents restate parts of it for a reader: the prose catalogue, which is the
 * page somebody opens when they look a code up, and the feature matrix, which is
 * the page somebody reads when they are deciding what they can rely on. Both are
 * edited by hand, so both can drift, and a check that compares them needs to
 * read them the way a reader does rather than by matching a string.
 *
 * This module does the reading and nothing else: no rule, no message, no exit.
 * The rules live with the check, because the failure text is most of what a
 * check is worth and it belongs beside the rule it explains.
 */
import { CODE } from './pages.mjs';

/**
 * The prose catalogue's entries, each with the deferral paragraph it carries.
 *
 * The prose catalogue is what a person reads when they look a code up, so a
 * deferral that is only in the machine copy is a deferral the reader never sees,
 * and the page goes on teaching a refusal that does not happen.
 */
export function prosePages(text) {
  const lines = text.split('\n');
  const entries = new Map();
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const heading = /^### (OS\d{4})\s+(.+?)\s*$/.exec(lines[i]);
    if (heading) {
      current = { code: heading[1], line: i + 1, deferred: null, deferredLine: 0 };
      entries.set(heading[1], current);
      continue;
    }
    const deferral = /^\*\*Deferred\.\*\*\s+(.+?)\s*$/.exec(lines[i]);
    if (deferral && current !== null) {
      current.deferred = deferral[1];
      current.deferredLine = i + 1;
    }
  }

  return entries;
}

/**
 * The feature matrix's feature rows.
 *
 * A feature row is five cells with a backticked status in the third, which is
 * the matrix's own definition of one. The first two cells are the promise: what
 * the feature is called and what it does. The fourth cites the sections that
 * define it. A code named in the promise is a claim about behaviour; a code
 * cited in the fourth is a reference, which is why only the first two are read
 * here. A row can point at a refusal it deliberately does not raise.
 */
export function matrixRows(text) {
  const lines = text.split('\n');
  const rows = [];
  let section = '';

  for (let i = 0; i < lines.length; i++) {
    const heading = /^#{2,3}\s+(\d+\..*)$/.exec(lines[i]);
    if (heading) section = heading[1];
    if (!lines[i].startsWith('|')) continue;

    const cells = lines[i].split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5) continue;
    const status = /^`([a-z]+)`$/.exec(cells[2]);
    if (status === null) continue;

    rows.push({
      line: i + 1,
      section,
      feature: cells[0],
      status: status[1],
      promised: namedIn(`${cells[0]} ${cells[1]}`),
    });
  }

  return rows;
}

/** Every catalogue code a piece of text names, without duplicates. */
export function namedIn(text) {
  return [...new Set([...text.matchAll(CODE)].map((match) => match[0]))];
}
