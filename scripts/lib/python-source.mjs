/**
 * Reading a Python file as code, with everything that is not code removed.
 *
 * The other half of `javascript.mjs`, written for the same reason and against
 * the same failure. A check that searches the raw text of a file reports every
 * comment explaining the rule, every corpus entry naming it and every pattern
 * written to catch it, and the usual answer is to exempt those files. The
 * exemption is the hole: the one file allowed to contain the construct is the
 * file nobody reads again.
 *
 * So this masks instead. Comments become nothing, string literals become a
 * marker, and what is left is text in which a name appears only where the
 * interpreter would really read it as a name.
 *
 * Four details are load bearing, and three of them are Python's alone.
 *
 * **Newlines are preserved exactly**, so a line number taken from the masked
 * text is the line the file really has. Columns are not, which is why a report
 * quotes what it matched.
 *
 * **A marked string keeps its name.** `_STR_` for an ordinary literal and
 * `_STR_eval_` for one whose whole contents are a watched name, because the
 * oldest way round a check like this is to write the name in a string and reach
 * it by a lookup: `getattr(builtins, "eval")` names nothing a pattern over
 * identifiers can see.
 *
 * **A name is normalised the way the interpreter normalises it.** This is the
 * one that has no counterpart on the other side of the tree and it is not
 * exotic: Python normalises every identifier with NFKC before it resolves it,
 * so a name written in mathematical letters, in fullwidth letters, or with a
 * ligature in it, is the same name to the interpreter and four different names
 * to a pattern. The corpus carries three of those spellings. Normalising here
 * takes the whole family away at the place the respelling happens rather than
 * adding a pattern per spelling, which is the lesson the JavaScript rules
 * learned over four rounds.
 *
 * **A formatted string is both.** Its text is a string and each `{...}` in it is
 * code, exactly as a template literal is on the other side, so the two are
 * masked differently. That is the difference between catching a call inside a
 * substitution and not looking there at all.
 *
 * Nothing here parses Python. It tokenises far enough to tell code from text,
 * which is all a rule needs and is the most that can be trusted from a scan.
 */

/**
 * String contents worth carrying through the mask.
 *
 * Split out of one string on purpose: as a list of literals this line would be
 * the one place in the repository where a watched name survives masking.
 */
const MARKED = 'eval exec compile builtins __import__ marshal pickle'.split(' ');

/** What a string literal becomes. A watched one becomes this plus its name. */
export const MARK = '_STR_';

/** The prefix letters a string literal may carry, in any case and any order. */
const PREFIX = /^[A-Za-z]{0,3}$/;

const newlinesIn = (text) => text.replace(/[^\n]/g, '');

const markFor = (value) => (MARKED.includes(value) ? `${MARK}${value}_` : MARK);

/** The single characters an escape stands for, where it is not itself. */
const CONTROL = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07', 0: '\0' };

const HEX_X = /^\\x([0-9a-fA-F]{2})/;
const HEX_U = /^\\u([0-9a-fA-F]{4})/;
const HEX_LONG = /^\\U([0-9a-fA-F]{8})/;

/**
 * A literal's contents as the interpreter would build them.
 *
 * Only the escapes that can hide a letter matter: the three numeric ones, the
 * line continuation, and the rule that a backslash before anything else is
 * usually that character. A watched name spelled "\x65val" is a different
 * string from "eval" to every comparison downstream, and that difference was a
 * hole for a round on the other side of the tree.
 */
export function decodeEscapes(raw) {
  if (!raw.includes('\\')) return raw;
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '\\') {
      out += raw[i];
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) return out;
    if (next === '\n') {
      i += 1;
      continue;
    }
    if (next === 'x' || next === 'u' || next === 'U') {
      const rest = raw.slice(i);
      const hex = HEX_X.exec(rest) ?? HEX_U.exec(rest) ?? HEX_LONG.exec(rest);
      if (hex !== null) {
        out += String.fromCodePoint(Number.parseInt(hex[1], 16));
        i += hex[0].length - 1;
        continue;
      }
    }
    out += Object.hasOwn(CONTROL, next) ? CONTROL[next] : next;
    i += 1;
  }
  return out;
}

const ID_START = /[\p{ID_Start}_]/u;
const ID_CONTINUE = /[\p{ID_Continue}]/u;

/**
 * A name from its first character, as the interpreter reads it.
 *
 * Normalised with NFKC, because that is what the interpreter does to every
 * identifier before it resolves one, and it is the whole reason this function
 * exists rather than a pattern over ASCII letters.
 */
export function readIdentifier(text, start) {
  let raw = '';
  let i = start;
  while (i < text.length) {
    // By code point rather than by code unit. Every respelling that matters
    // here is outside the basic plane, so a loop over code units reads a lone
    // surrogate, decides it is not a letter, and hands the rule a name that
    // stops before the interesting part.
    const point = String.fromCodePoint(text.codePointAt(i));
    const allowed = raw === '' ? ID_START : ID_CONTINUE;
    if (!allowed.test(point)) break;
    raw += point;
    i += point.length;
  }
  return { name: raw === '' ? '' : raw.normalize('NFKC'), end: i };
}

/** Whether a quote at `i` opens a triple quoted literal. */
const triple = (text, i, quote) => text[i + 1] === quote && text[i + 2] === quote;

