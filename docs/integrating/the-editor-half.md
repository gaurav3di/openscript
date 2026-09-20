# The editor half

By the end of this page you will know what the language gives an editor, what
stays yours, what each function costs to call, and why none of it is on screen.

This page is for a platform putting a script editor in front of traders. It is
not a tour of an editor: [editor-tour.md](../editor-tour.md) is the page a trader
reads.

---

## The split, and why it is where it is

**OpenScript ships the language intelligence, headless. You ship the editor.**

Six pure functions, text in and data out, with no DOM anywhere: highlight,
complete, diagnose, hover, signature and format. The text component, the panel
around it, the apply button, saving, revisions and the theme are yours, because
every platform already has a design system and none of them wants to fight a
styled panel that arrived with a language package.

The split is enforced rather than promised. `scripts/check-layering.mjs` fails
the build if anything in this tier imports a package or so much as mentions a
browser global, which is what lets the same functions run in your bundle, in a
worker and in a language server later.

**None of the six is hand written.** That is the whole reason to take them rather
than write your own:

- Highlighting is the real lexer, and what each token is painted as comes from
  the language's own tables of reserved words, operators and library names. A
  word added to the language is coloured the day it lexes.
- Completions come from the standard library manifest, the same index the checker
  resolves a call against, and from the checker's own record of what the file in
  front of your writer has declared.
- Errors as you type are the compiler's own errors, with the message and the fix
  taken from the error catalogue that the documentation is generated from.
- What a hover says a call is for is the cell the specification prints for it,
  read at build time. What a signature says an argument defaults to is the value
  the compiler fills in, held to the specification by the same check that holds
  the compiler.
- The formatter reads the same tokens and asks the same parser.

A highlighter written from a language reference drifts from the language and
nobody notices for a release: a keyword stays grey, a fix sentence improves in
one place and not the other. The editor here is the compiler wearing a different
hat rather than a second implementation to keep in step.

## What exists today

All six, and the drop-in adapter beside them.

```ts
import { highlight, highlightLines, complete, diagnose, hover, signature, format }
  from "openalgo-script/editor";
```

That entry point resolves from an install holding nothing but the manifest and
the built output, which `scripts/check-entry-points.mjs` proves on every build by
constructing exactly that install and importing every door the package declares.
It was not an entry point while three of the six were missing, because an entry
point that resolves to half a tier fails at your run time rather than honestly at
install.

The adapter is `openalgo-script/adapters/codemirror`, and it is the last section
of this page.

## highlight

```
highlight(source) -> [ { kind, span, text }, ... ]
```

Every piece of the file, in order, **covering every character exactly once**.
That is the property to rely on: the pieces are in order, none is empty, none
overlaps its neighbour, and concatenating their texts gives you the file back.

It matters more than it sounds. If you draw highlighting behind or over a text
component and one character is missing from the list, everything after it on that
line is drawn one column to the left, and the caret stops sitting where the text
is. That is reported as "the cursor is in the wrong place" rather than as a
highlighting fault, which is why it survives for months. Here it cannot happen:
there is nowhere for a character to go.

`highlightLines(source)` is the same pieces grouped by line, one entry per line
of the file including the blank ones, each line's pieces concatenating to exactly
that line's text with no line ending in them. Use it if you render a line at a
time. It exists because splitting the flat list at line boundaries is where the
mistake gets made: a run of whitespace crossing a line ending has to go somewhere,
and putting it on the wrong line costs a line its indentation.

The kinds are a closed set, so you write theme rules once:

| Kind | Is |
|---|---|
| `keyword` | a reserved word of the language |
| `builtin` | a name the standard library manifest has |
| `name` | any other name |
| `number` | a number literal |
| `string` | a string literal |
| `color` | a hexadecimal colour literal |
| `comment` | a comment |
| `operator` | a mark that computes something |
| `punctuation` | a mark that groups or separates |
| `whitespace` | spaces, and the layout between tokens |
| `unknown` | source the lexer took no token from |

A named colour such as `aqua` is a library global rather than a literal
(`language.md` 3.8), so it arrives as `builtin`. Painting it in its own colour
needs the colour table, which is what `hover` will hand you.

`unknown` does not mean wrong. It is a character the language does not have, a
region somebody wrote as a block comment, or a line continuation backslash.
`diagnose` is what says whether any of it is a mistake; a highlighter with a
second opinion about the language would be a second implementation of it.

**Comments come back from here**, and this is worth stating because it is the
part a host usually ends up writing itself. The lexer emits no token for a
comment, since the parser has no use for one. Recovering them from the gaps
between token spans works and is folklore; scanning the text for `//` is worse,
because a `//` inside a string literal is ordinary text and finding that out
means lexing strings a second time. Ask for the pieces of kind `comment`.

**Offsets index the normalised text.** A byte order mark is dropped and CRLF
becomes LF before anything reads a file (`language.md` 3.1), exactly as for a
diagnostic's span. Normalise your buffer once on the way in, or draw from each
piece's own `text` and never index your buffer at all.

## diagnose

