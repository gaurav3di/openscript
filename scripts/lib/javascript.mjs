/**
 * Reading a JavaScript file as code, with everything that is not code removed.
 *
 * A check that looks for a construct by searching the raw text of a file is a
 * check that reports every comment explaining the rule, every test fixture
 * naming it, and every pattern written to catch it. The usual answer is to
 * exempt those files, and the exemption is the hole: the one file allowed to
 * contain the construct is the file nobody reads again.
 *
 * So this masks instead. Comments become nothing, string literals become a
 * marker, and regular expressions become a marker, leaving text in which a name
 * appears only where the runtime would really read it as a name. Prose about a
 * construct is then not the construct, and no file needs exempting, including
 * the ones doing the checking.
 *
 * Three details are load bearing.
 *
 * **Newlines are preserved exactly**, so a line number taken from the masked
 * text is the line the file really has. Columns are not, which is why a report
 * quotes what it matched.
 *
 * **A marked string keeps its name.** `_STR_` for an ordinary literal, and
 * `_STR_eval_` for one whose whole contents are a watched name, because the
 * oldest way round a check like this is to write the name in a string and reach
 * it through a computed member access.
 *
 * **A template literal is both.** Its text is a string and each substitution is
 * code, so the two are masked differently, which is the difference between
 * catching a construct inside an interpolation and not looking there at all.
 */

/**
 * String contents worth carrying through the mask.
 *
 * Split out of one string on purpose: as a list of literals, this line would be
 * the one place in the repository where a watched name survives masking.
 */
const MARKED = 'eval Function constructor'.split(' ');

/** What a string literal becomes. A watched one becomes this plus its name. */
export const MARK = '_STR_';

/** What a regular expression literal becomes. */
export const REGEX_MARK = '_RE_';

const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[A-Za-z0-9_$]/;

/** After these, a slash opens a regular expression rather than dividing. */
const BEFORE_REGEX = new Set(
  ['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>'],
);
const BEFORE_REGEX_WORDS = new Set(
  'return typeof instanceof in of new delete void case do else yield await'.split(' '),
);

const newlinesIn = (text) => text.replace(/[^\n]/g, '');

const markFor = (value) => (MARKED.includes(value) ? `${MARK}${value}_` : MARK);

/**
 * The text with everything that is not code replaced, and the string literals
 * handed back separately.
 *
 * Newlines are preserved exactly, so a line number taken from the masked text is
 * the line the file really has. Columns are not preserved, which is why a caller
 * quotes what it matched instead.
 */
export function maskCode(text) {
  const out = [];
  const strings = [];
  const templates = [];
  const n = text.length;
  let i = 0;
  let depth = 0;
  let inTemplate = false;
  let chunk = '';
  let chunkAt = 0;
  let prevChar = '';
  let prevWord = '';

  const emitChunk = () => {
    strings.push({ index: chunkAt, value: chunk });
    out.push(markFor(chunk) + newlinesIn(chunk));
    chunk = '';
    prevChar = '_';
    prevWord = '';
  };

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];

    if (inTemplate) {
      if (c === '\\') {
        chunk += c + (next ?? '');
        i += 2;
        continue;
      }
      if (c === '`') {
        emitChunk();
        depth = templates.pop() ?? 0;
        inTemplate = false;
        i++;
        continue;
      }
      if (c === '$' && next === '{') {
        // A substitution is code inside a string. The stack entry made when the
        // template opened stays where it is: it is what says that the next `}`
        // at depth zero is the end of this substitution rather than a block.
        emitChunk();
        out.push('(');
        depth = 0;
        inTemplate = false;
        i += 2;
        prevChar = '(';
        continue;
      }
      chunk += c;
      i++;
      continue;
    }

    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }

    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const body = text.slice(i, end === -1 ? n : end + 2);
      out.push(newlinesIn(body));
      i = end === -1 ? n : end + 2;
      continue;
    }

    if (c === '"' || c === "'") {
      const read = readQuoted(text, i, c);
      chunkAt = i;
      chunk = read.value;
      emitChunk();
      i = read.end;
      continue;
    }

    if (c === '`') {
      templates.push(depth);
      depth = 0;
      inTemplate = true;
      chunkAt = i;
      chunk = '';
      i++;
      continue;
    }

    if (c === '/' && (BEFORE_REGEX.has(prevChar) || BEFORE_REGEX_WORDS.has(prevWord))) {
      const end = readRegex(text, i);
      if (end !== -1) {
        out.push(REGEX_MARK);
        i = end;
        prevChar = '_';
        prevWord = '';
        continue;
      }
    }

    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT.test(text[j])) j++;
      const word = text.slice(i, j);
      out.push(word);
      prevWord = word;
      prevChar = word[word.length - 1];
      i = j;
      continue;
    }

    if (c === '{') depth++;
    if (c === '}') {
      if (depth === 0 && templates.length > 0) {
        // The close of a substitution: back inside the template it interrupted.
        out.push(')');
        inTemplate = true;
        chunkAt = i;
        chunk = '';
        i++;
        continue;
      }
      depth--;
    }

    out.push(c);
    if (!/\s/.test(c)) {
      prevChar = c;
      prevWord = '';
    }
    i++;
  }

  if (inTemplate) emitChunk();
  return { code: out.join(''), strings };
}

/** A quoted string from its opening quote: its contents, and the index after it. */
function readQuoted(text, start, quote) {
  let value = '';
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      value += c + (text[i + 1] ?? '');
      i += 2;
      continue;
    }
    // An unterminated literal stops at the line end rather than swallowing the
    // rest of the file, which is how a masking bug turns into a blind check.
    if (c === quote || c === '\n') return { value, end: c === quote ? i + 1 : i };
    value += c;
    i++;
  }
  return { value, end: i };
}

/**
 * The index after a regular expression literal, or -1 if this slash was not one.
 *
 * A literal cannot span a line, so a slash with no partner before the newline is
 * a division sign and the text after it stays code. Guessing the other way would
 * mask a live line.
 */
function readRegex(text, start) {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '\n') return -1;
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) {
      i++;
      while (i < text.length && /[a-z]/.test(text[i])) i++;
      return i;
    }
    i++;
  }
  return -1;
}

