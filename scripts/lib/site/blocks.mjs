/**
 * The blocks of a Markdown document: headings, paragraphs, fenced and indented
 * code, lists, tables, block quotes and rules.
 *
 * What is read is what this repository's documents were measured to use:
 * headings written with hashes, fences of backticks with an optional language
 * word, code indented by four spaces, bulleted and numbered lists nested by
 * indentation with the occasional line that continues an item without being
 * indented, tables, block quotes around a paragraph, task list boxes, and the
 * rule written as three hyphens. A heading underlined rather than hashed is not
 * read, because nothing here writes one, and it would print as a paragraph and
 * a rule.
 *
 * **A line that is nothing but an HTML tag is left out of the page**, and the
 * caller is told where, so the site check can print every one it dropped. The
 * project's front page centres a block with a pair of them. Passing them
 * through would put markup on a page that nothing here wrote for a browser to
 * act on, and printing them would put the tag in front of the reader. Any other
 * angle bracket is text and is escaped.
 *
 * The parse keeps each line's number in its source file, so a link that
 * resolves to nothing is reported where an editor opens it.
 */
import { escapeHtml, renderInline, slugger, textOf } from './inline.mjs';

/** Leading tabs as the four spaces they stand for. */
const untab = (text) => text.replace(/^\t+/, (tabs) => '    '.repeat(tabs.length));
const blank = (text) => text.trim() === '';
const indentOf = (text) => /^ */.exec(text)[0].length;

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:( +)(.*))?$/;
const TAG_LINE = /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?>\s*$/;
const DELIMITER = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;

/** A list item's first line, or null. */
function itemAt(text) {
  const found = ITEM.exec(text);
  if (found === null) return null;
  const [, indent, marker, spaces = '', rest = ''] = found;
  if (spaces === '' && rest !== '') return null;
  const gap = spaces.length === 0 || spaces.length > 4 ? 1 : spaces.length;
  const ordered = /\d/.test(marker);
  return {
    ordered,
    start: ordered ? Number(marker.slice(0, -1)) : 1,
    kind: ordered ? marker.slice(-1) : marker,
    offset: indent.length + marker.length + gap,
    first: spaces.length > 4 ? ' '.repeat(spaces.length - 1) + rest : rest,
  };
}

/** A fence's opening line, or null. A backtick fence has no backtick in its info. */
function fenceAt(text) {
  const found = FENCE.exec(text);
  if (found === null || (found[2][0] === '`' && found[3].includes('`'))) return null;
  return { indent: found[1].length, fence: found[2], info: found[3].trim().split(/\s+/)[0] };
}

/**
 * The cells of a table row, split on every pipe a backslash does not escape and
 * a code span does not hold.
 *
 * The second half is a deliberate difference from the strict reading of a
 * table, which splits a row before it looks for code spans. Rows in the
 * specification and the reference write a union such as `line | box` inside a
 * code span; read strictly, each of them breaks in two at the pipe and loses
 * its last cell, which is not what anybody who wrote one meant.
 */