```
diagnose(source) -> [ Diagnostic, ... ]
```

Every diagnostic a compile of that text produces, in the order a reader walks the
file. Each one carries its code, its span, its severity, the message, the fix and
the values that filled them, because it is the same `Diagnostic` record the
compiler produces for a terminal. There is no editor-shaped diagnostic type.

**It is the whole front end**, not a subset written for the editor. Some codes are
raised by the emitter and by nothing before it, so an editor that stopped after
the checker would show a clean file and then have the trader's apply refused,
with a code the panel beside them never mentioned.

**What it costs.** A finished ninety line study is about a third of a
millisecond. The same file with a call bracket left open half way down it, which
is the state a file is in the moment somebody types one, is about a millisecond.
Both are in the benchmark suite with a budget, as `diagnose-heavy` and
`diagnose-typing`, so a change that makes the editor cost ten times what it costs
today fails our build rather than being felt by your traders. Call it on a
debounce of a few tens of milliseconds and you will not see it in a frame budget.

**A file that does not parse** is the normal state of a file somebody is typing
into, so it answers usefully rather than throwing or returning nothing. A lexical
mistake costs its own character, a statement that will not parse costs its own
line, and the lines around it are still checked, so a trader fixing three
mistakes sees three of them rather than rediscovering them one compile apart.

## complete

```
complete(source, offset) -> [ { label, insert, kind, detail, summary, planned, refusal, replace }, ... ]
```

What may be written at that position: the library's functions and values, the
names the file has declared and still has in scope, the named arguments of the
call being written, and the members of a namespace after a dot.

**The names come from the standard library manifest**, which is the same index
the checker resolves a call against and the same one the example check reads its
globals from. A function added to the library is offered the day it is added,
with no edit anywhere in the editor half. That is the whole reason to take this
rather than write your own: a list of function names is right on the day it is
typed and wrong at the next release, and nobody reports it, because a missing
completion looks exactly like a completion that has not loaded yet.

Two rules decide which of your writer's own names are offered, and both are the
compiler's. A name is offered from the end of the statement that declares it,
because OS2001 is "not defined at this point in the file", so `x` is not offered
inside `x = ema(x, 9)` and a function is not offered inside its own body. And a
name belongs to the block that declared it, so a name declared inside an `if` is
offered inside that block and not after it.

`replace` is the span the row replaces, which is the word already typed or an
empty span at the cursor. Use it rather than inserting at the cursor, or somebody
typing `em` and accepting `ema` gets `emema`.

**The list is already filtered**, by the word typed, compared exactly, because
names are case sensitive. Filter it again with a fuzzy matcher and you will offer
somebody `EMA`.

**A planned call is offered and marked.** The library names calls that are not in
this release so that the gap in the surface is visible rather than looking like
an oversight, and writing one is OS2020. Leaving them out of the list would send
a writer to the documentation to find out why their name is missing; offering
them unmarked walks them into a script that will not compile. So they are last in
the list, `planned` is true, and `refusal` carries the catalogue's own OS2020
sentence with that name in it. Grey the row, show the sentence, or drop the row:
one field either way.

Reserved words are not offered. The words are a closed table you can read from
the core as `RESERVED_WORDS`; deciding where one may be written needs the
grammar, and a list that offered every keyword at every position is noise a
writer learns to dismiss.

## hover

```
hover(source, offset) -> { kind, span, name, signatures, summary, warmup, type, declaredAt, colour, planned, refusal } | undefined
```

What the word under the pointer is. A library name carries every signature the
manifest holds for it, the line the specification gives it, and the first bar it
can produce a value on. A name your writer declared carries the type the checker
worked out and `declaredAt`, the span it was declared at, which is what a jump to
definition needs. A named colour carries its channels, which is what a swatch
needs. Nothing comes back for a space, an operator, a number or a string.

**The sentence is the specification's own table cell**, read out of `stdlib.md`
at build time rather than retyped into the source. A description improved in the
specification is improved in your tooltip on the next release, and a call whose
row is deleted loses its tooltip rather than keeping a description of something
that no longer exists.

**Three things a hover wants and cannot have**, stated plainly because the
alternative is a copy that drifts:

- **A reserved word has no explanation.** The specification reserves the words in
  one block and explains each of them in the prose of the section that uses it,
  which is a page rather than a field. So a hover over `var` says it is a
  reserved word and stops. Link the word to the specification if you want more.
- **A name with several signatures has one description.** Every signature is
  listed; the sentence beside them is the first row's.
- **A parameter has no description of its own.** `signature` gives you a
  parameter's name, type, default and accepted values, which are facts, and no
  sentence, which would have to be invented.

Those three and everything the adapter narrows are recorded together in
[`spec/editor-narrowings.json`](../../spec/editor-narrowings.json), so you read
them in one place rather than discovering them.

## signature

```
signature(source, offset) -> { name, of, signature, parameters, active, summary, planned, refusal, span } | undefined
```

The call being written, which parameter the cursor is in, and each parameter's
name, type, whether it is required and what it defaults to. It works on a call
that is still being typed, because that is the only time it is asked: the call is
found from the brackets, not from a tree that does not exist yet.

