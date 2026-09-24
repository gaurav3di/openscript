/**
 * The rules the site check holds a built site to, over the site as a browser
 * would read it.
 *
 * Every rule reads the output, never the Markdown: the addresses in `href` and
 * `src` attributes, the ids, the stylesheet's own references. So what is proved
 * is what a reader meets, including the frame every page sits in and the pages
 * no document was the source of. The build's record of where each link was
 * written is used for one thing only, which is saying where to go and fix it.
 *
 * The rules, each returning its problems as sentences:
 *
 *   1. A relative address resolves to a file of the site, and an anchor in it
 *      to an id on the page it names. Same-page anchors are included, and so is
 *      an id given to two elements, because a link to it reaches the first.
 *   2. No address assumes an origin: none starts at a root or names a scheme
 *      and host by leaving the scheme off, none is on the local machine, none
 *      uses a scheme other than the web's two and mail. A `base` element, which
 *      would move every relative address at once, is refused as well.
 *   3. Nothing on a page needs a content security policy loosened: no script,
 *      no inline style, no handler attribute, no frame or embedded object.
 *   4. Every file of the site is reached from the home page by following links.
 *   5. Every code the catalogue holds has a page, and the index links to it.
 */
import { posix } from 'node:path';
import { CODE_INDEX, codePath } from './codes.mjs';
import { EXTERNAL, HOME, SCHEME } from './sources.mjs';

