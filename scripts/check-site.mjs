/**
 * Site check: the documentation site is built, and every address on it leads
 * somewhere, before anybody serves it.
 *
 * `spec/errors.md` has said since its first draft that "the documentation site
 * generates one page per code from the same file". There was no site. There is
 * now, built by `scripts/site.mjs` out of `docs/`, `spec/` and
 * `spec/errors.json`, and a site is the one kind of document whose failures a
 * reader meets as a dead end rather than as a wrong sentence: a link that goes
 * nowhere, an anchor that lands at the top of a long page, a page no link
 * reaches. Each of those is invisible in the Markdown it came from and obvious
 * the first time somebody clicks. So this builds the whole site in memory, the
 * same function and the same bytes `npm run site` writes, and reads it the way
 * a browser would.
 *
 * ## What it refuses
 *
 *   1. A relative address that resolves to no file of the site, and an anchor
 *      that names no id on the page it points at. The failure names the
 *      document, the line and the link as written, because that is where the
 *      fix goes.
 *   2. An address that assumes an origin: one that starts at a root, names a
 *      host without a scheme, names the local machine, uses a scheme other than
 *      http, https and mailto, or a base element that moves them all. CLAUDE.md:
 *      nothing may assume an origin, because the application serving these
 *      pages is served from a port, a domain, a subdomain and a container.
 *   3. Anything on a page that needs a content security policy loosened: a
 *      script, a style element, an inline style, a handler, a frame.
 *   4. A file of the site that no chain of links from the home page reaches.
 *   5. A catalogue code with no page, or with a page the code index does not
 *      list.
 *
 * And two things only the build can see: two sources written to one path, and
 * a table row with more cells than its header, whose last cells no reader is
 * shown. Every rule is attacked by the corpus in `lib/site/probes.mjs` before
 * the tree is read.
 *
 * ## What it does not prove
 *
 * Printed with every pass, and repeated here so it is read before the check is
 * quoted. That an external address works: those are left as written and never
 * fetched. That an absolute address to a public host serving this very site is
 * refused: nothing about such an address says it is this site's. That a link
 * printed as a repository path, because the site does not hold what it names,
 * helps a reader of the site: it is proved to exist in the repository and no
 * more. That an anchor lands on the heading the sentence meant, rather than on
 * one that happens to carry the id. And that a page reads correctly: the
 * renderer covers the Markdown these documents were measured to use, and a
 * construct outside that is printed as its characters, which no rule here sees.
 *
 * Run: node scripts/check-site.mjs
 * Exit code 1 on any problem, or when no document was read.
 */
import { readFileSync } from 'node:fs';
import { filesMatching, nothingFound, projectFiles } from './lib/files.mjs';
import { buildSite } from './lib/site/build.mjs';
import { CATALOGUE } from './lib/site/codes.mjs';
import { probeSite } from './lib/site/probes.mjs';
import { PAGE_ROOTS, isPage, repositoryOf } from './lib/site/sources.mjs';
import { verifySite } from './lib/site/verify.mjs';

function refuse(message) {
  console.error(message);
  process.exit(1);
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// ------------------------------------------------------------- the self test

const probes = probeSite();
if (probes.broken.length > 0) {
  refuse(
    `The site rules no longer do what they say:\n${probes.broken.map((one) => `  ${one}`).join('\n')}\n\n` +
      'A rule that cannot refuse is indistinguishable from a site with nothing wrong on it, and one that ' +
      'refuses an ordinary link is a rule somebody switches off.',
  );
}

// ------------------------------------------------------------------- the run

const documents = filesMatching(/\.md$/, PAGE_ROOTS);
if (documents.length === 0) refuse(nothingFound(`Markdown document under ${PAGE_ROOTS.join(' or ')}/`));

const catalogue = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
const codes = (catalogue.entries ?? []).map((entry) => entry.code);
if (codes.length === 0) refuse(`${CATALOGUE} holds no entries. Run this from the repository root.`);
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

const repository = repositoryOf(projectFiles(), (path) => readFileSync(path));
const built = buildSite(repository, catalogue, version);
const verdict = verifySite(built.files, codes);
const problems = [...built.problems, ...verdict.problems];

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    `\n${plural(problems.length, 'problem')} on the documentation site. A link that goes nowhere reads as a promise ` +
      'right up to the moment somebody follows it. Fix the document it was written in: the same link is the one ' +
      'a reader of the repository follows.',
  );
  process.exit(1);
}

// ----------------------------------------------------------------- the report

const paths = [...built.files.keys()];
const sources = [...built.files.values()].map((file) => file.source).filter((one) => one);
const pages = sources.filter((one) => isPage(one)).length;
const carried = sources.length - pages;
const copies = sources.filter((one) => !one.endsWith('.md') && !one.endsWith('.oscript')).length;
const repositoryPaths = new Set(built.repositoryLinks.map((one) => one.path));
const dropped = built.dropped.map((one) => `${one.source}:${one.line}`);

console.log(
  `Site check passed: ${paths.length} files built in memory, the way \`npm run site\` writes them: ${pages} pages from ` +
    `the ${documents.length} documents under ${PAGE_ROOTS.join('/ and ')}/, ${carried} files they link to carried ` +
    `onto the site (${copies} copied as they are), ${codes.length} code pages, the code index, the home page and ` +
    `the stylesheet. ${verdict.checked} addresses read out of the output: every relative one resolves to a file ` +
    `of the site, ${verdict.anchors} of them to an anchor a heading or element on the target page carries, and ` +
    `${verdict.external} lead to other sites. Every file is reached from the home page, every code has a page the ` +
    'index lists, no address assumes an origin, and no page holds a script, a style element, an inline style or ' +
    `a handler. The rules were attacked with ${probes.ran} probes first.`,
);
console.log(
  `\nWhat this does not prove: that the ${plural(verdict.external, 'address', 'addresses')} to other sites work, ` +
    'which are never fetched; that an absolute address naming a public host that serves this site is refused, ' +
    "because nothing in such an address says it is this site's; that an anchor lands on the heading its sentence " +
    'meant rather than one that carries the id; and that a page reads correctly, since a Markdown construct the ' +
    `renderer does not cover is printed as its characters and no rule here sees it. ${plural(built.repositoryLinks.length, 'link')} ` +
    `name${built.repositoryLinks.length === 1 ? 's' : ''} ${plural(repositoryPaths.size, 'repository path')} the site ` +
    'does not hold, and are printed as that path: each is proved to exist in the repository and no more. ' +
    `${plural(verdict.loaded.length, 'image')} ${verdict.loaded.length === 1 ? 'loads' : 'load'} from another site` +
    `${verdict.loaded.length === 0 ? '' : ` (${[...new Set(verdict.loaded)].join(', ')})`}, which a policy allowing the ` +
    "site's own origin only would block, leaving the alternative text. " +
    `${plural(dropped.length, 'line')} that ${dropped.length === 1 ? 'is' : 'are'} nothing but an HTML tag ` +
    `${dropped.length === 1 ? 'was' : 'were'} left out${dropped.length === 0 ? '' : `: ${dropped.join(', ')}`}. ` +
    'And this builds its own site, so it says nothing about whatever was last written to site/.',
);