function cellsOf(text) {
  let row = text.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let cell = '';
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === '\\' && row[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (row[i] === '`') {
      let run = 1;
      while (row[i + run] === '`') run += 1;
      const ticks = '`'.repeat(run);
      let close = row.indexOf(ticks, i + run);
      while (close !== -1 && row[close + run] === '`') close = row.indexOf(ticks, close + run + 1);
      const end = close === -1 ? i + run : close + run;
      cell += row.slice(i, end);
      i = end - 1;
    } else if (row[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += row[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** Whether a line and the one under it open a table. */
function tableAt(lines, i) {
  const next = lines[i + 1];
  if (next === undefined || !lines[i].text.includes('|') || !DELIMITER.test(next.text)) return false;
  return cellsOf(lines[i].text).length === cellsOf(next.text).length;
}

/** Whether a line starts a block that ends the paragraph above it. */
function interrupts(lines, i) {
  const text = lines[i].text;
  if (HEADING.test(text) || RULE.test(text) || QUOTE.test(text) || fenceAt(text) !== null) return true;
  if (TAG_LINE.test(text) || tableAt(lines, i)) return true;
  const item = itemAt(text);
  return item !== null && item.first.trim() !== '' && (!item.ordered || item.start === 1);
}

/**
 * The block tree of some lines, each `{ text, line }`.
 *
 * A container, a list item or a quote, is parsed by calling this again on its
 * own lines with the container's marker taken off, which is how CommonMark
 * describes it and why nesting costs nothing extra.
 */
export function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const { text, line } = lines[i];
    if (blank(text)) {
      i += 1;
      continue;
    }

    const fence = fenceAt(text);
    if (fence !== null) {
      const body = [];
      i += 1;
      while (i < lines.length) {
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[i].text);
        if (close && close[1][0] === fence.fence[0] && close[1].length >= fence.fence.length) break;
        body.push(lines[i].text.slice(Math.min(fence.indent, indentOf(lines[i].text))));
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', info: fence.info, body, line });
      continue;
    }

    const heading = HEADING.exec(text);
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] ?? '', line });
      i += 1;
      continue;
    }

    if (RULE.test(text)) {
      blocks.push({ type: 'rule', line });
      i += 1;
      continue;
    }

    if (TAG_LINE.test(text)) {
      blocks.push({ type: 'tag', text: text.trim(), line });
      i += 1;
      continue;
    }

    if (QUOTE.test(text)) {
      const inner = [];
      while (i < lines.length && !blank(lines[i].text)) {
        const quoted = QUOTE.test(lines[i].text);
        if (!quoted && inner.length > 0 && interrupts(lines, i)) break;
        inner.push({ text: lines[i].text.replace(QUOTE, ''), line: lines[i].line });
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner), line });
      continue;
    }

    const item = itemAt(text);
    if (item !== null) {
      const list = readList(lines, i, item);
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    if (indentOf(untab(text)) >= 4) {
      const body = [];
      while (i < lines.length && (blank(lines[i].text) || indentOf(untab(lines[i].text)) >= 4)) {
        body.push(untab(lines[i].text).slice(4));
        i += 1;
      }
      while (body.length > 0 && blank(body[body.length - 1])) body.pop();
      blocks.push({ type: 'code', info: '', body, line });
      continue;
    }

    if (tableAt(lines, i)) {
      const align = cellsOf(lines[i + 1].text).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null,
      );
      const rows = [];
      i += 2;
      while (i < lines.length && !blank(lines[i].text) && !interrupts(lines, i)) {
        rows.push({ cells: cellsOf(lines[i].text), line: lines[i].line });
        i += 1;
      }
      blocks.push({ type: 'table', align, header: { cells: cellsOf(text), line }, rows, line });
      continue;
    }

    const paragraph = [lines[i]];
    i += 1;
    while (i < lines.length && !blank(lines[i].text) && !interrupts(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', lines: paragraph, line });
  }
  return blocks;
}

/**
 * One list, from its first item to the line that is not part of it.
 *
 * An item holds every following line indented at least as far as its content,
 * the blank lines between them when more of the item follows, and a line that
 * is not indented but carries on the paragraph the item ended with. A list is
 * loose, and its paragraphs keep their own spacing, when a blank line separates
 * two of its items or two blocks inside one.
 */
function readList(lines, start, first) {
  const items = [];
  let loose = false;
  let i = start;
  let item = first;
  while (item !== null) {
    const body = [{ text: item.first, line: lines[i].line }];
    i += 1;
    let fenced = fenceAt(item.first) !== null;
    while (i < lines.length) {
      const text = untab(lines[i].text);
      if (blank(text)) {
        let ahead = i + 1;
        while (ahead < lines.length && blank(lines[ahead].text)) ahead += 1;
        if (ahead < lines.length && indentOf(untab(lines[ahead].text)) >= item.offset) {
          for (; i < ahead; i += 1) body.push({ text: '', line: lines[i].line });
          continue;
        }
        break;
      }
      if (indentOf(text) >= item.offset) {
        body.push({ text: text.slice(item.offset), line: lines[i].line });
      } else if (!fenced && !blank(body[body.length - 1].text) && !interrupts(lines, i) && itemAt(text) === null) {
        body.push({ text: text.trim(), line: lines[i].line });
      } else {
        break;
      }
      if (fenceAt(body[body.length - 1].text) !== null) fenced = !fenced;
      i += 1;
    }
    const children = parseBlocks(body);
    if (children.length > 1 && body.some((one, at) => at > 0 && blank(one.text) && !insideCode(children, one.line))) loose = true;
    items.push({ children, task: taskOf(children) });

    let ahead = i;
    while (ahead < lines.length && blank(lines[ahead].text)) ahead += 1;
    const next = ahead < lines.length ? itemAt(lines[ahead].text) : null;
    if (next === null || next.kind !== first.kind || next.ordered !== first.ordered) break;
    if (ahead > i) loose = true;
    i = ahead;
    item = next;
  }
  return { block: { type: 'list', ordered: first.ordered, start: first.start, loose, items, line: lines[start].line }, next: i };
}

/** Whether a blank line sits inside a code block, where it separates nothing. */
function insideCode(blocks, line) {
  return blocks.some((block) => block.type === 'code' && block.line < line && line <= block.line + block.body.length + 1);
}