const ATTRIBUTE = /\s(href|src)="([^"]*)"/g;
const ID = /\sid="([^"]*)"/g;
const CSS_URL = /url\(\s*['"]?([^'")]*)|@import\s+['"]([^'"]*)/g;

/** What rule 3 refuses, and why each would need the policy loosened. */
const UNSAFE = [
  [/<script\b/i, 'a script element'],
  [/<style\b/i, 'a style element'],
  [/\sstyle="/i, 'an inline style attribute'],
  [/\son[a-z]+="/i, 'an inline event handler'],
  [/<(?:iframe|object|embed|frame)\b/i, 'a frame or an embedded object'],
];

/** Hosts that are the reader's own machine, so a link to one works only for whoever wrote it. */
const LOCAL = /^(?:localhost|.*\.localhost|127(?:\.\d+){3}|0\.0\.0\.0|\[::1?\])$/i;

const unescape = (text) =>
  text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const isHtml = (path) => path.endsWith('.html');
const textOf = (file) => (typeof file.content === 'string' ? file.content : file.content.toString('utf8'));

/** Every address one file of the site holds, each marked when the browser loads it unasked. */
function addressesIn(path, file) {
  const text = textOf(file);
  const found = [];
  if (isHtml(path)) {
    for (const match of text.matchAll(ATTRIBUTE)) found.push({ address: unescape(match[2]), loads: match[1] === 'src' });
  } else if (path.endsWith('.css')) {
    for (const match of text.matchAll(CSS_URL)) found.push({ address: match[1] ?? match[2], loads: true });
  }
  return found;
}

/** Every address one file of the site holds. */
const referencesIn = (path, file) => addressesIn(path, file).map((one) => one.address);

/** Every id a page holds, with the ones it holds twice. */
function idsIn(file) {
  const ids = new Set();
  const twice = new Set();
  for (const match of textOf(file).matchAll(ID)) {
    const id = unescape(match[1]);
    if (ids.has(id)) twice.add(id);
    ids.add(id);
  }
  return { ids, twice };
}

/**
 * What one address is, from the page it is on.
 *
 * `{ kind: 'external' }`, `{ kind: 'refused', why }`, or `{ kind: 'local',
 * path, fragment }` with the site path it resolves to, which may not exist.
 */
export function classify(page, address) {
  if (address.startsWith('//')) {
    return { kind: 'refused', why: 'leaves the scheme off to name a host, so it assumes the origin the page was served over' };
  }
  if (address.startsWith('/')) {
    return { kind: 'refused', why: 'starts at a root, so it works only where the site is served at the top of its origin' };
  }
  if (SCHEME.test(address)) {
    if (!EXTERNAL.test(address)) return { kind: 'refused', why: 'uses a scheme the site does not write: only http, https and mailto leave it' };
    if (address.startsWith('mailto:')) return { kind: 'external' };
    let host = '';
    try {
      host = new URL(address).hostname;
    } catch {
      return { kind: 'refused', why: 'is not an address a browser can read' };
    }
    if (LOCAL.test(host)) return { kind: 'refused', why: `names ${host}, which is the machine of whoever reads it` };
    return { kind: 'external' };
  }
  const hash = address.indexOf('#');
  const written = (hash === -1 ? address : address.slice(0, hash)).replace(/\?.*$/, '');
  let path = page;
  let fragment = hash === -1 ? '' : address.slice(hash + 1);
  try {
    fragment = decodeURIComponent(fragment);
    if (written !== '') path = posix.normalize(posix.join(posix.dirname(page), decodeURIComponent(written)));
  } catch {
    return { kind: 'refused', why: 'holds an escape a browser cannot decode' };
  }
  if (path === '..' || path.startsWith('../')) return { kind: 'refused', why: 'climbs out of the site, to a file no host serving it holds' };
  return { kind: 'local', path, fragment };
}

/** Where a failing address was written, when the build knows. */
function origin(page, file, address) {
  const link = file.links?.find((one) => one.href === address);
  if (!file.source || link === undefined) return `${page}: "${address}"`;
  return `${file.source}:${link.line}: "${link.url}" (on the site, ${page} links to "${address}")`;
}

/** Rules 1 to 3 over every file. */
function addressProblems(site) {
  const problems = [];
  const ids = new Map();
  const idsOf = (path) => {
    if (!ids.has(path)) ids.set(path, idsIn(site.get(path)));
    return ids.get(path);
  };
  let checked = 0;
  let anchors = 0;
  let external = 0;
  const loaded = [];

  for (const [page, file] of site) {
    if (isHtml(page)) {
      for (const [pattern, what] of UNSAFE) {
        if (pattern.test(textOf(file))) {
          problems.push(`${page}: holds ${what}. The site is served under a policy that allows its own files and nothing else, so it carries no code and no inline styling, only the one stylesheet.`);
        }
      }
      if (/<base\b/i.test(textOf(file))) {
        problems.push(`${page}: holds a base element, which moves every relative address on the page to wherever it names. Nothing may assume an origin.`);
      }
      for (const id of idsOf(page).twice) problems.push(`${page}: gives the id "${id}" to two elements, so a link to it lands on the first and the second cannot be reached.`);
    }

    for (const { address, loads } of addressesIn(page, file)) {
      checked += 1;
      const where = classify(page, address);
      if (where.kind === 'external') {
        external += 1;
        if (loads) loaded.push(page);
        continue;
      }
      if (where.kind === 'refused') {
        problems.push(`${origin(page, file, address)} ${where.why}. Every address on the site is relative to its page.`);
        continue;
      }
      if (!site.has(where.path)) {
        problems.push(`${origin(page, file, address)} resolves to ${where.path}, which the site does not hold. Point it at a page that exists, or at the repository file it meant.`);
        continue;
      }
      if (where.fragment === '') continue;
      anchors += 1;
      if (!isHtml(where.path)) {
        problems.push(`${origin(page, file, address)} names an anchor in ${where.path}, which is not a page and has none.`);
      } else if (!idsOf(where.path).ids.has(where.fragment)) {
        problems.push(`${origin(page, file, address)} names the anchor "${where.fragment}", and ${where.path} has no heading or element with that id. Link to a heading that is there, or correct the one that moved.`);
      }
    }
  }
  return { problems, checked, anchors, external, loaded };
}

/** Rule 4. Every file is reached from the home page. */
function reachProblems(site) {
  const reached = new Set();
  const queue = site.has(HOME) ? [HOME] : [];
  for (const page of queue) {
    if (reached.has(page)) continue;
    reached.add(page);
    for (const address of referencesIn(page, site.get(page))) {
      const where = classify(page, address);
      if (where.kind === 'local' && site.has(where.path) && !reached.has(where.path)) queue.push(where.path);
    }
  }
  const problems = [];
  if (!site.has(HOME)) problems.push(`The site has no ${HOME}, so nothing on it can be reached from where a reader starts.`);
  for (const path of [...site.keys()].sort()) {
    if (reached.has(path)) continue;
    const from = site.get(path).source;
    problems.push(
      `${path}${from ? ` (from ${from})` : ''}: no chain of links from ${HOME} reaches it. A page a reader cannot find is a page they never read: link it from the page that lists its neighbours.`,
    );
  }
  return { problems, reached: reached.size };
}

/** Rule 5. Every code has a page, and the index links to each one. */
function codeProblems(site, codes) {
  const problems = [];
  const index = site.get(CODE_INDEX);
  const listed = new Set();
  if (index === undefined) {
    problems.push(`The site has no ${CODE_INDEX}, so no code page is listed anywhere.`);
  } else {
    for (const address of referencesIn(CODE_INDEX, index)) {
      const where = classify(CODE_INDEX, address);
      if (where.kind === 'local') listed.add(where.path);
    }
  }
  for (const code of codes) {
    const path = codePath(code);
    if (!site.has(path)) {
      problems.push(`${code} is in the catalogue and ${path} is not on the site. Every code has a page, because a code is what a reader searches for.`);
    } else if (index !== undefined && !listed.has(path)) {
      problems.push(`${CODE_INDEX} does not link to ${path}, so ${code} is not listed where its range is.`);
    }
  }
  return problems;
}

/**
 * Every rule over one built site: a map from each path to `{ content, source,
 * links }` as `buildSite` returns it, and the codes the catalogue holds.
 */
export function verifySite(site, codes) {
  const addresses = addressProblems(site);
  const reach = reachProblems(site);
  return {
    problems: [...addresses.problems, ...reach.problems, ...codeProblems(site, codes)],
    checked: addresses.checked,
    anchors: addresses.anchors,
    external: addresses.external,
    loaded: addresses.loaded,
    reached: reach.reached,
  };
}
