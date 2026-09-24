/**
 * The inside of a line of Markdown: code spans, links, images and emphasis.
 *
 * Written for what this repository's documents use and no more, which was
 * measured rather than guessed: code spans of one and two backticks, links and
 * images with a relative or a web address, an image inside a link, bold, and
 * italic with an asterisk. Nothing here uses an underscore for emphasis, a
 * reference link, an entity, a hard line break or a bare address outside a
 * fenced block, so none of those is read, and each is printed as the characters
 * it is. A backslash before a punctuation character is honoured, because it
 * costs one line and a document that needs it would otherwise print the slash.
 *
 * Every character a document holds reaches the page escaped. Markup is only
 * ever written by this module, never passed through, so an angle bracket in
 * prose, `array<number>` outside a code span for one, is shown as the text it
 * is. A host that serves these pages under a strict content security policy
 * gets a page with nothing in it the policy has to judge.
 *
 * ## Anchors
 *
 * A heading's id is the scheme the links in this repository were written
 * against: the heading's text as a reader sees it, lower case, with every
 * character that is not a letter, a mark, a digit, a connector, a hyphen or a
 * space dropped, and each space turned into a hyphen. A second heading with the
 * same text gets `-1`, a third `-2`. Code spans keep their text and lose their
 * backticks; an image contributes nothing. The site check resolves every link
 * the documents hold against these ids, so a scheme that drifted from the one
 * the links were written for fails the build rather than a reader.
 */

/** The characters a page escapes, and what each is written as. */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Text as HTML: every character that could open markup, escaped. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (one) => ENTITIES[one]);
}

/** HTML this module wrote, back to the text a reader sees. */
export function textOf(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/** What an anchor drops: anything but a letter, a mark, a digit, a connector, a hyphen or a space. */
const NOT_KEPT = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

/** One heading's text as the id a link names it by, before duplicates are counted. */
export function slugOf(text) {
  return text.toLowerCase().replace(NOT_KEPT, '').replace(/ /g, '-');
}

/** A counter of the ids one page has handed out, so a repeated heading gets a suffix. */
export function slugger() {
  const seen = new Map();
  return (text) => {
    const base = slugOf(text);
    let id = base;
    while (seen.has(id)) {
      const next = seen.get(base) + 1;
      seen.set(base, next);
      id = `${base}-${next}`;
    }
    seen.set(id, 0);
    return id;
  };
}

/** Characters a backslash may escape, as CommonMark lists them. */
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** A marker that stands in for markup already written, while emphasis is found. */
const HOLD = (index) => `\uE000${index}\uE001`;
const HELD = /\uE000(\d+)\uE001/g;

/** The run of one character starting at `at`. */
function runAt(text, at, char) {
  let end = at;
  while (text[end] === char) end += 1;
  return end - at;
}

/** Where a code span that opened with `length` backticks closes, or -1. */
function closingTicks(text, from, length) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] !== '`') continue;
    const run = runAt(text, i, '`');
    if (run === length) return i;
    i += run - 1;
  }
  return -1;
}

/** The index of the `]` that closes the bracket at `open`, skipping code spans. */
function closingBracket(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      i += 1;
    } else if (char === '`') {
      const run = runAt(text, i, '`');
      const close = closingTicks(text, i + run, run);
      i = close === -1 ? i + run - 1 : close + run - 1;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `(destination "title")` after a link's text, or null when it is not one. */
function destinationAt(text, at) {
  const found = /^\(\s*(<[^<>\n]*>|[^\s()<>]+)(?:\s+"([^"]*)")?\s*\)/.exec(text.slice(at));
  if (found === null) return null;
  const raw = found[1].startsWith('<') ? found[1].slice(1, -1) : found[1];
  return { url: raw, title: found[2] ?? null, length: found[0].length };
}

/** The text of a code span, as CommonMark normalises it. */
function spanText(raw) {
  const flat = raw.replace(/\n/g, ' ');
  if (flat.length > 1 && flat.startsWith(' ') && flat.endsWith(' ') && flat.trim() !== '') {
    return flat.slice(1, -1);
  }
  return flat;
}

/** Bold, then italic, over text whose markup is held back. Asterisks only. */
function emphasise(text) {
  return text
    .replace(/\*\*(?=[^\s*])([\s\S]*?[^\s*])\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
}

/**
 * One piece of inline Markdown as HTML.
 *
 * `link(url, image)` is asked about every link and image and answers how to
 * write it: `{ href }` for a link that stays one, with the address rewritten
 * however the caller decides, or `{ path }` for a target that is not on the
 * site and is printed as the repository path it names.
 */
export function renderInline(text, link) {
  const held = [];
  const hold = (html) => {
    held.push(html);
    return HOLD(held.length - 1);
  };
  let out = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (char === '\\' && ESCAPABLE.test(text[i + 1] ?? '')) {
      out += hold(escapeHtml(text[i + 1]));
      i += 2;
      continue;
    }

    if (char === '`') {
      const run = runAt(text, i, '`');
      const close = closingTicks(text, i + run, run);
      if (close === -1) {
        out += escapeHtml('`'.repeat(run));
        i += run;
        continue;
      }
      out += hold(`<code>${escapeHtml(spanText(text.slice(i + run, close)))}</code>`);
      i = close + run;
      continue;
    }

    const image = char === '!' && text[i + 1] === '[';
    if (char === '[' || image) {
      const open = image ? i + 1 : i;
      const close = closingBracket(text, open);
      const target = close === -1 ? null : destinationAt(text, close + 1);
      if (target !== null) {
        const inner = text.slice(open + 1, close);
        out += hold(anchor(inner, target, image, link));
        i = close + 1 + target.length;
        continue;
      }
    }

    out += escapeHtml(char);
    i += 1;
  }
  return emphasise(out).replace(HELD, (_, index) => held[Number(index)]);
}

/** A link or an image, written the way `link` says to write it. */
function anchor(inner, target, image, link) {
  const how = link(target.url, image);
  const title = target.title === null ? '' : ` title="${escapeHtml(target.title)}"`;
  if (image) {
    const alt = escapeHtml(textOf(renderInline(inner, link)));
    if (how.path !== undefined) return `<span class="repository" title="${escapeHtml(how.path)}">${alt}</span>`;
    return `<img src="${escapeHtml(how.href)}" alt="${alt}"${title}>`;
  }
  const body = renderInline(inner, link);
  if (how.path !== undefined) {
    return `<span class="repository" title="In the repository at ${escapeHtml(how.path)}">${body}</span>`;
  }
  return `<a href="${escapeHtml(how.href)}"${title}>${body}</a>`;
}