/** A task list item's box, taken off its first paragraph, or null. */
function taskOf(children) {
  const first = children[0];
  if (first?.type !== 'paragraph') return null;
  const found = /^\[([ xX])\] /.exec(first.lines[0].text);
  if (found === null) return null;
  first.lines[0] = { ...first.lines[0], text: first.lines[0].text.slice(4) };
  return found[1] !== ' ';
}

/**
 * The block tree as HTML.
 *
 * `page` carries what one page needs across its blocks: `link(url, image,
 * line)` from the caller, `id(text)` handing out heading anchors, `dropped`,
 * where a left out tag line is recorded, and `ragged`, where a table row too
 * wide for its header is.
 */
export function renderBlocks(blocks, page, tight = false) {
  return blocks.map((block) => renderBlock(block, page, tight)).join('\n');
}

function inline(text, page, line) {
  return renderInline(text, (url, image) => page.link(url, image, line));
}

/**
 * A paragraph's lines as one piece of inline text, because a link, a code span
 * or a bold run may start on one line and end on the next. Each link is still
 * reported on the line its address is written on, found by reading forward
 * from the last one, which is the order the renderer meets them in.
 */
function inlineLines(lines, page) {
  const texts = lines.map((one) => one.text.trim());
  let from = 0;
  const lineOf = (url) => {
    for (let at = from; at < texts.length; at += 1) {
      if (!texts[at].includes(`](${url}`) && !texts[at].includes(`](<${url}>`)) continue;
      from = at;
      return lines[at].line;
    }
    return lines[from].line;
  };
  return renderInline(texts.join('\n'), (url, image) => page.link(url, image, lineOf(url)));
}

/** How each kind of block is written. Every kind `parseBlocks` produces has a row. */
const RENDERERS = {
  heading(block, page) {
    const html = inline(block.text, page, block.line);
    const id = page.id(textOf(html));
    page.headings.push({ level: block.level, id, text: textOf(html) });
    return `<h${block.level} id="${escapeHtml(id)}">${html}</h${block.level}>`;
  },
  paragraph(block, page, tight) {
    const html = inlineLines(block.lines, page);
    return tight ? html : `<p>${html}</p>`;
  },
  code(block) {
    const language = block.info === '' ? '' : ` class="language-${escapeHtml(block.info)}"`;
    return `<pre><code${language}>${escapeHtml(block.body.join('\n'))}\n</code></pre>`;
  },
  rule: () => '<hr>',
  tag(block, page) {
    page.dropped.push(block.line);
    return '';
  },
  quote: (block, page) => `<blockquote>\n${renderBlocks(block.children, page)}\n</blockquote>`,
  list(block, page) {
    const tag = block.ordered ? 'ol' : 'ul';
    const start = block.ordered && block.start !== 1 ? ` start="${block.start}"` : '';
    const items = block.items.map((one) => {
      const box = one.task === null ? '' : `<input type="checkbox" disabled${one.task ? ' checked' : ''}> `;
      return `<li>${box}${renderBlocks(one.children, page, !block.loose)}</li>`;
    });
    return `<${tag}${start}>\n${items.join('\n')}\n</${tag}>`;
  },
  table: (block, page) => renderTable(block, page),
};

function renderBlock(block, page, tight) {
  return RENDERERS[block.type](block, page, tight);
}

function renderTable(block, page) {
  const cell = (tag, text, at, line) => {
    const align = block.align[at] === null || block.align[at] === undefined ? '' : ` class="align-${block.align[at]}"`;
    return `<${tag}${align}>${inline(text ?? '', page, line)}</${tag}>`;
  };
  const width = block.header.cells.length;
  for (const one of block.rows) {
    if (one.cells.length > width) page.ragged.push({ line: one.line, cells: one.cells.length, width });
  }
  const row = (tag, one) =>
    `<tr>${Array.from({ length: width }, (_, at) => cell(tag, one.cells[at], at, one.line)).join('')}</tr>`;
  const body = block.rows.length === 0 ? '' : `\n<tbody>\n${block.rows.map((one) => row('td', one)).join('\n')}\n</tbody>`;
  return `<div class="table"><table>\n<thead>\n${row('th', block.header)}\n</thead>${body}\n</table></div>`;
}

/**
 * A whole Markdown document as HTML.
 *
 * `link(url, image, line)` decides where each link goes, as `renderInline`
 * describes. Returns the body, the text of the first top level heading as the
 * page's title, the lines of any tag line left out, and every table row with
 * more cells than its header, whose extra cells no reader is shown.
 */
export function renderMarkdown(text, link) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((one, at) => ({ text: one, line: at + 1 }));
  const page = { link, id: slugger(), headings: [], dropped: [], ragged: [] };
  const html = renderBlocks(parseBlocks(lines), page);
  const title = page.headings.find((heading) => heading.level === 1)?.text ?? null;
  return { html, title, dropped: page.dropped, ragged: page.ragged };
}
