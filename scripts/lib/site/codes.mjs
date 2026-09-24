/**
 * One page per catalogue code, and the index that groups them by range.
 *
 * A code's page is its part 8 section, and the section is written by
 * `sectionFor` in `lib/catalogue-page.mjs`, the same function the catalogue
 * check compares `errors.md` with. So the page a reader lands on from a search
 * for a code and the page they would find by scrolling part 8 are one text,
 * held equal by the build, rather than two renderings of one entry that are
 * free to drift. The section is Markdown and goes through the site's renderer
 * with its links resolved from `spec/errors.md`, which is where it is printed.
 *
 * Under it, what the file says about the entry that part 8 leaves to the rest of
 * the catalogue: its range, what its severity and stage mean, which broader
 * code it refines and which codes refine it, and the same entry in context.
 * Every one of those is read from `errors.json`; none is written here.
 */
import { sectionFor } from '../catalogue-page.mjs';
import { escapeHtml, slugOf } from './inline.mjs';
import { CODES, outputOf, relativeHref } from './sources.mjs';

/** The file every code page is written from. */
export const CATALOGUE = 'spec/errors.json';

/** Where the section of a code is printed, and so what its links are relative to. */
export const CATALOGUE_PAGE = 'spec/errors.md';

/** The path a code's page is served at. */
export const codePath = (code) => `${CODES}/${code}.html`;

/** The path of the index of codes. */
export const CODE_INDEX = `${CODES}/index.html`;

/** The heading a range is given on the index, and so its anchor. */
const rangeHeading = (range) => `${range.prefix}xxx ${range.kind}`;

/** The range an entry falls in, or undefined. */
const rangeOf = (catalogue, entry) => catalogue.ranges.find((range) => entry.code.startsWith(range.prefix));

/** The Markdown of a code's page: its part 8 section, with the heading as the page's own. */
export function codeMarkdown(catalogue, entry) {
  return sectionFor(entry, catalogue.stageLabels ?? {}).replace(/^### /, '# ');
}

/** A link to one code's page, from a page in the same directory. */
const codeLink = (code) => `<a href="${escapeHtml(relativeHref(CODE_INDEX, codePath(code)))}">${escapeHtml(code)}</a>`;

/** What the file says about an entry beyond its section, as a list of facts under it. */
export function codeFacts(catalogue, entry) {
  const facts = [];
  const range = rangeOf(catalogue, entry);
  if (range !== undefined) {
    const heading = rangeHeading(range);
    const index = relativeHref(codePath(entry.code), CODE_INDEX, slugOf(heading));
    facts.push(['Range', `<a href="${escapeHtml(index)}">${escapeHtml(heading)}</a>. ${escapeHtml(range.means)}`]);
  }
  const severity = catalogue.severities?.[entry.severity];
  if (severity !== undefined) facts.push(['Severity', `${escapeHtml(entry.severity)}. ${escapeHtml(severity)}`]);
  const stage = catalogue.stages?.[entry.stage];
  const label = catalogue.stageLabels?.[entry.stage] ?? entry.stage;
  if (stage !== undefined) facts.push(['Stage', `${escapeHtml(label)}. ${escapeHtml(stage)}`]);
  if (entry.refines != null) facts.push(['Refines', codeLink(entry.refines)]);
  const refinedBy = catalogue.entries.filter((one) => one.refines === entry.code).map((one) => one.code);
  if (refinedBy.length > 0) facts.push(['Refined by', refinedBy.map(codeLink).join(', ')]);
  const section = relativeHref(codePath(entry.code), outputOf(CATALOGUE_PAGE), slugOf(`${entry.code} ${entry.title}`));
  facts.push(['In the catalogue', `<a href="${escapeHtml(section)}">${escapeHtml(CATALOGUE_PAGE)}</a>, part 8, among the design it implements`]);
  const rows = facts.map(([term, text]) => `<dt>${term}</dt>\n<dd>${text}</dd>`).join('\n');
  return `<dl class="facts">\n${rows}\n</dl>`;
}

/** The note the index prints beside an entry that nothing raises yet, or that no example reaches. */
function noteOf(entry) {
  if (entry.deferred != null) return 'Deferred';
  if (entry.unexercised != null) return 'Not exercised';
  return '';
}

/**
 * The index: every code, grouped by the ranges the file declares, in its order.
 *
 * A code whose prefix is in no declared range is listed at the end under a
 * heading that says so, rather than left off, because the site check proves
 * that the index reaches every code page and a code left off would be one it
 * could not reach. No entry is like that today.
 */
export function codeIndexBody(catalogue) {
  const groups = catalogue.ranges.map((range) => ({
    heading: rangeHeading(range),
    about: `${range.means} Severity ${range.severity}.`,
    entries: catalogue.entries.filter((entry) => rangeOf(catalogue, entry) === range),
  }));
  const stray = catalogue.entries.filter((entry) => rangeOf(catalogue, entry) === undefined);
  if (stray.length > 0) {
    groups.push({ heading: 'Outside every declared range', about: 'No range in the file claims these.', entries: stray });
  }

  const sections = groups.map((group) => {
    const rows = group.entries.map((entry) => {
      const stage = catalogue.stageLabels?.[entry.stage] ?? entry.stage;
      return (
        `<tr><td>${codeLink(entry.code)}</td><td>${escapeHtml(entry.title)}</td>` +
        `<td>${escapeHtml(entry.severity)}</td><td>${escapeHtml(stage)}</td><td>${noteOf(entry)}</td></tr>`
      );
    });
    return (
      `<h2 id="${escapeHtml(slugOf(group.heading))}">${escapeHtml(group.heading)}</h2>\n` +
      `<p>${escapeHtml(group.about)} ${group.entries.length} ${group.entries.length === 1 ? 'code' : 'codes'}.</p>\n` +
      '<div class="table"><table>\n<thead>\n<tr><th>Code</th><th>Title</th><th>Severity</th><th>Stage</th>' +
      `<th>Note</th></tr>\n</thead>\n<tbody>\n${rows.join('\n')}\n</tbody>\n</table></div>`
    );
  });

  const contents = groups
    .map((group) => `<li><a href="#${escapeHtml(slugOf(group.heading))}">${escapeHtml(group.heading)}</a></li>`)
    .join('\n');
  return (
    '<h1 id="error-codes">Error codes</h1>\n' +
    `<p>Every diagnostic OpenScript can emit, ${catalogue.entries.length} of them, one page each. Each page ` +
    `is written from <code>${CATALOGUE}</code>, the file the compiler's diagnostics are generated ` +
    'from, so the message and the fix on a page are the ones the compiler prints. The same entries, with ' +
    `the design around them, are part 8 of <a href="${escapeHtml(relativeHref(CODE_INDEX, outputOf(CATALOGUE_PAGE)))}">` +
    `${escapeHtml(CATALOGUE_PAGE)}</a>. ` +
    'A code marked Deferred is one nothing raises yet, and its page says what happens instead.</p>\n' +
    `<ul>\n${contents}\n</ul>\n${sections.join('\n')}`
  );
}