/**
 * The text with everything that is not code replaced, and the string literals
 * handed back separately.
 *
 * Each literal comes back as `value`, the characters the file holds, and
 * `decoded`, what the interpreter would build from them. A rule about what a
 * string means reads `decoded`; a report quotes `value`.
 */
export function maskPython(text) {
  const out = [];
  const strings = [];
  const n = text.length;
  let i = 0;

  const emit = (index, value, isRaw) => {
    const decoded = isRaw === true ? value : decodeEscapes(value);
    strings.push({ index, value, decoded });
    out.push(markFor(decoded) + newlinesIn(value));
  };

  while (i < n) {
    const c = text[i];

    if (c === '#') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? n : end;
      continue;
    }

    if (ID_START.test(String.fromCodePoint(text.codePointAt(i)))) {
      const { name, end } = readIdentifier(text, i);
      const prefix = PREFIX.test(name) ? name : '';
      const quote = text[end];
      if (prefix !== '' && (quote === '"' || quote === "'")) {
        const kind = prefix.toLowerCase();
        const read = readString(text, end, quote, kind.includes('r'));
        if (kind.includes('f')) {
          out.push(newlinesIn(name));
          i = formatted(text, end, quote, read.end, out, strings, emit, read.raw);
          continue;
        }
        out.push(newlinesIn(name));
        emit(end, read.value, read.raw);
        i = read.end;
        continue;
      }
      out.push(name);
      i = end;
      continue;
    }

    if (c === '"' || c === "'") {
      const read = readString(text, i, c, false);
      emit(i, read.value, false);
      i = read.end;
      continue;
    }

    out.push(c);
    i += 1;
  }

  return { code: out.join(''), strings };
}

/**
 * A formatted string, whose literal parts are text and whose substitutions are
 * code. The substitutions are emitted between brackets so that a rule reading a
 * call's arguments sees the same shape it sees anywhere else.
 */
function formatted(text, start, quote, end, out, strings, emit, isRaw) {
  const long = triple(text, start, quote);
  const open = start + (long ? 3 : 1);
  const close = end - (long ? 3 : 1);
  let piece = '';
  let pieceAt = open;
  let i = open;

  const flush = () => {
    emit(pieceAt, piece, isRaw);
    piece = '';
  };

  while (i < close) {
    const c = text[i];
    if (c === '\\') {
      piece += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if ((c === '{' || c === '}') && text[i + 1] === c) {
      piece += c;
      i += 2;
      continue;
    }
    if (c === '{') {
      flush();
      out.push('(');
      let depth = 1;
      i += 1;
      const from = i;
      while (i < close && depth > 0) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') depth -= 1;
        if (depth > 0) i += 1;
      }
      const inner = maskPython(text.slice(from, i));
      out.push(inner.code);
      for (const one of inner.strings) strings.push({ ...one, index: from + one.index });
      out.push(')');
      i += 1;
      pieceAt = i;
      continue;
    }
    piece += c;
    i += 1;
  }
  flush();
  out.push(newlinesIn(text.slice(close, end)));
  return end;
}

/**
 * A quoted literal from its opening quote: its contents, and the index after it.
 *
 * A backslash escapes the closing quote in a raw literal as well as in an
 * ordinary one, which is why `raw` changes what is decoded later and nothing
 * here. An unterminated single quoted literal stops at the line end rather than
 * swallowing the rest of the file, which is how a masking mistake turns into a
 * check that reads nothing.
 */
function readString(text, start, quote, raw) {
  const long = triple(text, start, quote);
  const open = start + (long ? 3 : 1);
  let value = '';
  let i = open;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      value += text.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c === quote && (!long || triple(text, i, quote))) {
      return { value, end: i + (long ? 3 : 1), raw };
    }
    if (c === '\n' && !long) return { value, end: i, raw };
    value += c;
    i += 1;
  }
  return { value, end: i, raw };
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/** Where an import statement begins, in masked code, at both of its spellings. */
const IMPORT = /^[ \t]*(?:(import)[ \t]+([^\n#]+)|(from)[ \t]+(\.*[\w.]*)[ \t]+import\b)/gm;

/**
 * Every module a file imports, as the name written in the statement.
 *
 * Read from masked code, so a module named in a docstring or in a corpus entry
 * is not an import. A relative import carries its leading dots and is marked as
 * relative rather than resolved: what a check wants to know about
 * `from .machine import step` is that it stays inside the package, and the dots
 * say so without this having to know the package's shape.
 */
export function imports(code) {
  const found = [];
  IMPORT.lastIndex = 0;
  let m;
  while ((m = IMPORT.exec(code)) !== null) {
    const line = lineAt(code, m.index);
    if (m[3] !== undefined) {
      const spec = m[4];
      const relative = spec.startsWith('.');
      found.push({ module: relative ? spec : spec.split('.')[0], relative, line, statement: m[0].trim() });
      continue;
    }
    for (const one of m[2].split(',')) {
      const name = one.trim().split(/\s+as\s+/)[0].trim();
      if (name === '') continue;
      found.push({ module: name.split('.')[0], relative: false, line, statement: m[0].trim() });
    }
  }
  return found;
}
