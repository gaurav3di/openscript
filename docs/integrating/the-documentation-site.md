# The documentation site

For anyone who wants these pages as a website: to read them offline, to host
them beside a platform's own help, or to check a change to a page before it
lands.

By the end of this page you will know how to build the site, how to serve it,
what every page on it is generated from, and what the build proves about it
before you publish it.

---

## Build it

From the repository root:

```bash
npm run site
```

That writes the whole site into `site/` at the root of the repository, emptying
the directory first so a page whose document was deleted does not outlive it.
It needs Node 22, the same as the rest of the tooling, and nothing else: no
install step, no package from anywhere, and not the compiler's build, because
the site is made from Markdown and the error catalogue rather than from `dist/`.

`site/` is ignored by version control. It is built output, and a copy checked in
would be a second copy of every page.

If a link on the site goes nowhere, the command still writes every page, so you
can open the one in question, and then exits 1 with the problems listed.

## Serve it

Every address on every page is relative to the page it is on. Nothing starts at
a root, names a host or assumes where the site lives, so the same directory
works:

- opened straight from disk, by opening `site/index.html` in a browser;
- served by any static file server, from the top of a host or from any path
  under it, for example `python3 -m http.server 8080 --directory site`;
- copied into another application's static files under whatever prefix it
  serves them from.

A page carries no script, no inline style, no font and nothing embedded from
another site. Styling is one stylesheet, `site/site.css`, served beside the
pages, with a light scheme and a dark one chosen by the reader's own setting. So
an application that serves only its own files under a strict content security
policy can serve these unchanged. The one exception is the project's own front
page, `README.html`, whose badges and diagrams are images on other sites: under
a policy that allows images from its own origin only, a reader sees their
alternative text instead.

## What each page is generated from

| On the site | Generated from |
|---|---|
| `index.html` | The build itself: a page that sends a reader to the guides, the specification and the code index |
| `docs/.../*.html` | The Markdown file at the same path under `docs/`: the guides |
| `spec/.../*.html` | The Markdown file at the same path under `spec/`: the specification |
| `codes/OSxxxx.html` | That code's entry in `spec/errors.json` |
| `codes/index.html` | Every entry in `spec/errors.json`, grouped by the ranges the file declares |
| Anything else | A file one of those pages links to, carried onto the site |

**A code's page is its section of the catalogue.** The text is rendered from the
entry by the same function the build compares part 8 of
[`spec/errors.md`](../../spec/errors.md) with, character for character, so the
page a reader lands on for a code and the section they would find by scrolling
the catalogue say the same thing. Under the section, the page adds what the file
says about the entry around it: its range, what its severity and stage mean,
which code it refines and which codes refine it, all read from the same file.

**A linked file comes along.** A guide that links to an example script, to the
project's roadmap or to one of the notes under `issues/` sends its reader to a
page of the site: a Markdown file as a page, a script as a page showing its
source, and anything else copied as it is. `scripts/lib/site/sources.mjs` names
the places a file may be carried from. A link to anything outside them, the
source under `src/` or the licence, is printed as the text it was, with the
repository path it names shown when the pointer rests on it, because the site
does not hold that file and an address to it would resolve to nothing wherever
the site is served.

**Links are rewritten, anchors are kept.** A link to
`language.md#10-statements-and-control-flow` becomes a link to
`language.html#10-statements-and-control-flow`: a heading's id is its text in
lower case, with punctuation dropped and each space turned into a hyphen, which
is the scheme every link in these documents was written against.
An address to another site is left exactly as written.

The Markdown renderer is in `scripts/lib/site/`, written for what these
documents use and nothing more. A line that is nothing but an HTML tag is left
out, and every other angle bracket is shown as the character it is.

## What the build proves about it

`npm run check:site`, which `npm test` runs, builds the same site in memory with
the same code and reads the output the way a browser would. It fails on:

- a relative address that resolves to no file of the site, or an anchor that
  names no heading or element on the page it points at, reported at the line of
  the document it was written on;
- an address that assumes an origin: one that starts at a root, leaves the
  scheme off to name a host, names the local machine, or uses a scheme other
  than http, https and mailto;
- a script, a style element, an inline style, an event handler or a frame on
  any page;
- a file of the site that no chain of links from the home page reaches;
- a catalogue code with no page, or with a page the code index does not list;
- two sources that would be written to one path, and a table row with more
  cells than its header, whose last cells no reader would be shown.

Each rule is first handed a small repository with one defect in it, and must
refuse it, before the real tree is read. The check prints what it does not
prove every time it passes: that addresses to other sites work, that an anchor
lands on the heading its sentence meant, and that a page reads correctly, among
others. Read that paragraph before quoting a green build as more than it is.

## Changing it

- A page's words: edit the Markdown under `docs/` or `spec/`, or the entry in
  `spec/errors.json` for a code's page. Nothing on the site is edited directly.
- A new page under `docs/`: link it from the page that lists its neighbours, or
  the check fails it as a page nothing reaches.
- The look: `STYLESHEET_TEXT` in `scripts/lib/site/layout.mjs`.
- What a code's page prints: `sectionFor` in `scripts/lib/catalogue-page.mjs`,
  which changes part 8 of the catalogue's required text at the same moment.

## See also

- [README.md](./README.md), for the three routes to adopting the language
- [`spec/errors.md`](../../spec/errors.md), the catalogue the code pages come from
- [../README.md](../README.md), the guides the site's first section is made of