**The default shown is the default the compiler applies.** That is the part worth
checking in any tool that shows you one, because a tooltip that is confidently
wrong is worse than one that is absent. There are two places a default lives in
this compiler: the library manifest, for a call an engine makes, and the emitter,
for the eight declaration calls whose optional arguments become fields of a
declaration rather than arguments. `signature` reads both, through the same
answer `scripts/check-defaults.mjs` holds to what `stdlib.md` prints, so a number
in the tooltip and the number in the compiled program cannot differ without the
build failing.

`active` is -1 where the cursor is past the last parameter, which is a call with
more arguments than the signature takes and is OS3001 the moment it compiles. A
label decides the active parameter where one is written, because a named argument
may sit anywhere after the positional ones.

A function the file itself declares is answered too, from the checker's record of
it, with any default quoted from the source text as written.

While the call is unfinished, an overload is chosen by arity alone: the
specification resolves by arity and then by argument type, and the second rule
needs types, which need a tree. So `clear(` shows the array signature until its
argument arrives and the checker settles it.

## format

```
format(source) -> source, laid out
```

The canonical layout of `language.md` 3.13: indentation, spacing, where a comment
sits, blank lines.

**The rule that makes a format button safe to press is that formatting never
changes what a script means**, and it is proved rather than asserted. Every
example in the repository and every script the phase gates run is laid out again,
both texts are compiled, and the compiled programs have to be identical. On top
of that, every call checks itself: the output is lexed again and compared with
the tokens that went in, and if anything moved, your source comes back untouched.
A rule that is wrong therefore fails by doing nothing, which is the only
acceptable way for it to fail on a script that is holding a position.

**A source that does not parse comes back unchanged**, byte for byte. Not laid
out as far as it could be: a character the lexer refused produces no token, so a
reprint from the tokens would delete it, and watching a character vanish is worse
than an unformatted file.

Line breaks inside a statement are kept where the writer put them. Where to break
a long argument list is a judgement about what reads well, and the canonical
layout does not make it.

## What is still yours

The text component and its caret. The panel, the gutter, the squiggles and the
theme. Debouncing. Deciding when to format. Saving, revisions and the apply
button. Which of a file's diagnostics to show, and where.

All of that is design, and it is yours for the same reason your chart is: a
platform on another continent has different answers, and a language package with
opinions about them is a package nobody can embed.

## The drop-in adapter

```ts
import {
  openscriptStream, openscriptCompletion, openscriptLint,
  openscriptHoverTooltip, openscriptSignatureTooltip, formatDocument,
} from "openalgo-script/adapters/codemirror";
```

Five pieces and a command, for the editor component this adapter targets. It is
the piece you replace rather than patch: everything under the editor tier stays
ignorant of any component, and an adapter is the only module in the package
allowed to know two worlds at once.

**The component is a peer dependency and nothing in the adapter imports it.** The
shapes it produces are declared in the adapter's own contract file, and your
build is where the two meet, in one line per piece:

```ts
const parser: StreamParser<unknown> = openscriptStream;
const source: CompletionSource = openscriptCompletion;
```

An install of this package pulls in no text component, no chart and nothing else,
and the entry point check imports both adapters from an install with no package
of any kind beside them, so that is a result rather than an intention.

**Nothing in the package draws.** Both tooltips take the markup as a required
parameter, with no default, so no tier of this package names a browser global at
all and the same files load in a worker and on a server. What a tooltip says is
still ours: `hoverLines` and `signatureLines` give you the lines, in order, each
one an answer from the manifest, the specification, the checker or the error
catalogue.

```ts
hoverTooltip(openscriptHoverTooltip((held) => ({ dom: yourPanel(hoverLines(held)) })))
```

**Offsets are translated for you.** Every span this package produces indexes the
normalised text: a byte order mark dropped and CRLF turned into LF, before
anything reads the file. A document written on a machine that ends its lines with
two characters is an ordinary document your component holds exactly as it is, so
the adapter maps between the two. Without that, every squiggle below the first
line lands to the left of the text it is about.

**Highlighting is computed a line at a time**, because that is how the component
asks for it, and it is the same answer as the whole-file `highlight`: measured
over every script in this repository and the malformed corpus, 4279 lines, and
not one piece differs. It holds because nothing in this language crosses a line
ending.

What else the adapter narrows, and what to do instead in each case, is in
[`spec/editor-narrowings.json`](../../spec/editor-narrowings.json). It is short
and worth reading before you choose between the adapter and the six functions.

## Where to go next

- [editor-tour.md](../editor-tour.md), the page a trader reads, for what an
  editor built on this feels like to use
- [`spec/editor-narrowings.json`](../../spec/editor-narrowings.json), for what the
  adapter narrows and what a hover has no sentence for
- [`spec/language.md`](../../spec/language.md) 3.13, for the canonical layout
- [`spec/errors.md`](../../spec/errors.md), for the catalogue every message and
  fix comes from
- [errors/overview.md](../errors/overview.md), for what the code ranges mean
