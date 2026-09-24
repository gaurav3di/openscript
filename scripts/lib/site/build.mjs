/**
 * The documentation site, built in memory.
 *
 * Returns every file of the site as a map from the path it is served at to its
 * content, and writes nothing. `scripts/site.mjs` writes the map to a directory
 * and `scripts/check-site.mjs` reads it where it lies, so the site the check
 * proves is byte for byte the site the build writes, and the check needs no
 * directory of its own.
 *
 * The build is deterministic: the pages are rendered in path order, nothing
 * reads a clock or the machine, and two runs over one tree write the same bytes.
 *
 * What it reports rather than decides:
 *
 *   - `repository`: every link that names a repository path the site does not
 *     hold, printed as that path. They are not failures, and the check prints
 *     how many there are.
 *   - `dropped`: every line left out of a page because it is nothing but an
 *     HTML tag.
 *   - `problems`: two sources that would be written to one path, and a table
 *     row with more cells than its header. Those are the two failures only the
 *     build can see: by the time the map exists one of the two sources is
 *     gone, and the cells a row lost are not in the page to be found.
 */
import { renderMarkdown } from './blocks.mjs';
import { CATALOGUE, CATALOGUE_PAGE, CODE_INDEX, codeFacts, codeIndexBody, codeMarkdown, codePath } from './codes.mjs';
import { escapeHtml } from './inline.mjs';
import { STYLESHEET_TEXT, SITE_NAME, pageHtml } from './layout.mjs';
import {
  HOME,
  HUBS,
  STYLESHEET,
  isPage,
  kindOf,
  outputOf,
  relativeHref,
  resolveLink,
} from './sources.mjs';

/**
 * The site, from a repository (`repositoryOf` in `sources.mjs`), the parsed
 * error catalogue and the package version printed at the foot of each page.
 *
 * Each file of the map is `{ content, source, links }`: the bytes or the text,
 * the repository file it was written from (null for a generated page), and for
 * a page every link it holds with the address the document wrote and the line
 * it wrote it on, so a link that resolves to nothing can be reported where an
 * editor opens it.
 */
export function buildSite(repository, catalogue, version) {
  const files = new Map();
  const problems = [];
  const repositoryLinks = [];
  const dropped = [];

  const put = (path, file) => {
    const held = files.get(path);
    if (held !== undefined) {
      problems.push(
        `${file.source ?? path} and ${held.source ?? path} would both be written to ${path} on the site, ` +
          'so one of them would be lost without a word. Rename one of the two.',
      );
      return;
    }
    files.set(path, file);
  };

  const queue = [...repository.files].filter(isPage).sort();
  const queued = new Set(queue);
  const carry = (path) => {
    if (queued.has(path)) return;
    queued.add(path);
    queue.push(path);
  };

  /** How one link written in `base` is written on the page served at `at`. */
  const linker = (base, at, links) => (url, image, line) => {
    const where = resolveLink(repository, base, url);
    let how;
    if (where.kind === 'site') {
      carry(where.path);
      how = { href: relativeHref(at, outputOf(where.path), where.fragment) };
    } else if (where.kind === 'repository') {
      repositoryLinks.push({ source: base, line, url, path: where.path });
      how = { path: where.path };
    } else if (where.kind === 'missing') {
      how = { href: relativeHref(at, outputOf(where.path), where.fragment) };
    } else {
      how = { href: url };
    }
    if (how.href !== undefined) links.push({ href: how.href, url, line, image });
    return how;
  };

  for (let i = 0; i < queue.length; i += 1) {
    const source = queue[i];
    const at = outputOf(source);
    const kind = kindOf(source);
    const bytes = repository.read(source);

    if (kind === 'copy') {
      put(at, { content: bytes, source, links: [] });
      continue;
    }

    const text = bytes.toString('utf8');
    const links = [];
    let title = source;
    let body;
    if (kind === 'script') {
      title = source.slice(source.lastIndexOf('/') + 1);
      body =
        `<h1 id="script">${escapeHtml(title)}</h1>\n` +
        `<pre><code class="language-oscript">${escapeHtml(text.replace(/\n$/, ''))}\n</code></pre>`;
    } else {
      const page = renderMarkdown(text, linker(source, at, links));
      title = page.title ?? source;
      body = page.html;
      for (const line of page.dropped) dropped.push({ source, line });
      for (const row of page.ragged) {
        problems.push(
          `${source}:${row.line}: this table row has ${row.cells} cells and its header has ${row.width}, so ` +
            'the last of them are not shown. A pipe that is part of a cell is written \\|.',
        );
      }
    }
    put(at, { content: pageHtml({ path: at, title, body, source, version }), source, links });
  }

  /** A page no one document is the source of, printed as coming from `from`. */
  const generated = (at, title, body, from, links = []) =>
    put(at, { content: pageHtml({ path: at, title, body, source: from, version }), source: null, links });

  for (const entry of catalogue.entries) {
    const at = codePath(entry.code);
    const links = [];
    const page = renderMarkdown(codeMarkdown(catalogue, entry), linker(CATALOGUE_PAGE, at, links));
    generated(at, page.title ?? entry.code, `${page.html}\n${codeFacts(catalogue, entry)}`, CATALOGUE, links);
  }
  generated(CODE_INDEX, 'Error codes', codeIndexBody(catalogue), CATALOGUE);
  generated(HOME, 'Documentation', homeBody(version), null);
  put(STYLESHEET, { content: STYLESHEET_TEXT, source: null, links: [] });

  return { files, problems, repositoryLinks, dropped };
}

/** The home page's body: the three places, and what the site is made from. */
function homeBody(version) {
  const items = HUBS.map(
    (hub) =>
      `<li><a href="${escapeHtml(relativeHref(HOME, outputOf(hub.path)))}">${escapeHtml(hub.label)}</a>. ${escapeHtml(hub.about)}</li>`,
  );
  return (
    `<h1 id="documentation">${SITE_NAME} documentation</h1>\n` +
    `<p>The documentation for package version ${escapeHtml(version)}, generated from the repository: ` +
    'the guides from <code>docs/</code>, the specification from <code>spec/</code>, and a page for every ' +
    `error code from <code>${CATALOGUE}</code>.</p>\n` +
    `<ul>\n${items.join('\n')}\n</ul>`
  );
}
