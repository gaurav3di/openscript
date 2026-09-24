/**
 * The frame every page of the documentation site sits in, and its stylesheet.
 *
 * One stylesheet, served as a file beside the pages rather than written into
 * each one, and nothing else: no script, no inline style, no font or image from
 * anywhere. A host that serves these pages under a content security policy
 * allowing only its own origin serves them unchanged, and the site check fails
 * the build on a page that would need the policy loosened.
 *
 * Every address in the frame is relative to the page it is on, worked out here
 * from the page's own path, so the same files work served from a port, a
 * domain, a subdirectory or a folder opened straight from disk.
 */
import { escapeHtml } from './inline.mjs';
import { HOME, HUBS, STYLESHEET, outputOf, relativeHref } from './sources.mjs';

/** The name a page's title and header give the site. */
export const SITE_NAME = 'OpenScript';

/**
 * One whole page.
 *
 * `path` is where it is served on the site, `title` is plain text, `body` is
 * HTML already escaped, and `source` is the repository file it was written
 * from, printed at the foot so a reader who finds a mistake knows what to edit.
 */
export function pageHtml({ path, title, body, source, version }) {
  const to = (target) => escapeHtml(relativeHref(path, target));
  const hubs = HUBS.map((hub) => `<a href="${to(outputOf(hub.path))}">${escapeHtml(hub.label)}</a>`).join('\n');
  const from = source === null ? 'the documentation build' : `<code>${escapeHtml(source)}</code>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} | ${SITE_NAME}</title>
<link rel="stylesheet" href="${to(STYLESHEET)}">
</head>
<body>
<header>
<nav>
<a class="home" href="${to(HOME)}">${SITE_NAME}</a>
${hubs}
</nav>
</header>
<main>
${body}
</main>
<footer>
<p>${SITE_NAME} ${escapeHtml(version)}. Generated from ${from}.</p>
</footer>
</body>
</html>
`;
}

/**
 * The stylesheet, in a light scheme and a dark one chosen by the reader's own
 * setting. Generic font families only, so a page names no typeface and looks
 * like the reader's system.
 */
export const STYLESHEET_TEXT = `:root {
  color-scheme: light dark;
  --text: #1d2125;
  --muted: #5b636b;
  --page: #ffffff;
  --panel: #f4f5f7;
  --line: #d7dbe0;
  --link: #0b5cad;
  --visited: #6a3fa0;
  --mark: #fff4c2;
}

@media (prefers-color-scheme: dark) {
  :root {
    --text: #e3e6e9;
    --muted: #a3abb3;
    --page: #15181b;
    --panel: #1f2328;
    --line: #353b42;
    --link: #7ab8ff;
    --visited: #c3a4ef;
    --mark: #4a4220;
  }
}

* {
  box-sizing: border-box;
}

html {
  font-family: system-ui, sans-serif;
  font-size: 100%;
  line-height: 1.55;
  color: var(--text);
  background: var(--page);
  overflow-wrap: break-word;
}

body {
  margin: 0;
}

header,
main,
footer {
  max-width: 52rem;
  margin: 0 auto;
  padding: 0 1rem;
}

header {
  border-bottom: 1px solid var(--line);
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  align-items: baseline;
}

nav .home {
  font-weight: 700;
  margin-right: auto;
}

main {
  padding-top: 1rem;
  padding-bottom: 2rem;
}

footer {
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.875rem;
  padding-bottom: 2rem;
}

a {
  color: var(--link);
}

a:visited {
  color: var(--visited);
}

h1,
h2,
h3,
h4,
h5,
h6 {
  line-height: 1.25;
  margin: 1.75rem 0 0.75rem;
}

h1 {
  font-size: 2rem;
}

h2 {
  font-size: 1.5rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.25rem;
}

h3 {
  font-size: 1.2rem;
}

:target {
  background: var(--mark);
}

code,
pre {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
}

code {
  background: var(--panel);
  border-radius: 3px;
  padding: 0.1em 0.3em;
}

pre {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  line-height: 1.4;
}

pre code {
  background: none;
  padding: 0;
  font-size: inherit;
}

blockquote {
  margin: 1rem 0;
  padding: 0 1rem;
  border-left: 4px solid var(--line);
  color: var(--muted);
}

hr {
  border: 0;
  border-top: 1px solid var(--line);
  margin: 2rem 0;
}

.table {
  overflow-x: auto;
  margin: 1rem 0;
}

table {
  border-collapse: collapse;
}

th,
td {
  border: 1px solid var(--line);
  padding: 0.35rem 0.6rem;
  vertical-align: top;
  text-align: left;
}

th {
  background: var(--panel);
}

.align-right {
  text-align: right;
}

.align-center {
  text-align: center;
}

.repository {
  text-decoration: underline dotted;
  cursor: help;
}

dl.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.35rem 1rem;
  border-top: 1px solid var(--line);
  padding-top: 1rem;
}

dl.facts dt {
  font-weight: 700;
}

dl.facts dd {
  margin: 0;
}

img {
  max-width: 100%;
}
`;
