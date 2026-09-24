/**
 * The site check's rules, attacked before the real tree is read.
 *
 * A rule that can no longer refuse anything reports a clean site, which is the
 * failure this repository has shipped more than once. So every rule is handed a
 * repository that exists only here, small enough to read at a glance, and one
 * defect at a time is put into it: each must be refused with exactly the number
 * of problems written beside it, and the clean repository must pass with none.
 * The probes go through the whole pipeline, the renderer, the link resolution,
 * the build and the rules, so a rule that still works over a broken renderer
 * fails here too.
 *
 * The innocent half matters as much as the other. An external address, a link
 * to repository source the site does not hold, an anchor to a repeated heading
 * and markup written in prose are all accepted, because a rule that refused
 * them would be turned off inside a week.
 *
 * The codes are outside every declared range and the host names are ones no
 * site can have, for the reason the other self tests give theirs: correcting
 * the real catalogue or the real documents cannot disarm a probe.
 */
import { buildSite } from './build.mjs';
import { CODE_INDEX } from './codes.mjs';
import { repositoryOf } from './sources.mjs';
import { verifySite } from './verify.mjs';

/** The clean repository every probe starts from. */
const CLEAN = {
  'docs/README.md':
    '# Guides\n\n- [A page](a.md)\n- [Its first section](./a.md#a-section)\n- [Its second](a.md#a-section-1)\n' +
    '- [An example](../examples/one.oscript)\n- [The catalogue entry](../spec/errors.md#os0001-a-probe)\n',
  'docs/a.md': '# A page\n\n## A section\n\nBack to [the guides](README.md#guides).\n\n## A section\n',
  'spec/README.md': '# Specification\n\n## 1. The shape of errors.json\n\n[The catalogue](errors.md) and [this](#1-the-shape-of-errorsjson).\n',
  'spec/errors.md': '# Catalogue\n\n### OS0001 A probe\n',
  'spec/data.json': '{}\n',
  'examples/one.oscript': 'plot(close)\n',
  'src/index.ts': 'export {};\n',
};

const CATALOGUE = {
  ranges: [{ prefix: 'OS0', kind: 'Probe', means: 'Codes that exist only here.', severity: 'error' }],
  severities: { error: 'Stops.' },
  stages: { check: 'Before any bar.' },
  stageLabels: { check: 'checker' },
  entries: [
    {
      code: 'OS0001',
      title: 'A probe',
      severity: 'error',
      stage: 'check',
      since: 1,
      spec: 'nowhere 1',
      test: null,
      autofix: false,
      message: 'A message.',
      placeholders: {},
      cause: 'A cause.',
      fix: 'A fix.',
      example: { before: 'a = 1', after: 'b = 1' },
      refines: null,
    },
  ],
};

/** A line added to the end of one document. */
const add = (path, text) => (files) => ({ ...files, [path]: `${files[path] ?? ''}\n${text}\n` });

/** Text put into one built page, after the build. */
const inject = (path, from, to) => (site) => {
  const file = site.get(path);
  site.set(path, { ...file, content: file.content.replace(from, to) });
};

/**
 * Each probe: what it is, how the clean repository or the built site is
 * changed (and, as `held`, how many of its links must be printed as a
 * repository path rather than linked), how many problems the rules must
 * report, and what every one of them must say. The wording is matched as well as the count because two rules can
 * refuse one defect: a count alone passes with the right rule switched off and
 * the wrong one standing in for it, which is how this corpus was first beaten.
 */
