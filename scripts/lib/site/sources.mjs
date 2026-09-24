/**
 * What the documentation site is made of, and where a link in it goes.
 *
 * The site is every Markdown document under `docs/` and `spec/`, rendered to a
 * page at the same relative path, plus what those pages link to. The documents
 * send a reader to the example scripts again and again, to the project's own
 * front page, roadmap and contributing guide, to notes under `issues/` and to
 * the specification's data files, and a site on which all of those were dead
 * would read worse than the repository it came from. So a file a page links to
 * joins the site when it lives under one of the places named in `CARRIED`: a
 * Markdown file as a page, a script as a page showing its source, and anything
 * else copied as it is. A carried page's own links are followed the same way.
 *
 * A link to anything else in the repository, the source under `src/`, a
 * conformance case or the licence, is not a link on the site, because the site
 * does not hold the file and a relative address to it would resolve to nothing
 * wherever the site is served. It is printed as the text it was, marked with
 * the repository path it names, and counted in the site check's summary. The
 * path is checked to exist, so a dead link in a document is still a failure
 * whichever side of this line it falls on.
 *
 * Nothing here writes an address that starts at a root. Every link the site
 * holds is relative to the page it is on, because the application that serves
 * these pages is served from a port, a domain, a subdomain and a container, and
 * a link that assumes one of them is broken on the other three.
 */
import { posix } from 'node:path';

/** Every Markdown file under these is a page. */
export const PAGE_ROOTS = ['docs', 'spec'];

/** A file under these, or one of these files, joins the site when a page links to it. */
export const CARRIED = [
  ...PAGE_ROOTS,
  'examples',
  'issues',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'RELEASING.md',
  'ROADMAP.md',
];

/** What the site writes that no document is the source of. */
export const HOME = 'index.html';
export const STYLESHEET = 'site.css';
export const CODES = 'codes';

/** The three places the home page and every page's header send a reader, and what each holds. */
export const HUBS = [
  {
    label: 'Guides',
    path: 'docs/README.md',
    about: 'Learning the language, writing studies and strategies, running them, and putting the engine or the editor into a platform.',
  },
  {
    label: 'Specification',
    path: 'spec/README.md',
    about: 'The rules exactly, for the moment a guide simplifies. Its first page says which document holds what.',
  },
  {
    label: 'Error codes',
    path: `${CODES}/index.html`,
    about: 'Every diagnostic, one page each, with its message, cause, fix and worked example, grouped by range.',
  },
];

/** An address that names its own scheme, and so is not relative to anything. */
export const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** The schemes an address may leave the site by: the web's two, and mail. */
export const EXTERNAL = /^(https?|mailto):/i;

const under = (path, roots) => roots.some((root) => path === root || path.startsWith(`${root}/`));

/** Whether a repository path is one a page may carry onto the site. */
export const carried = (path) => under(path, CARRIED);

/** Whether a repository path is a page of the site in its own right. */
export const isPage = (path) => path.endsWith('.md') && under(path, PAGE_ROOTS);

/** How a file of the site is written: a page, a script shown as a page, or a copy. */
export function kindOf(path) {
  if (path.endsWith('.md')) return 'page';
  if (path.endsWith('.oscript')) return 'script';
  return 'copy';
}

/** The path a repository file is served at on the site. */
export function outputOf(path) {
  if (path.endsWith('.md')) return `${path.slice(0, -3)}.html`;
  if (path.endsWith('.oscript')) return `${path}.html`;
  return path;
}

/** An address from one file of the site to another, relative to the first. */
export function relativeHref(fromOutput, toOutput, fragment = null) {
  const path = posix.relative(posix.dirname(fromOutput), toOutput) || posix.basename(toOutput);
  return fragment === null ? path : `${path}#${fragment}`;
}

/**
 * The repository as the site reads it: every file's path, and a reader for one.
 *
 * Handed in rather than read here, so the site check can build a whole site out
 * of a repository that exists only in its probes.
 */
export function repositoryOf(paths, read) {
  const files = new Set(paths);
  const directories = new Set(['']);
  for (const path of files) {
    let at = path.lastIndexOf('/');
    while (at > 0) {
      directories.add(path.slice(0, at));
      at = path.lastIndexOf('/', at - 1);
    }
  }
  return { files, directories, read };
}

/**
 * Where one link written in one document goes.
 *
 * Returns one of:
 *   `{ kind: 'site', path, fragment }`, a repository file the site holds or carries,
 *   `{ kind: 'repository', path }`, a path that exists and that the site does not hold,
 *   `{ kind: 'missing', path, fragment }`, a path that is not in the repository at
 *     all. The build still writes the address, to where the file would be on the
 *     site, so the site check finds it where a reader would and reports it.
 *   `{ kind: 'as-written' }`, an address kept as the document wrote it: another
 *     site's, an anchor on the same page, or one the site check refuses (a root,
 *     a scheme it does not write, a climb out of the repository).
 */
export function resolveLink(repository, from, url) {
  if (url.startsWith('#') || SCHEME.test(url) || url.startsWith('/')) return { kind: 'as-written' };
  const hash = url.indexOf('#');
  const written = hash === -1 ? url : url.slice(0, hash);
  const fragment = hash === -1 ? null : url.slice(hash + 1);
  let decoded = written;
  try {
    decoded = decodeURIComponent(written);
  } catch {
    return { kind: 'as-written' };
  }
  const joined = posix.normalize(posix.join(posix.dirname(from), decoded)).replace(/\/+$/, '');
  const path = joined === '.' ? '' : joined;
  if (path === '..' || path.startsWith('../')) return { kind: 'as-written' };

  if (repository.files.has(path)) {
    return carried(path) ? { kind: 'site', path, fragment } : { kind: 'repository', path };
  }
  if (repository.directories.has(path)) {
    const readme = path === '' ? 'README.md' : `${path}/README.md`;
    if (repository.files.has(readme) && carried(readme)) return { kind: 'site', path: readme, fragment };
    return { kind: 'repository', path: path === '' ? './' : `${path}/` };
  }
  return { kind: 'missing', path, fragment };
}