const HOLDS_NOTHING = /which the site does not hold/;
const NO_ANCHOR = /has no heading or element with that id/;
const FOREIGN = /scheme the site does not write/;
const PROBES = [
  ['the clean repository', {}, 0],
  ['a link to a page that is not there', { files: add('docs/a.md', '[Gone](missing.md)') }, 1, HOLDS_NOTHING],
  ['an anchor no heading of its page carries', { files: add('docs/a.md', '[Gone](README.md#nowhere)') }, 1, NO_ANCHOR],
  ['an anchor on its own page that is not there', { files: add('docs/a.md', '[Gone](#nowhere)') }, 1, NO_ANCHOR],
  ['an anchor into a file that is not a page', { files: add('docs/a.md', '[Data](../spec/data.json#x)') }, 1, /is not a page and has none/],
  ['a repository path that does not exist', { files: add('docs/a.md', '[Gone](../src/missing.ts)') }, 1, HOLDS_NOTHING],
  ['a link that climbs out of the repository', { files: add('docs/a.md', '[Gone](../../outside.md)') }, 1, /climbs out of the site/],
  ['an address that starts at a root', { files: add('docs/a.md', '[Root](/a.html)') }, 1, /starts at a root/],
  ['an address that leaves its scheme off', { files: add('docs/a.md', '[Host](//site.invalid/docs/a.html)') }, 1, /leaves the scheme off/],
  ['an address on the local machine', { files: add('docs/a.md', '[Local](http://localhost:8000/docs/a.html)') }, 1, /machine of whoever reads it/],
  ['an address with a scheme the site does not write', { files: add('docs/a.md', '[File](file:///docs/a.html)') }, 1, FOREIGN],
  ['a script address written as a link', { files: add('docs/a.md', '[Run](javascript:0)') }, 1, FOREIGN],
  ['a page nothing links to', { files: (files) => ({ ...files, 'docs/orphan.md': '# Orphan\n' }) }, 1, /no chain of links/],
  ['two sources written to one path', { files: (files) => add('docs/README.md', '[Raw](a.html)')({ ...files, 'docs/a.html': '<p>raw</p>\n' }) }, 1, /would both be written/],
  ['a table row wider than its header', { files: add('docs/a.md', '| A | B |\n|---|---|\n| a | b | c |') }, 1, /cells and its header has/],
  ['a code the catalogue holds with no page', { codes: ['OS0001', 'OS0002'] }, 1, /is not on the site/],
  ['a code page the index does not list', { site: inject(CODE_INDEX, /<a href="OS0001\.html">/, '<a>') }, 2, /does not link to|no chain of links/],
  ['a script element on a page', { site: inject('docs/a.html', '</main>', '<script>0</script>\n</main>') }, 1, /a script element/],
  ['an inline style', { site: inject('docs/a.html', '<main>', '<main style="color: red">') }, 1, /an inline style/],
  ['an inline event handler', { site: inject('docs/a.html', '<main>', '<main onclick="0">') }, 1, /an inline event handler/],
  ['a base element', { site: inject('docs/a.html', '</head>', '<base target="_self">\n</head>') }, 1, /a base element/],
  ['an id given twice', { site: inject('docs/a.html', '<main>', '<main id="a-page">') }, 1, /gives the id/],
  ['an address to another site', { files: add('docs/a.md', '[Out](https://site.invalid/page.html)') }, 0],
  ['a link to source the site does not hold', { files: add('docs/a.md', '[Source](../src/index.ts)'), held: 1 }, 0],
  ['a directory link to a page that is its README', { files: add('spec/README.md', '[Guides](../docs/)') }, 0],
  ['markup written in prose, which is escaped', { files: add('docs/a.md', '<script>0</script> and `<style>` and a<b') }, 0],
  ['a pipe inside a code span in a table cell', { files: add('docs/a.md', '| A | B |\n|---|---|\n| `a | b` | c |') }, 0],
];

/** One probe, from repository to verdict: how many problems it produced. */
function run(change) {
  const files = change.files ? change.files(CLEAN) : CLEAN;
  const repository = repositoryOf(Object.keys(files), (path) => Buffer.from(files[path], 'utf8'));
  const built = buildSite(repository, CATALOGUE, '0.0.0');
  if (change.site) change.site(built.files);
  const codes = change.codes ?? CATALOGUE.entries.map((entry) => entry.code);
  const verdict = verifySite(built.files, codes);
  return { problems: [...built.problems, ...verdict.problems], built };
}

/**
 * Every probe. Returns the number run when each one got the answer written
 * beside it, and the ones that did not otherwise, with what they reported.
 */
export function probeSite() {
  const broken = [];
  for (const [what, change, wanted, says] of PROBES) {
    const { problems, built } = run(change);
    const held = built.repositoryLinks.length;
    if (held !== (change.held ?? 0)) {
      broken.push(`${what}: ${held} links printed as a repository path, ${change.held ?? 0} expected`);
    }
    if (problems.length === wanted && problems.every((one) => says.test(one))) continue;
    broken.push(`${what}: ${problems.length} reported, ${wanted} expected${problems.length > 0 ? `\n      ${problems.join('\n      ')}` : ''}`);
  }
  return { ran: PROBES.length, broken };
}
