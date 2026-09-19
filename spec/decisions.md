# OpenScript decision record

Version of this document: draft, tracking language version 1.

This file is the record of every cross-document question that has been settled.
It exists because the reasoning is worth more later than the answer alone: a
second implementer, reading four specification documents that each say something
slightly different, will ask exactly the questions below, and an answer with no
reason behind it invites the next reader to answer it again the other way.

Each entry states the question in one sentence, the decision, why it went that
way, and the exact edits that carry it into the specification. The specification
documents remain the authority once the edits land. This file is the minutes,
not a fifth source of truth, so a rule that appears here and nowhere else is an
edit that has not been applied yet.

Two standing notes for whoever applies these changes:

- **Part 8 of `errors.md` is rendered from `errors.json`.** Every change below to
  a per-code section of `errors.md` is the same change to the matching field of
  the same entry in `errors.json`. Applying one without the other breaks the
  claim the catalogue's preamble makes about itself.
- **A `feature-matrix.md` row must satisfy the five rules in that file's
  preamble.** Every citation named below resolves to a real heading, and every
  test identifier named below is unused elsewhere in that file. Do not invent a
  second identifier for a row that already has one.

The three repository checks must pass after every one of these edits:
`node scripts/check-names.mjs`, `node scripts/check-error-codes.mjs`,
`node scripts/check-examples.mjs`.

---

## 1. (B1) A name initialised to the absent value has no type rule

**Question.** What type does a name have when its first assignment is `none`, given
that `language.md` 10.1 fixes a name's type at its first assignment and
`language.md` 6 makes `none` a member of every type?

**Decision.** An initialiser of `none` fixes no type. A name whose first
assignment is the absent value takes its type from the first later assignment to
it, in source order, that gives it a value of a definite type; every assignment
after that one must be that type or `none`, and a second definite type is OS2003
as it is anywhere else. A name that is never given a definite type is of type
`none`: it is absent on every bar, and it is legal wherever `none` is legal, so
it plots a gap, compares with `==` and propagates through arithmetic. No new
error code, and `var x = none` stays the documented way to start a persistent
value empty.

**Why.** `none` is a member of every type, so an initialiser of `none` carries no
type information at all and there is nothing for the first-assignment rule to
fix. The language already takes a type from elsewhere in exactly this situation
twice, for the ternary arm that is `none` (OS2012) and for the empty array
literal (OS2015, `language.md` 14.1), so this is the third case of one rule
rather than a new rule.

**Changes required.**

- `language.md` 10.1: after the sentence "A name's type is fixed by its first
  assignment. Assigning a different type later is OS2003.", add a paragraph
  saying that `none` is not a type-fixing value, that the type is taken from the
  first assignment in source order that gives a definite type, that every later
  assignment must be that type or `none`, and that a name never given a definite
  type is of type `none` and absent for the whole run. Add a two-line example
  under the existing one, in the same style: `var stop = none` followed by
  `stop = lo`, with a comment saying the type is fixed by the second line.
- `language.md` 14.1: in the paragraph beginning "An empty literal takes its
  element type", add a half sentence noting that a name initialised to `none`
  takes its type the same way, with a pointer to 10.1. No other change.
- `errors.md` OS2003, in **Cause**: add one sentence, "A first assignment of
  `none` fixes no type, because `none` is a member of every type; the type comes
  from the first assignment that gives a definite one, and this code names the
  second definite type rather than the first." Make the same change to the
  `cause` field of entry OS2003 in `errors.json`. No other entry is involved.
- `feature-matrix.md` section 3, immediately after the row "Type fixed by first
  assignment": add the row
  `| A name initialised to none | none fixes no type: the type comes from the first assignment in source order that gives a definite one, and a name never given one is absent for the whole run | `specified` | `language.md` 10.1, `language.md` 6 | `type/none-initialised` |`.
- No example file changes. All twenty-one `var x = none` declarations in the
  examples, and the one in `language.md` section 2, are correct under this rule.

---

## 2. (B2) Four files name OS3011 for a bare expression in fill

**Question.** Which code does a bare expression in `fill`'s first two arguments
raise, OS3011 or OS3020?

**Decision.** OS3020. The catalogue is authoritative by `language.md` 1 and 16, it
carries an entry titled "fill needs two declared plots" whose fix names the plots
to declare, and its section 6 refinement table already records OS3020 as taking
this case from OS3011. The four files that say OS3011 are wrong and change.
OS3011 keeps its general meaning, an argument of the wrong type, and stays
correct everywhere else it is quoted.

**Why.** A refinement exists so that the fix can be specific, and this fix is
specific: plot both edges and pass the names. Quoting the family code sends the
reader to "argument has the wrong type", which is true but tells them nothing
they can act on.

**Changes required.**

- `stdlib.md` 14.2, the paragraph beginning "**`fill`'s first two arguments are
  plot handles, not series.**": change "An expression in either position is
  OS3011, with the fix naming the plot to declare." to name OS3020 instead.
- `feature-matrix.md` section 24, the row "An expression as a fill edge": change
  the What-it-is cell to say OS3020, and change the Section cell from
  `` `errors.md` OS3011 `` to `` `errors.md` OS3020 ``. Leave the test identifier
  `unit:fill/expression-rejected` alone. This row is also what gives OS3020 a
  matrix row, so defect 18 needs no second row for it.
- `examples/01-ema-cross.oscript`, the comment ending on line 32: change
  "expression in either position is OS3011" to OS3020.
- `examples/README.md`, the bullet "**`fill` names two plots, not two
  expressions.**": change OS3011 to OS3020 in the same sentence.

---

## 3. (B3) signal's at = "auto" is not implementable

**Question.** Where does a marker sit when `at` is `"auto"`, and how do `"auto"`
and `"price"` reach a compiled `markers[].position` that admits only `"above"`,
`"below"` and `"at"`?

**Decision.** `"auto"` is removed. `at` takes `"above"`, `"below"` or `"price"`,
and its default is `"above"`, which is what the old rule did for every text it
could not classify. The compiled field takes the same three spellings: what 2.8
calls `"at"` is renamed `"price"`, so source and format use one vocabulary and
there is no mapping table to keep in step. `at`, `shape` and `color` on `signal`
are part of the marker's declaration, which is fixed before bar 0, so each must
be a compile-time constant: a literal, arithmetic over literals, or an `input()`.
A bar-dependent one is OS3003. The marker's `text` is unaffected and stays
per bar on its channel.

**Why.** "The text suggests a sell" is not a rule an engine can implement, so two
conforming engines would place the same marker differently, and determinism wins.
The position cannot be folded at compile time either, because the text is a
per-bar expression in two of the twelve examples, so the choice is between
inventing a per-bar position channel for a fixed field and deleting the value
that needed it. Deleting it costs one default and no script in the repository.

**Changes required.**

- `stdlib.md` 14.3, the `signal` row of the table: the signature becomes
  `signal(text, color = none, at = "above", shape = "label")`. The removal of
  `size` is decision 4.
- `stdlib.md` 14.3, the paragraph beginning "`signal` is the whole of shape
  plotting": replace the sentence listing `at`'s four values with one naming
  `"above"`, `"below"` and `"price"`, and delete the sentence beginning "With
  `at = "auto"`". Add one sentence: "`at`, `shape` and `color` are part of the
  marker's declaration and are fixed before bar 0, so each must be a compile-time
  constant, a literal or an `input()`; a bar-dependent one is OS3003. Only the
  text is read per bar."
- `compiled-program.md` 2.8, `markers[]` table, the `position` row: the accepted
  values become `"above"`, `"below"` or `"price"`.
- `compiled-program.md` 12.2: no change. The worked example's `"position":
  "above"` is now the declared default rather than a folded `"auto"`.
- `feature-matrix.md` section 23, the row "Signal placement and shape": rewrite
  the What-it-is cell as "`at` takes `"above"`, `"below"` or `"price"` and
  `shape` takes ten values; both are compile-time constants, because the marker's
  declaration is fixed before bar 0", and add `` `compiled-program.md` 2.8 `` to
  the Section cell.
- `errors.md` OS3003: see decision 9, which broadens this entry's cause once for
  defects 3, 4 and 9 together.
- No example file changes. No `signal` call in the twelve examples passes `at`.

---

## 4. (S1) signal's shape and size have no compiled home

**Question.** Where do `signal`'s ten shapes and its `size` argument live in the
compiled program, which admits five shapes and has no size field at all?

**Decision.** The compiled format widens to the library's ten shapes: `"label"`,
`"arrowUp"`, `"arrowDown"`, `"triangleUp"`, `"triangleDown"`, `"circle"`,
`"square"`, `"diamond"`, `"cross"` and `"flag"`. `size` leaves the signature. A
one-value enumeration is not a feature, nothing stores it, and inventing a
five-step size vocabulary plus a field to carry it would be inventing machinery
to carry a value no script in the repository writes. A later language version may
add it with the field that holds it, which `language.md` 4.1 permits.

**Why.** `stdlib.md` is the authority about a function's arguments, and the chart
contract already carries the wider shape set, so the format widens rather than
the library shrinking. The opposite is true of `size`: the source says a word the
contract has no room for, and the honest repair is to stop saying it.

**Changes required.**

- `compiled-program.md` 2.8, `markers[]` table, the `shape` row: replace the five
  values with the ten above, in that order.
- `stdlib.md` 14.3, the `signal` row: drop `size = "normal"` from the signature.
  The result, with decision 3, is
  `signal(text, color = none, at = "above", shape = "label")`.
- `feature-matrix.md`, the preamble section "Two documents that disagree, and
  which one is right": delete the whole "**The marker enumeration.**" paragraph.
  It is settled here and the documents no longer disagree. Leave the "**Object
  lifetime.**" paragraph in place: it is a different disagreement and is still
  open.
- `feature-matrix.md` section 23, the three-line note after the table beginning
  "`compiled-program.md` section 2.8 still carries the narrower marker
  enumeration": delete it.

---

## 5. (S2) Three different lists of the bar state the host supplies

**Question.** Which bar facts does the host state and which does the engine
derive, given three lists of four, four and five?

**Decision.** The host states four facts about the execution: `bar.isNew`,
`bar.isConfirmed`, `bar.isRealtime` and `bar.updates`. The engine derives four
from the dataset and the position in it: `bar.index` is the position, `bar.count`
is `bar.index + 1`, `bar.isFirst` is `bar.index == 0`, and `bar.isLast` is true
when `bar.index` is the greatest index the host has supplied. `compiled-program.md`
5.2 is already right and does not change; the other two lists change to match it.

**Why.** A fact the engine can compute must not also be stated by the host, or
the two can disagree and no rule says which wins. `bar.isFirst` is defined as a
derivation in `language.md` 7.2, and `bar.isLast` is a property of the bar array
rather than of the update, so both belong on the derived side.

**Changes required.**

- `compiled-program.md` 5.2: no change to the row "Bar state: is this bar new,
  confirmed, realtime, and the update count". Do not "fix" it.
- `compiled-program.md` 2.10, the `"bar"` register field table: replace the row
  `| `bar.isFirst`, `bar.isLast`, `bar.isConfirmed`, `bar.isRealtime`, `bar.isNew` | Booleans the host states |`
  with two rows:
  `| `bar.isConfirmed`, `bar.isRealtime`, `bar.isNew` | Booleans the host states for this execution |`
  and
  `| `bar.isFirst`, `bar.isLast` | Derived by the engine: `bar.index == 0`, and `bar.index` is the greatest index the host has supplied |`.
  Leave the `bar.updates` row as it is.
- `stdlib.md` 3.3, the closing sentence beginning "These land in the contract's
  calculation context": replace "the host supplies the same four facts (new,
  confirmed, realtime, last index)" with "the host supplies four facts about the
  execution (new, confirmed, realtime and the update count) and the engine
  derives the other four from the dataset and the bar's position in it".
- `stdlib.md` 18, the contract map row that reads
  `| `bar.isNew`, `bar.isConfirmed`, `bar.isRealtime`, `bar.isLast` | the calculation context's bar state |`:
  replace `bar.isLast` with `bar.updates`.
- `language.md` 7.2, under the `bar` namespace table: add one sentence naming the
  four the host states and the four the engine derives, with a pointer to
  `compiled-program.md` 5.2.

---

## 6. (S3) Four chart facts have no source

**Question.** Where do `chart.pointValue`, `chart.currency`, `chart.instrumentType`
and `chart.hasVolume` come from, when the engine reads everything from the host
and the host's list holds six instrument facts?

**Decision.** The host's instrument record supplies ten facts: symbol, exchange,
interval, timezone, tick size, lot size, point value, currency, instrument type
and whether the instrument has volume. The engine derives two from the interval:
`chart.intervalMinutes` and `chart.isIntraday`. Each supplied fact is absent when
the host does not state it, on the same ground as tick size, except
`chart.hasVolume`, which is a boolean the host must state because
`stdlib.md` 3.1 makes an absent volume and a zero volume different facts and no
derivation can tell them apart.

**Why.** A script cannot read a fact nobody supplies, so the host list is what has
to widen. Deriving the interval's two conveniences rather than supplying them
keeps them from disagreeing with the interval string they describe.

**Changes required.**

- `compiled-program.md` 5.2, the row "Instrument facts: symbol, exchange,
  interval, timezone, tick size, lot size": extend the list with point value,
  currency, instrument type and whether the instrument has volume.
- `compiled-program.md` 5.2, after the table: add one sentence saying that
  `chart.intervalMinutes` and `chart.isIntraday` are derived from the interval
  string rather than supplied, and that every supplied fact except the volume
  flag is absent when the host does not state it.
- `stdlib.md` 3.4, after the sentence about `chart.tickSize`: add one sentence
  naming the ten facts the host supplies and the two the engine derives, with a
  pointer to `compiled-program.md` 5.2.
- No change to `errors.md` OS6012. It covers a fact a call needs and cannot
  default, which is a different question from what a bare read returns. The
  tension between the two is recorded at the end of this file.

---

## 7. (S4) A colour's alpha has two representations and no conversion rule

**Question.** How does an alpha of 0 to 1 become one of the four integer channels
that `conformance.md` 6 compares, and what rounds the fractional channels that
`mix()` produces?

**Decision.** The machine value is unchanged: red, green and blue are whole
numbers from 0 to 255 and alpha is a binary64 number from 0 to 1. Two rules close
the gap.

1. **Every library call that computes a colour rounds red, green and blue to a
   whole number before returning**, with the language's own rounding, halves away
   from zero (`stdlib.md` 8.1). The invariant in `compiled-program.md` 3.1 then
   holds of every colour anywhere, not only of literals.
2. **At the contract boundary the alpha becomes a byte as
   `round(alpha * 255)`**, the same rounding. That byte is the `aa` of the
   `#rrggbbaa` spelling, and that spelling is what the conformance suite
   compares.

The conversion is one way and is not a round trip: `#ff880080` parses to
128 divided by 255, and `fade(aqua, 88)` is an alpha of 0.12 which serialises to
`1f`, which reads back as a different number. Nothing in the language observes
the difference, because a script reads alpha with `alpha()` from the machine
value and never from the wire form.

**Why.** Two engines could otherwise land on 30 and 31 for the same colour and
both be conforming, which is the definition of a rule that is wrong. Rounding at
the call rather than only at the boundary means the value model has one
invariant instead of an exception for everything `mix()` returns.

**Changes required.**

- `stdlib.md` 11.2, after the construction table: add a paragraph stating rule 1
  above, naming `round` and `mix` explicitly, and stating rule 2 with the worked
  numbers for `fade(aqua, 88)`.
- `compiled-program.md` 3.1, the `color` row's rules: add a bullet stating the
  invariant (whole channels, binary64 alpha) and the byte conversion of rule 2,
  and that the conversion is one way.
- `conformance.md` section 6, the Colour row of the "Everything that is not a
  number" table: change the cell to read "Four integer channels 0 to 255, each
  exactly, after the alpha has been converted to a byte by the rule in
  `compiled-program.md` 3.1. A colour is stored as `#rrggbbaa` so there is one
  spelling of any colour".
- `conformance.md` section 4, the sentence in the `expected.csv` description
  reading "A colour is written `#rrggbbaa`, always eight hex digits, always lower
  case": add "after the alpha conversion of `compiled-program.md` 3.1".
- `feature-matrix.md` section 19, after the row "`mix(a, b, weight)`": add
  `| Channel rounding | Colour-producing calls round red, green and blue with the language's own rounding, and the alpha becomes a byte as round(alpha * 255) at the contract boundary | `specified` | `stdlib.md` 11.2, `compiled-program.md` 3.1, `conformance.md` 6 | `color/channel-rounding` |`.

---

## 8. (S5) The worked "for x in arr" listing does not terminate

**Question.** Where should the two `JUMP_FALSE` instructions of the `for x in arr`
listing jump to?

**Decision.** To instruction 25, the instruction after the loop. Both currently
target 24, which is the backward `JUMP` to the top of the loop, so the listing as
printed is an infinite loop. Nothing else in the listing changes: 24 stays
`["JUMP", 5]`, which lands on the `TICK` at 5 and satisfies the verifier's rule
that the target of every backward jump is a `TICK`.

**Why.** It is a transcription error in a listing a compiler writer will copy, and
the rest of the section is right: `break` is described as a forward jump to the
instruction after the loop, which is 25.

**Changes required.**

- `compiled-program.md` 4.8, the `for price in prices` listing: instruction 9
  becomes `["JUMP_FALSE", 25]` and instruction 14 becomes `["JUMP_FALSE", 25]`.
  No other line of the listing changes.

---

## 9. (S6) An input used as a fixed-shape option value has nowhere to go

**Question.** How does `study("Range", precision = input(2, ...))`, which
`language.md` 13.2 and the OS3003 entry both admit, reach a `meta` that carries
every option as its effective value?

**Decision.** A field of `meta`, or of any declaration in `outputs`, may hold
either a literal value as today or the object `{ "input": "<key>" }`, naming an
entry of `inputs[]` by its `key`. The engine resolves inputs once at load, in the
order of section 2.6, and substitutes the resolved value for every such reference
before it builds the descriptor. The referenced key must exist and its resolved
value must satisfy the field it lands in; a failure is OS6019, the same code as
any other unusable setting, because the value came from outside the source.

**Why.** The source document wins on what a script may express, and three places
already say a script may express this: `language.md` 13.2, the OS3003 entry whose
whole fix is "make it an input", and `stdlib.md` 13.4, which tells a script to
declare a colour input and pass it to a plot. A settings value is fixed for the
whole run, so the reference costs one substitution at load and nothing per bar.
The alternative, forbidding it, would delete a tunable precision, a tunable table
corner and a tunable plot colour, and would leave OS3003 with no fix to name.

**Changes required.**

- `compiled-program.md` 2.3, after the paragraph beginning "A study program
  carries no `strategy` object": add a paragraph defining the
  `{ "input": "<key>" }` form, saying which fields may hold it (every field of
  `meta`, of `meta.strategy`, and of every declaration in `outputs`, other than
  `kind`), and saying it is resolved at load after inputs and never per bar.
- `compiled-program.md` 2.8, after the `tables[]` table: add one sentence saying
  that a declaration field which a script wrote from an `input()` carries the
  reference form of 2.3, naming `tables[].position` and `plots[].color` as the
  two a script reaches for.
- `compiled-program.md` 3.5, the list of load-time checks: add a check that every
  `{ "input": ... }` reference names a declared input whose resolved value is
  admissible in that field, failing with OS6018 for a key that does not exist and
  OS6019 for a value the field refuses.
- `compiled-program.md` 5.1: no change to the eleven steps. Add one sentence
  after the list saying that input resolution and reference substitution happen
  at load, before step 1 of bar 0, so the descriptor exists before the first bar.
- `errors.md` OS3003 (and the `cause` and `spec` fields of the entry in
  `errors.json`): broaden **Cause** to say that the rule covers not only the
  declaration's options but every argument that lands in a declaration fixed
  before bar 0, naming `signal`'s `at`, `shape` and `color`, `table`'s
  `position`, `rows` and `cols`, and a plot's style arguments; and that an
  `input()` is a constant for this purpose because it is resolved before bar 0.
  Add `language.md` 15.3 to the **Reference** list. Do not change the message,
  the placeholders, the fix or the example.
- `feature-matrix.md` section 13, after the row "Non-constant default": add
  `| An input as an option value | A fixed-shape option may be written with an input(), and the compiled program carries the reference until the engine resolves inputs at load | `specified` | `language.md` 13.2, `compiled-program.md` 2.3, `errors.md` OS3003 | `input/option-from-input` |`.
- No example file changes. `examples/08-dashboard-table.oscript` line 23,
  `table(position = corner)` with `corner` an input, is correct under this rule.

---

## 10. (S7) An input's default has two encodings and one type it cannot express

**Question.** Is an input's compiled `default` a constant pool value form or a
bare value, and what form does a source input's default take when the pool has no
tag for a series?

**Decision.** The `[tag, value]` form of 2.6 is the rule and the worked example is
wrong. For a `"source"` input the default is `["s", "<field>"]`, naming one of the
eight built-in series a source input may select: `open`, `high`, `low`, `close`,
`hl2`, `hlc3`, `ohlc4`, `volume`. The `kind` field is what says the string names a
series rather than holding one, so no new pool tag is added. The engine resolves
the name to the matching `"bar"` register and writes that register's current value
into the input's slot at step 5 of every bar; where the program reads the input's
history it gets a `"computed"` register like any other top-level name.

**Why.** One encoding beats two, and the compiled format's own rule is the one
that already covers every other kind. A new tag for the one kind whose default is
a name rather than a value would put a value in the pool that no instruction can
push.

**Changes required.**

- `compiled-program.md` 12.2, the `inputs` array of the worked program: change
  `"default": 2` to `"default": ["n", 2]`.
- `compiled-program.md` 2.6, after the field table: add a paragraph stating the
  source case above, listing the eight admissible names, and stating how the slot
  is filled per bar and where history comes from.
- `compiled-program.md` 2.9: no change. No tag is added.
- `feature-matrix.md` section 13, the row "Source input": add
  `` `compiled-program.md` 2.6 `` to the Section cell.

---

## 11. (M1) Plot style token drift

**Question.** Is the style with markers spelled `"lineWithMarkers"` or
`"line-markers"`?

**Decision.** `"lineWithMarkers"`, in both documents. The compiled format changes.
No mapping table: a mapping is a second thing to keep in step, and the other five
values in the same enumeration are already identical in both places.

**Why.** The hyphenated spelling is the odd one out in the compiled format itself,
which writes `"topLeft"` and `"bottomRight"` elsewhere, so the format loses
nothing by matching the library, and the library is the spelling a script author
types.

**Changes required.**

- `compiled-program.md` 2.8, `plots[]` table, the `type` row: change
  `"line-markers"` to `"lineWithMarkers"`.
- `feature-matrix.md` section 23, the row "Plot styles": no change. Its claim that
  both documents carry the same closed set becomes true.

---

## 12. (M2) Input kind token drift

**Question.** Is a boolean input's kind `"boolean"` or `"bool"`, and is a free
text input's kind `"text"` or `"string"`?

**Decision.** `"bool"` and `"string"`, in both documents. `stdlib.md` changes. The
`kind` string is the contract a host reads to build a settings row, the compiled
format is where that contract is written down, and its other seven values already
match the library's own words.

**Why.** Same reason as decision 11, pointing the other way: whichever document
owns the token that crosses the boundary keeps its spelling, and here that is the
compiled format.

**Changes required.**

- `stdlib.md` 13.1, the "Lands in" column: in the `bool` row change "a `boolean`
  input" to "a `bool` input"; in the free text row, the `"symbol"` row and the
  `"session"` row change "a `text` input" to "a `string` input". Four cells, no
  other change.
- `feature-matrix.md` section 13: no change. The rows "Bool input" and "String
  input" already use these words.

---

## 13. (M3) errors.md renders a stage vocabulary that errors.json does not hold

**Question.** How can part 8 be rendered from `errors.json` when it prints
"lexer", "parser", "checker" and "engine" where the file holds `lex`, `parse`,
`check` and `runtime`?

**Decision.** The rendered words are a label, not a second vocabulary, so the
label moves into the file the render reads. `errors.json` gains a `stageLabels`
object mapping each stage to the word part 8 prints: `lex` to "lexer", `parse` to
"parser", `check` to "checker", `runtime` to "engine", `host` to "host". The 136
per-code sections keep the words they print. This is a new field rather than a
change to the existing `stages` object, so `schemaVersion` does not move, by that
field's own rule.

**Why.** The alternative, printing the raw token in 136 places, reads badly in
prose ("Stage lex.") and buys nothing. A mapping is acceptable here, and not in
decisions 11 and 12, because this one is a rendering of a single stored value
rather than two stored spellings of the same token: there is still exactly one
place a stage is recorded.

**Changes required.**

- `errors.json`: add a top-level `stageLabels` object with the five pairs above,
  immediately after `stages`. Change nothing else.
- `errors.md` 1, the field table of the file's shape: add a row
  `| `stageLabels` | object | The word each stage is printed as in part 8 |`
  after the `stages` row.
- `errors.md` 8, in the preamble sentence before the catalogue begins: add one
  sentence saying that each section prints the stage's label from `stageLabels`,
  with the five pairs written out, and that the entries themselves carry the
  token.

---

## 14. (M4) plot's colour default is unspecified while the compiled field is required

**Question.** What colour does a plot have when the script names none, given that
`stdlib.md` 14.2 writes the default as `color = ...` and `compiled-program.md` 2.8
makes `plots[].color` required and non-nullable?

**Decision.** The default is `none`, and `plots[].color` becomes nullable. Null
means the script named no colour, and the host assigns one from the same palette
it already uses to fill the generated style rows of `stdlib.md` 13.4. Passing
`none` explicitly is the same thing as omitting the argument.

**Why.** Naming a fixed colour such as `aqua` as the default would draw every
undecorated plot of a three plot study in one colour, and the host already owns
the style row for exactly this reason, so this is a host choice the language
permits rather than an unspecified corner: no computed value depends on it, and
the conformance suite asserts columns, markers, fills, levels and paint, never a
plot's default style colour.

**Changes required.**

- `stdlib.md` 14.2, the `plot` row: write the default as `color = none` in the
  signature, and add one sentence after the paragraph "**A constant colour and a
  per-bar colour are the same argument.**" saying that an omitted or absent
  colour leaves the plot's colour to the host's palette, the same palette that
  fills the style row of 13.4.
- `compiled-program.md` 2.8, `plots[]` table, the `color` row: change the type to
  `color?` and the meaning to "Default colour, or null when the script named
  none, in which case the host assigns one from its own palette".
- `feature-matrix.md` section 23, the row "Width and colour": extend the
  What-it-is cell with "and an omitted colour is null in the compiled program,
  which hands the choice to the host's palette", and add
  `` `compiled-program.md` 2.8 `` to the Section cell.

---

## 15. (M5) language.md is silent on a negative step and on an absent bound

**Question.** What does `for i = 5 to 9 step -1` do, and what happens when a bound
is absent, in a document that says nothing is left implementation defined?

**Decision.** The body does not run when the step is positive and the start is
above the end, or when the step is negative and the start is below the end. The
range is never silently reversed in either direction. An absent start, end or
step is OS4013 and stops the bar; it is not zero iterations.
`compiled-program.md` 4.8 already settles both correctly, and `language.md` 10.3
is the document that is missing them.

**Why.** Example 09 walks a descending loop over an empty array on every bar
before the first zone exists, so the negative-step case is not a corner: it is the
first bar of a shipped example. An absent bound is an error rather than zero
iterations because a loop that silently does nothing during warmup leaves a plot
that looks computed.

**Changes required.**

- `language.md` 10.3, the paragraph beginning "`step` defaults to `1`": extend
  the sentence about a positive step to cover the negative one in the same
  breath, and add a sentence saying an absent start, end or step is OS4013 rather
  than a loop that does not run. Cite `compiled-program.md` 4.8 for the compiled
  form.
- `feature-matrix.md` section 9, the row "Non-reversing loop": change the
  What-it-is cell to cover both signs, and add `` `compiled-program.md` 4.8 `` to
  the Section cell. The row "Absent loop bound" needs no change once
  `language.md` 10.3 names OS4013.

---

## 16. (M6) "or" is not commutative

**Question.** Should `none or true` be `none`, as both documents say, or `true`?

**Decision.** `true`. The single cell is wrong and changes; `or` becomes
commutative and De Morgan's laws hold again. `language.md` 6.6 defines the
three-valued logic with `none` meaning "unknown", and under that meaning
`none or true` has exactly one answer: whichever value the unknown operand turns
out to hold, the result is true. Every other cell of both tables is already
right. The consequence for the machine is that `or` mirrors `and` exactly:
`OR_SHORT` jumps only when the left operand is `true`, and a new `OR` instruction
combines the two values otherwise. The instruction set becomes forty-one
instructions.

**Why.** The table contradicts its own document's stated reading of `none`, and
the surprise is not one a reader can predict: `if isNone(x) or x > 5` and
`if x > 5 or isNone(x)` are the same sentence to a reader and, today, different
programs. The language argues in 6.4 that it propagates absence through
comparison precisely to keep `not (a > b)` equal to `a <= b` for every input;
keeping that identity and losing De Morgan's is not a position the document can
hold. The cost is one opcode in a format that has not shipped, and no example in
the repository relies on the old cell.

**Changes required.**

- `language.md` 6.6, the truth table: in the row where `a` is `none` and `b` is
  `true`, change `a or b` from `none` to `true`. No other cell changes. Add a
  sentence after the table saying that both operators are commutative and that
  absence is absorbed exactly when the other operand decides the answer alone.
- `language.md` 9.4: add one sentence saying that `or` evaluates its right
  operand when the left is absent, because a `true` on the right decides the
  answer, and that `and` does so for the mirror reason.
- `language.md` 17: append an entry to the end of the surprises list, as entry 21,
  so no existing number moves. It reads that `and` and `or` are three-valued with
  `none` meaning unknown, that an operand is evaluated whenever it can still
  decide the answer, and that both operators are commutative. (Section 6.6.)
- `compiled-program.md` 4.7: add an `OR` row to the opcode table with stack
  `a b -> v`; change `OR_SHORT`'s effect to "If the top value is `true`, jump to
  `t` leaving it in place"; add the disjunction table beside the conjunction one;
  replace the `a or b` listing with the mirror of the `a and b` listing
  (`<a>`, `["OR_SHORT", 4]`, `<b>`, `["OR"]`), so the `POP` is no longer part of
  it; and replace the paragraph beginning "There is no `OR` instruction" with one
  explaining that the two operators are symmetric because absence on either side
  still lets the other side decide.
- `compiled-program.md` 4.13: add the `OR` row after `AND`, with depth `-1`,
  group Logic; change "Forty instructions" to "Forty-one instructions".
- `compiled-program.md` 13, the machine checklist: change "Implements all forty
  instructions of section 4" to forty-one.
- `feature-matrix.md` section 5, the row "Three-valued logic": extend the
  What-it-is cell with "both operators commutative", and add
  `` `compiled-program.md` 4.7 `` to the Section cell. The row "Short circuit"
  needs no change.
- No example file changes. No example in the repository depends on the old cell.

---

## 17. (M7) A third placement list

**Question.** Which calls are top level only, and where does `clear` belong?

**Decision.** Five calls are top level only: `plot`, `plotCandles`, `fill`,
`level` and `table`, which is what `errors.md` OS3006 already says. `plotCandles`
declares a column and returns a `plot` handle, so it can be nowhere else, and the
two lists that omit it are wrong. `clear` goes on the anywhere list, in both its
forms: `clear(t)` empties a grid per bar and `clear(arr)` is an array operation.

**Why.** Three lists of the same fact is two lists too many, and the one attached
to the error code is the one a reader arrives at holding a diagnostic.

**Changes required.**

- `language.md` 15.3, the top-level-only sentence: add `plotCandles` to the list,
  keeping OS3006 and OS3007 as they are. In the anywhere sentence, add `clear`
  after `cell`.
- `stdlib.md` 14.1, the first sentence: add `plotCandles` to the list of four.
  In the second paragraph, add `clear` to the list that begins "`signal`,
  `alert`, `barColor`, `background`, `cell`, `print`".
- `errors.md` OS3006: no change. It is right as written.

---

## 18. (M8) Seven catalogue entries have no feature-matrix row

**Question.** Which rows are missing, and where do they go?

**Decision.** Six rows are added. OS3020 needs no row of its own: decision 2
changes the existing fill row to cite it, which is the citation whose absence
caused the defect. Each row below is `specified`, cites a heading that exists, and
carries an identifier that appears nowhere else in the file.

**Why.** A code with no row is a code no test is planned for, and OS3020 was the
case that proved it: the matrix could not cite a code no row named, so the stale
citation survived.

**Changes required.**

- `feature-matrix.md` section 1, after the row "Continuation by trailing token":
  `| A continuation with nothing after it | OS1022, naming the token the statement ended on, because a trailing operator promised a right-hand side | `specified` | `language.md` 3.11, `errors.md` OS1022 | `unit:lex/continuation-incomplete` |`
- `feature-matrix.md` section 14, after the row "Element types":
  `| A type that cannot be an array element | OS2019, the refinement of OS2016 for a declaration handle, a series or an array of arrays | `specified` | `language.md` 14.1, `language.md` 5.4, `errors.md` OS2019 | `unit:array/element-type-rejected` |`
- `feature-matrix.md` section 4, after the row "Handle in an argument that does
  not take one":
  `| A handle where a runtime object belongs | OS3019, the refinement of OS3011 for an argument that takes a line, label, box, polyline or table | `specified` | `language.md` 5.4, `errors.md` OS3019 | `unit:obj/handle-in-object-argument` |`
- `feature-matrix.md` section 33, after the row "What the host supplies":
  `| No bars supplied | OS6010, because a script cannot run over nothing and an empty pane with no message is indistinguishable from a study that drew nothing | `specified` | `compiled-program.md` 5.2, `errors.md` OS6010 | `unit:prog/no-bars` |`
  and
  `| Bars out of order | OS6011 naming the first bar whose time does not follow the one before it, because an engine may not reorder what it is given | `specified` | `compiled-program.md` 5.2, `errors.md` OS6011 | `unit:prog/bars-out-of-order` |`
- `feature-matrix.md` section 26, after the row "Deletion and counting":
  `| A deleted object still held | OS8019, warning that a name or an array still refers to an object deleted earlier, because a stale handle in a setter is OS4005 one bar later | `specified` | `language.md` 5.4, `errors.md` OS8019 | `unit:draw/deleted-still-held` |`

---

## 19. (M9) The README credits a script that does not write "color ="

**Question.** Which example scripts demonstrate a reserved word as a named
argument label?

**Decision.** Scripts 4 and 9. Script 8's named arguments are `overlay`, `min`,
`max`, `options`, `rows`, `cols`, `position`, `textColor` and `bgColor`, none of
which is a reserved word. Fix the sentence rather than the script: script 8 is
about a grid, and adding a colour argument to make a sentence true would be
writing the example to fit the prose.

**Why.** A claim about which file demonstrates a rule is checkable by reading the
file, and a reader who checks and finds nothing stops trusting the rest of the
page.

**Changes required.**

- `examples/README.md`, the bullet "**`color` is a reserved word and also an
  argument name.**": change "Scripts 4, 8 and 9 write `color =` on that rule" to
  "Scripts 4 and 9 write `color =` on that rule". Leave the rest of the sentence,
  including the clause about `min =` and `max =`, as it is.

---

## 20. (M10) Two library citations are in the wrong order

**Question.** In "vwap and variance are library names (stdlib 6 and 7)", which
name goes with which section?

**Decision.** `variance` is `stdlib.md` section 6 and `vwap` is section 7, so the
names are reordered to match the citations rather than the other way round, which
keeps the ascending section numbers the reader expects to scan.

**Why.** It is a comment in an example whose whole subject is that a script may
not take a name the library owns, so a reader who follows the citation to check
lands in the wrong section.

**Changes required.**

- `examples/03-anchored-vwap.oscript`, the comment on line 40: change "vwap and
  variance are library names (stdlib 6 and 7)" to "variance and vwap are library
  names (stdlib 6 and 7)". No other change to the comment or the script.

---

## 21. (M11) fade does not say whether it sets alpha or multiplies it

**Question.** Is `fade(fade(aqua, 50), 50)` the same as `fade(aqua, 50)` or
`fade(aqua, 75)`?

**Decision.** The same as `fade(aqua, 50)`. `fade` sets the alpha absolutely:
`fade(c, p)` is `withAlpha(c, (100 - p) / 100)`, exactly, whatever alpha `c`
already carried. The entry's own words, "the same colour at `percent`
transparency", are the rule; the prose that calls it "lowers a colour's alpha" is
a loose description and changes.

**Why.** `fade` and `withAlpha` are two spellings of one operation in two
conventions, and the identity above is the whole of the difference. A
multiplicative `fade` would break that identity, would make `fade(c, 0)` a call
that does nothing rather than a call that makes the colour opaque, and would make
the value of a faded colour depend on how many times it had been through the
function.

**Changes required.**

- `stdlib.md` 11.2, the paragraph beginning "`fade` takes transparency, not
  opacity": add the identity `fade(c, p)` is `withAlpha(c, (100 - p) / 100)` and
  say in the same sentence that the alpha is set rather than scaled, so nesting
  two fades is the inner call's alpha replaced by the outer one's.
- `language.md` 3.8, the sentence listing the colour functions: change "`fade(color, percent)`
  which lowers a colour's alpha" to "`fade(color, percent)` which sets a colour's
  alpha from a percentage of transparency".
- `feature-matrix.md` section 19, the row "`fade(color, percent)`": extend the
  What-it-is cell with "and it sets the alpha rather than scaling it, so nesting
  two fades is the outer one".

---

## 22. (M12) Examples in the specification declare names the library owns

**Question.** Should the specification's own examples be renamed to obey OS2002,
or should the rule bend for them?

**Decision.** Rename the examples. Option 1 of `issues/0001` is taken as it
stands: the library keeps the short name and the example takes a longer one. The
issue lists four sites; the check finds seven in `language.md`, and the three it
did not list are the same defect. It also finds thirteen more in `errors.md`,
which is a second file and a second edit, because each of those examples lives in
`errors.json` as well. The `spec` entry is added to `SOURCES` in
`scripts/check-examples.mjs` only after both files are done, and that edit is the
last one of this defect.

**Why.** These are the examples a reader meets first, and a reader who copies one
meets OS2002 on the first compile with the specification's own line named as the
mistake. Renaming the library instead would move `change`, `count` and `highest`
out of the scope that should hold the short name, and allowing shadowing is the
bug 12.3 exists to prevent.

**Changes required.**

- `language.md` 3.10, both fenced examples that end with `low = 0`: rename that
  name to `base` in both. `low` is a built-in series.
- `language.md` 3.10, the fenced example containing
  `fn change(src) => src - src[1]`: rename the function to `barChange`.
- `language.md` 5.2, the fenced example containing `fn change(src) => src - src[1]`
  and `plot(change(hlc3), "Change", aqua)`: rename the function to `barChange` in
  both lines. Leave the plot title "Change" as it is: a title is a string, not a
  name.
- `language.md` 8.1, the fenced example whose two lines are `count = count + 1`
  and `count = count[1] + 1`: rename to `barCount` throughout, including the
  sentence below the block that reads "`count[1]` is `none` on bar 0".
- `language.md` 7.5, the "Rollback" example: rename `count` to `barCount` in all
  three lines.
- `language.md` 8.2, the first `var` example: rename `count` to `barCount` in both
  lines, and rename `highest` to `runningHigh` in all three lines of the second
  half of the same block.
- `language.md` 11.4, the `barsSince` example: rename the function to `sinceTrue`
  in the declaration and in both call sites. `barsSince` is `stdlib.md` 9.
- `errors.md` and `errors.json`, eight entries, each in both files and in both
  `before` and `after` where the name appears: OS1009 renames the parameter
  `level` to `mark`; OS1011 renames `highest` to `runningHigh`; OS2005 renames the
  local `sum` to `runningTotal`; OS4012 renames `order` to `sortOrder`; OS5008
  renames `log` to `logLines`; OS8011 renames `count` to `barCount`. Where the
  entry's **Cause** or **Fix** prose repeats the name, rename it there too.
- `issues/0001-spec-examples-shadow-builtins.md`: record this decision, replace
  the four-row table with the full list above, and set Status to closed once the
  three edits below have landed.
- `scripts/check-examples.mjs`: add `'spec'` to `SOURCES` and delete the comment
  block above it that explains why `spec` is absent. **This edit comes last**, after
  the `language.md` and `errors.md` renames, or the build fails in between.
- None of the replacement names above is in the global scope: they were checked
  against the same list the checker builds from `stdlib.md` and `language.md`.

---

## What the verifier got wrong or did not reach

- **B3, the example 12 citation.** Line 92 of
  `examples/12-strategy-short-premium.oscript` passes a per-bar ternary as
  `signal`'s **text**, not as its `at`. The conclusion stands and is the reason
  `"auto"` cannot be folded, since `"auto"` reads the text, but the line does not
  show a per-bar `at`. Example 02 line 65 is the same shape.
- **M6 is not a documentation defect.** The verifier filed it as a missing
  warning in the surprises list. The table itself is wrong: it contradicts its own
  document's definition of `none` as "unknown", and decision 16 changes the cell
  and adds an instruction rather than documenting the anomaly.
- **M12 is larger than the issue says.** The shadowing check, pointed at `spec/`,
  reports 27 declarations: seven in `language.md` against the issue's four, and
  thirteen in `errors.md`, which the issue does not mention at all and which carry
  into `errors.json`. The remaining seven reports are in blocks the checker
  already treats as deliberate.
- **Not on the list: OS6012 against `stdlib.md` 3.4.** The catalogue says that a
  fact the host did not supply, naming tick size and lot size among them, is an
  error, while `stdlib.md` 3.4 says a bare read of `chart.tickSize` is absent and
  `stdlib.md` 8.1 says `roundToTick` returns absence on the strength of it. Both
  cannot be true of the same read. The likely settlement is that OS6012 belongs to
  a call that cannot default the fact, such as a session or calendar call missing
  a timezone, and never to a bare read, but it is a separate question from S3 and
  belongs in an issue of its own rather than being decided here in passing.
- **Not on the list: the object lifetime disagreement** recorded in
  `feature-matrix.md`'s preamble is still open, and decision 4 deliberately leaves
  that paragraph in place while deleting the marker one beside it.

---

## Change index by file

Each file, and the decisions that touch it. The decisions hold the detail.

| File | Decisions |
|---|---|
| `spec/language.md` | 1, 5, 15, 16, 17, 21, 22 |
| `spec/stdlib.md` | 2, 3, 4, 5, 6, 7, 12, 14, 17, 21 |
| `spec/compiled-program.md` | 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 16 |
| `spec/conformance.md` | 7 |
| `spec/errors.md` and `spec/errors.json` | 1, 9, 13, 22 |
| `spec/feature-matrix.md` | 1, 2, 3, 4, 7, 9, 10, 14, 15, 16, 18, 21 |
| `examples/01-ema-cross.oscript` | 2 |
| `examples/03-anchored-vwap.oscript` | 20 |
| `examples/README.md` | 2, 19 |
| `issues/0001-spec-examples-shadow-builtins.md` | 22 |
| `scripts/check-examples.mjs` | 22, last edit of all |

---

# Single sourcing

Decisions 1 to 22 each fixed a contradiction and left the copy that produced it
in place. The count did not fall, because synchronising two copies is not a fix:
two readable copies of one fact drift again the moment either is edited, and
round three proved it twice over when two agents, each obeying its file ownership
exactly, wrote an order status vocabulary and a fill fold independently.

This part does something different. It does not reconcile copies. It assigns each
duplicated fact one home and turns every other appearance into a citation.

**The test.** If a fact changed, would the specification stay true only if two
files were edited? Then one of those two is a copy, and it becomes a citation.

**What a citation is.** A citation names a document and a section and says
nothing about what is in it: "the order status vocabulary of `stdlib.md` section
17.7". A sentence that summarises what it cites is still a copy, because a
summary can be wrong on its own. "the six status words of `stdlib.md` section
17.7" is a copy: it states a count, and the count can go stale.

**How a home is chosen.** Three rules, in this order.

1. `language.md` fixes the shape of the language, so a list of what a script may
   write, and where it may write it, lives there.
2. `compiled-program.md` is the contract a second engine reads, so a
   representation, a field name, a wire value and an encoding live there.
3. Where a fact is about the boundary and nothing else, and never appears in a
   compiled program, `host-interface.md` owns it.

Two clauses that keep the rules workable:

- **The catalogue clause.** `stdlib.md` is the catalogue of callable names, and
  `errors.md` is the catalogue of codes. A catalogue may carry a one-line gloss
  per entry so that it is usable as a catalogue. A gloss is never where a rule is
  stated, it never carries a count or a value set, and where a gloss and its home
  disagree the home wins and the gloss is the defect.
- **The checklist clause.** A conformance checklist (`host-interface.md` 10,
  `compiled-program.md` 13, `conformance.md` 12) may name a duty and cite its
  section. It may not restate the duty's content in different words, because a
  checklist written in different words is the copy that drifts first.

Part one below is the home register. Part two settles the questions that were
hiding inside the duplications, as decisions 23 to 37.

---

## Part one: the home register

Every fact that currently appears in more than one specification document, its
one home, the exact citation every other document uses, and why the home is
where it is.

### H1. The order lifecycle status vocabulary

**Fact.** The words an order's status may take, which of them are terminal, and
which of them a host may send in a frame.

**Home.** `stdlib.md` 17.7.

**Why.** The vocabulary is what `order.status(tag)` returns, and by
`feature-matrix.md`'s own precedence rule `stdlib.md` is authoritative about a
function. The set a script sees is the larger of the two sets (decision 23), so
it is the set that has to be written out once; the host's set is that set with
one word removed, which a column states without a second table.

**Copies to replace.** `host-interface.md` 7.3, the six-row table.

**Citation.** "The status words, and which of them are terminal, are the
vocabulary of `stdlib.md` section 17.7."

### H2. The fold of an order frame

**Fact.** The algorithm that turns a frame into a change to a ledger row and a
settled fill.

**Home.** `stdlib.md` 17.8.

**Why.** The fold can only be written in the field names of the ledger row, which
`stdlib.md` 17.7 owns, and its result is what every `pos`, `leg` and `book` read
reports, which are library functions. It is also declared a conformance area with
vectors of its own, and a conformance area needs its steps numbered in one place.

**Copies to replace.** `host-interface.md` 7.4, the five numbered steps and the
paragraph after them.

**Citation.** "An engine folds a frame exactly as `stdlib.md` section 17.8 folds
one."

### H3. A frame is cumulative, not a delta

**Fact.** Every frame restates the whole life of the order rather than what
changed since the last frame.

**Home.** `host-interface.md` 7.2.

**Why.** It is a duty on the host, about what a host must put in a frame, and it
is about the boundary and nothing else. The fold depends on it but does not
decide it.

**Copies to replace.** `stdlib.md` 17.8, the opening bold sentence;
`host-interface.md` 10.2, the bullet beginning "That a frame may be a partial
restatement" (checklist clause).

**Citation.** "A frame is cumulative, under `host-interface.md` section 7.2."

### H4. The order frame's field set

**Fact.** The named facts a frame carries, and their types.

**Home.** `host-interface.md` 7.2.

**Why.** A frame never appears in a compiled program and never appears in a
script. It is the boundary shape and nothing else.

**Copies to replace.** None today. `conformance.md` 3 acquires one under decision
31 and cites rather than restates.

**Citation.** "The fields of a frame are the ones `host-interface.md` section 7.2
names."

### H5. The order intent's field set

**Fact.** The named facts an intent carries, and their types.

**Home.** `host-interface.md` 7.1.

**Why.** Same as H4, in the other direction.

**Copies to replace.** None, once the `side` and `type` rows cite H13 for their
value sets.

**Citation.** "The fields of an intent are the ones `host-interface.md` section
7.1 names."

### H6. The ledger row's field set

**Fact.** The fields of one row of a strategy's order and fill ledger.

**Home.** `stdlib.md` 17.7.

**Why.** The ledger is the strategy's own state, five library calls read it by
name, and it is not a wire shape. The catalogue of what a script can read is
`stdlib.md`'s.

**Copies to replace.** `host-interface.md` 7.5, the first paragraph, which lists
the row's contents in prose.

**Citation.** "The run keeps the ledger of `stdlib.md` section 17.7."

### H7. The position reference

**Fact.** That every order carries a reference to the position it settles
against, when one is minted, when it ends, and why a late fill settles its own
position rather than the current one.

**Home.** `stdlib.md` 17.7.

**Why.** It is a ledger field and a rule about how fills fold into a position,
both of which live with the ledger. `host-interface.md` carries `positionRef` as
an intent field, which is H5, not this.

**Copies to replace.** `host-interface.md` 7.1, the note beginning "`positionRef`
exists because a flip holds two positions at once".

**Citation.** "`positionRef` is the position reference of `stdlib.md` section
17.7."

### H8. No position is computed against an account position

**Fact.** That a strategy folds its position from its own settled fills only,
that an account position is per instrument and shared, that it is reported as
shared and never divided, and why.

**Home.** `stdlib.md` 17.1.

**Why.** It is the position model of the language, and it is the rule that
`pos.isShared` and the whole of 17.4 rest on.

**Copies to replace.** `host-interface.md` 7.5, the second and third paragraphs;
`host-interface.md` 10.2, the bullet beginning "That the engine tracks an account
position" (checklist clause); `stdlib.md` 17.4, the `pos.isShared` paragraph,
which keeps the entry and cites the rule rather than restating it.

**Citation.** "The engine does not read the account's position, under
`stdlib.md` section 17.1."

### H9. What a strategy trades

**Fact.** One position per leg; a file that declares no leg has exactly one leg,
the instrument its chart is showing; every order names a leg and no order
function takes a symbol.

**Home.** `stdlib.md` 17.1.

**Why.** It is the position model, and `stdlib.md` is authoritative about the
functions that act on it.

**Copies to replace.** `host-interface.md` 9.3, the paragraph "Where version 1
stands"; `feature-matrix.md` 29, the rows "One net position" and "No order takes
a symbol"; `examples/12-strategy-short-premium.oscript` lines 29 to 35;
`examples/README.md` entry 12; `docs/reference/functions/strategy.md` 15 to 22;
`docs/first-strategy.md` 90 and 100; `docs/faq.md` 287. Every one of them is
stale as well as duplicated; decision 25 says what replaces the claim.

**Citation.** "A strategy trades the legs of `stdlib.md` section 17.1."

### H10. The leg declarations and the relative description

**Fact.** `leg.fixed` and `leg.relative`, their arguments, and what each field of
a relative description means.

**Home.** `stdlib.md` 17.6.

**Why.** The description's field names are argument names a script writes, so a
host refusing a resolution has to be able to name the argument the author typed.
One set of words, and the words are the ones in the source.

**Copies to replace.** `host-interface.md` 9.3, the seven-row table.

**Citation.** "A relative contract is described by the fields of `stdlib.md`
section 17.6."

### H11. A relative contract resolves once

**Fact.** That resolution happens once before bar 0, that the resolved identity
is persisted with the run, that a restart re-attaches rather than re-resolves,
that a new expiry is a new run, and that a host which cannot resolve refuses the
run.

**Home.** `host-interface.md` 9.4.

**Why.** Every clause is a duty on the host, about identity at the boundary, and
none of it appears in a compiled program.

**Copies to replace.** `stdlib.md` 17.6, the bold paragraph beginning "A relative
contract resolves exactly once" and the paragraph after it.

**Citation.** "A relative contract resolves once, under `host-interface.md`
section 9.4."

### H12. The trail

**Fact.** That a trail exists, how it is spelled, its arming, its ratchet, and
how it combines with a stop.

**Home.** `stdlib.md` 17.9.

**Why.** A trail is a rule evaluated every bar rather than a price an order rests
at, so it belongs with the protective levels and their evaluation order, not with
the order functions and not in the intent shape.

**Copies to replace.** `host-interface.md` 7.1, the words "its trail and the
trail offset"; `feature-matrix.md` 29, the row "`exit(...)` brackets";
`docs/reference/functions/strategy.md` 111, 177 and the worked call at 186;
`docs/first-strategy.md` 97 and 220.

**Citation.** "A trailing stop is `leg.trail` of `stdlib.md` section 17.9."

### H13. The `side` and `type` value sets

**Fact.** What `side` may be, what `type` may be, and how `type` follows the
prices given.

**Home.** `stdlib.md` 17.2.

**Why.** They are argument value sets of the order functions, written where a
script author reads. 17.2 already fixes the correspondence between the prices
given and the order produced, so the sets belong beside it.

**Copies to replace.** `host-interface.md` 7.1, the `side` and `type` rows and
the note "type follows the prices"; `docs/reference/functions/strategy.md`, the
`order.place` entry.

**Citation.** "`side` and `type` take the values of `stdlib.md` section 17.2."

### H14. Which calls are top level only, and which may appear anywhere

**Fact.** The two placement lists.

**Home.** `language.md` 15.3.

**Why.** Where a script may write a call is a rule of the language's shape, which
is what `language.md` fixes. Decision 17 put it there once already, and a third
list appeared because two other documents kept their own copies.

**Copies to replace.** `stdlib.md` 14.1, both lists and the sentence "This is the
same split as `language.md` section 15.3, stated with both lists complete";
`errors.md` and `errors.json` OS3006, the `{name}` placeholder gloss, which is a
value set and therefore not covered by the catalogue clause.

**Citation.** "The calls that are top level only are the ones `language.md`
section 15.3 lists."

### H15. The namespace list

**Fact.** Which namespaces the library has.

**Home.** `language.md` 15.2.

**Why.** `language.md` 15 states in its own preamble that what it fixes is the
shape of the library, and a closed list of namespaces is that shape.

**Copies to replace.** `stdlib.md` 2.1, the sentence listing twelve namespaces,
which keeps only the rule about when a name is bare and the note that `leg` and
`book` exist only in a `strategy()` file.

**Citation.** "The namespaces are the ones `language.md` section 15.2 lists."

### H16. The instrument record

**Fact.** The facts a host states about the instrument, their types, which is
required, and what a script sees when one is absent.

**Home.** `host-interface.md` 4.1.

**Why.** The record is handed over at the boundary, it never appears in a
compiled program, and 4.1 already carries four columns of per-fact detail that no
other copy carries. This supersedes the placement in decision 6; the substance of
decision 6 is unchanged.

**Copies to replace.** `compiled-program.md` 5.2, the row beginning "Instrument
facts", which becomes one citation and stops enumerating; `conformance.md` 3, the
lead-in to `instrument.json`; `conformance.md` 2, the `instrument.json` row of
the file table; `host-interface.md` 2, the duty 2 row (same document, cites its
own 4.1); `stdlib.md` 3.4, the sentence decision 6 added, which stops naming the
ten and cites 4.1 instead.

**Citation.** "The instrument record is the one `host-interface.md` section 4.1
defines."

### H17. The session

**Fact.** That the session is the host's, its shape, and that the scheduled close
is what `session.isLastBar` rests on.

**Home.** `host-interface.md` 4.3.

**Why.** It is part of the instrument record, so it goes where the record goes.
`stdlib.md` 12.4 keeps the calls that read it, which is the catalogue clause.

**Copies to replace.** `conformance.md` 3, the session line of the defaults,
which keeps the default value and cites 4.3 for the shape; `stdlib.md` 12.4, the
opening sentence, which cites rather than restating where a session comes from.

**Citation.** "The session is the instrument record's session, `host-interface.md`
section 4.3."

### H18. The bar state the host states, and what each fact means

**Fact.** The four facts the host states, the four the engine derives, and the
meaning of each.

**Home.** `language.md` 7.2.

**Why.** It is the per-bar execution model, which `language.md` owns, and
decision 5 already settled the split there. `host-interface.md` 6.4 keeps the
host's obligations, which are duties and not meanings.

**Copies to replace.** `host-interface.md` 6.1, the two tables, which become a
citation plus the host's own obligations; `host-interface.md` 6.2, the phrase
"how many times the bar has been handed over"; `stdlib.md` 3.3, the sentence
"Defined in `language.md` section 7.2 and repeated here so the catalogue is
complete", which becomes a plain citation under the catalogue clause.

**Citation.** "The bar facts, and which of them the host states, are
`language.md` section 7.2's."

### H19. What an engine reads from the host

**Fact.** The closed list of what an engine reads, and that it reads nothing
else.

**Home.** `compiled-program.md` 5.2.

**Why.** It is what a second engine implementer needs in one closed list. The
list stays; what changes is that its instrument facts row cites H16 rather than
enumerating, which is what let the session go homeless.

**Copies to replace.** `feature-matrix.md` 33, the row "What the host supplies",
whose "and nothing else" turns a gloss into a closed list; `host-interface.md` 2,
the duties table, which is the same list cut a different way and cites it.

**Citation.** "An engine reads what `compiled-program.md` section 5.2 lists and
nothing else."

### H20. The documents that make up the specification

**Fact.** Which documents there are, what each holds, and which wins where two
disagree.

**Home.** `spec/README.md`.

**Why.** It is the page a reader lands on when they open `spec/`, and listing the
documents is its whole job. Three lists of the documents is how a whole document
became unreachable.

**Copies to replace.** `feature-matrix.md`, the section "Documents a row may
cite", which keeps only its own rule (a row may cite any document in that list,
and a citation to a document that does not exist fails the build) and the
precedence paragraph moves out; `docs/README.md`, the specification table;
`language.md` 1 and `host-interface.md` 1, the sentences about the catalogue
winning.

**Citation.** "The specification's documents are the ones `spec/README.md`
lists."

### H21. An error code's message, cause, fix and placeholders

**Fact.** The text of a code.

**Home.** `errors.md`, with `errors.json` as the same entry in machine form.

**Why.** Already the rule, by `language.md` 1 and 16. It is listed here because
two sections now state a code's scope in their own words, which is the same
failure with a different shape.

**Copies to replace.** `stdlib.md` 17.3, the sentence "An unknown tag in any of
them is OS7009, on the same ground as `cancel`", which states a code's scope;
`stdlib.md` 17.14, which lists four refusals with no code and is correct as a
list of rules, and gains one line saying it states rules and never text.

**Citation.** "OS7009, whose scope is the one `errors.md` gives it."

### H22. A conformance case's file set

**Fact.** Which files a case directory may hold and what each supplies.

**Home.** `conformance.md` 2.

**Why.** The suite's layout is the suite document's, and a runner reads exactly
one list.

**Copies to replace.** `feature-matrix.md` 34, the rows that describe file
contents rather than naming them; `stdlib.md` 17, the conformance-area paragraph,
which cites rather than promising vectors in its own words.

**Citation.** "A case supplies it from the case directory, `conformance.md`
section 2."

### H23. The declaration's options and their defaults

**Fact.** The options a `study()` or `strategy()` declaration takes and each
one's default value.

**Home.** `language.md` 13.2 and 13.3.

**Why.** A declaration is a statement of the language. `compiled-program.md` 2.3
owns the field names, their types and the rule that the compiler writes every
option with its effective value, which is the representation.

**Copies to replace.** `compiled-program.md` 2.3, the `"strategy"` JSON sample,
which gains a lead-in naming it an illustration of the defaults of `language.md`
13.3; `stdlib.md` 17.1, the sentence that names `fillOn`'s default value.

**Citation.** "The declaration's options are the ones `language.md` section 13.3
lists, with the defaults it gives them."

### H24. A declared default's effective value in the compiled program

**Fact.** That every option and every declaration field is written with its
effective value, defaults included.

**Home.** `compiled-program.md` 2.3.

**Why.** It is a rule about the representation.

**Copies to replace.** None, but two places break it: `compiled-program.md` 2.8's
`plots[].scale` has no default column at all and 12.2 writes `"scale": null` for
a plot whose argument default is `"right"`. Decision 36 rules on it.

**Citation.** "Written with its effective value, under `compiled-program.md`
section 2.3."

---

## Part two: the questions inside the duplications

## 23. (D1) Are the script-facing and host-facing status vocabularies one set or two?

**Question.** `host-interface.md` 7.3 fixes six words and `stdlib.md` 17.7 fixes
six different ones, one of which does not exist on the other side and two of
which are the same state spelled differently. Is there one vocabulary or two, and
if two, who owns the mapping?

**Decision.** **One vocabulary of seven words, with one home, and no mapping
table anywhere.** The words are:

| Word | Means | Terminal | A host may send it |
|---|---|---|---|
| `placed` | Sent, and the destination has not answered yet | No | No |
| `working` | Live at the destination and not completely filled | No | Yes |
| `triggerPending` | Accepted and waiting for its trigger price | No | Yes |
| `filled` | The whole quantity is filled | Yes | Yes |
| `cancelled` | Ended by a cancellation | Yes | Yes |
| `rejected` | Refused, carrying the destination's own text | Yes | Yes |
| `expired` | Ended without filling, by the destination's own rule | Yes | Yes |

The script-facing set and the host-facing set are not the same set, and the
difference is exactly one word. `placed` is a fact only the engine holds: it
means an intent has left and nothing has come back, and a host cannot report a
state the destination has not described. Every other word is a state the
destination reports and a script reads, with one spelling on both sides.

There is a mapping, and it has one owner: **a destination's own words are mapped
onto these seven by the host's adapter**, which is where `host-interface.md` 7.3
already puts it and where `stdlib.md` 17.7 also says it belongs. There is no
second mapping between the language and the boundary, because there is nothing
left to map.

Where the spellings conflicted, `host-interface.md`'s win: `working` over `open`
and `filled` over `complete`. Not for seniority. `stdlib.md` 17.3 already
publishes `order.working(tag)` for "live and unfilled" and `order.filled(tag)`
for the filled quantity, so choosing `open` and `complete` would have made
`order.working()` true on a status called `"open"` and `order.filled()` a
quantity on a status called `"complete"`, in one document, about one order.

`expired` is one of the seven rather than something mapped onto cancellation. A
day order that reached the close without filling and an order a person cancelled
are different events, the report has to name which, and a vocabulary that cannot
tell them apart makes the adapter throw away the only copy of that fact.

**Why one set rather than two.** The argument for two is real: what a script
observes and what a host reports need not coincide, and here they genuinely do
not, by one word. But a second set of *spellings* buys nothing and costs a
mapping table that two documents would then both have to hold, which is the
defect this part exists to end. One set with a column saying who may send each
word carries the same information in one place.

**Changes required.**

- `stdlib.md` 17.7, the paragraph headed **Statuses**: replace it with the table
  above, four columns as written, and keep the sentence that a destination with
  words of its own maps them in its adapter. Delete the sentence naming `expired`
  as an example of a word to be mapped. Delete the two sentences beginning "A
  status is terminal when it is one of the last three" and "The engine sends no
  further frame of a terminal order to the fold"; the first is the table's
  Terminal column and the second is decided by decision 24.
- `stdlib.md` 17.3, the `order.status(tag)` row: no change, it already cites
  17.7.
- `host-interface.md` 7.3: delete the six-row table and replace the section body
  with the citation of H1, followed by the two host rules it already carries, in
  their existing words: a partial fill is a quantity and not a status, and a
  status the host cannot map is reported as the nearest non-terminal word with
  the destination's own words in `text`, never as a terminal one. Delete the
  bullet "Terminal is one way", which is decision 24's step 4.
- `host-interface.md` 7.2, the `status` row: "One word the host may send, from
  the vocabulary of `stdlib.md` section 17.7."
- `host-interface.md` 10.1, duty 7: replace "uses the vocabulary of section 7.3
  or maps its own onto it" with "uses the vocabulary of `stdlib.md` section 17.7
  or maps its own onto it".
- `feature-matrix.md` 29: add one row after "`order.working`, `order.pending`":
  `| The status vocabulary | Seven words, one spelling each, of which six are ones a host may send and one is the engine's own | `specified` | `stdlib.md` 17.7 | `order/status-vocabulary` |`

---

## 24. (D2) The match key, the field name, and a fill that arrives after a terminal status

**Question.** `host-interface.md` 7.4 matches a frame by intent id and
`stdlib.md` 17.8 locates the row by the destination's own order id; one calls the
average `avgPrice` and the other `avgFillPrice`; and they disagree about whether
a frame that arrives after a terminal status is folded at all.

**Decision, in three parts.**

**The match key is `intentId`.** A frame is located by the intent it names, and
the destination's own reference is recorded and never used as a key. The
destination's order id cannot be the key: a row sits at `placed` from the moment
the intent leaves until the destination first answers, and during that window the
row has no destination id, so the first frame of every order would find no row
and be refused. `intentId` exists on both sides from the beginning, is unique
within the run, and `host-interface.md` 7.2 already requires it on every frame.

To make that unambiguous in the ledger, the row's field named `id` is renamed
`orderRef`, which is the name the frame already uses for the same thing, and the
row gains `intentId` as its key. `order.id(tag)` keeps its name and returns
`orderRef`, because "the order id" is what a trader calls the destination's
reference and renaming a published call to tidy a field would cost more than it
buys. A row with `id` beside `intentId` is the ambiguity that produced this
defect, and the rename removes it.

**The field name is `avgFillPrice`, in the frame and in the row.** One name.
`avgPrice` is the wrong survivor: `pos.avgPrice` and `leg.avgPrice()` are already
the average price of an open position, which is a different number computed a
different way, and a name that already means something else in the same document
set will be read as that other thing.

**A frame that arrives after a terminal status is folded for its quantity, and
the status stays terminal.** `host-interface.md` is right and `stdlib.md` is
wrong, and this is the part that costs money.

A venue reports a fill after a cancellation acknowledgement whenever a cancel
races a fill: the order filled at the exchange, the cancel arrived afterwards and
was acknowledged against nothing, and the fill report follows. It is not an
exotic case; it is what a cancel sent near the touch does on a busy instrument.
An engine that refuses that frame has lost a real fill. The account holds a
position the strategy cannot see, every later `pos.size`, `leg.size()` and
`book.profit` is computed against the wrong quantity, the protective levels of
17.9 defend a position of the wrong size, and the end-of-day square off flattens
a quantity that does not match what is there. None of it is visible from inside
the script, because the script's own ledger says the order died before it filled.

Exactly what the engine does, stated so there is nothing to infer: a frame naming
a terminal row still runs steps 1, 2, 3, 5 and 6 of the fold, and does not run
step 4. The status keeps the terminal word it reached. `filledQty` rises,
`avgFillPrice` takes the frame's, `orderRef`, `sentProduct` and the rejection
text take the newest frame's, and the delta settles against the row's
`positionRef` like any other fill. A `cancelled` row whose cumulative quantity
has reached the order's full quantity stays `cancelled`: the status records how
the order ended and the quantity records what traded, and the two are both true.
The run's record says so out loud, with a named event, because a fill arriving
after the order was dead is precisely the thing a trader must be told.

**Why this way round.** The two failures are not symmetric. Folding a late fill
that was not real would require a destination to report a cumulative quantity it
never traded, which is a broken destination and a broken destination is visible.
Refusing a late fill that was real is invisible by construction, and it is
invisible on exactly the day a cancel raced a fill, which is a fast day.

**Changes required.**

- `stdlib.md` 17.7, the ledger table: rename the `id` row to `orderRef` with its
  existing gloss, and add above it a row
  `| `intentId` | The engine's own key for this order, unique within the run, carried on the intent and on every frame about it |`.
  Add to the `orderRef` gloss: `""` until the destination has answered.
- `stdlib.md` 17.7, the `avgFillPrice` row: no change, this is the surviving
  name.
- `stdlib.md` 17.8, step 1: replace with
  "**Locate.** `f` names a row by `intentId`. A frame that names no row in this
  strategy's ledger is refused and recorded, and nothing is folded. It is not an
  order this strategy placed. The destination's own reference is recorded from
  the frame and is never used to find a row, because a row has none while it is
  `placed`."
- `stdlib.md` 17.8, step 4: replace the last sentence "A terminal status is never
  left" with "A terminal status is never left, and a frame arriving at a terminal
  row does not run this step at all: see below."
- `stdlib.md` 17.8, after step 7: add a paragraph headed **A fill after a
  terminal status** carrying the four sentences of the decision above, beginning
  "A frame naming a terminal row still runs steps 1, 2, 3, 5 and 6" and ending
  with the `cancelled` row that stays `cancelled`, and one sentence naming the
  event.
- `stdlib.md` 17.11, the event table: add
  `| `fillAfterTerminal` | A frame increased an order's filled quantity after the order had reached a terminal status, carrying the tag, the added quantity and the terminal word it arrived after |`.
  Add one sentence after the table: this one is not a rule's transition, and it is
  in the list because a fill the strategy could not have expected is the event a
  trader most needs named.
- `stdlib.md` 17.14: the first two bullets keep their wording; add a third for a
  frame naming no row at all, which is the same refusal reached by `intentId`.
- `host-interface.md` 7.4: delete the five numbered steps and the two paragraphs
  after them. The section becomes the citation of H2, plus the host duties it
  alone states: a host must report at least every frame that changes an order's
  `status` or its `filledQty`, a host that reports only terminal frames is
  conforming and much less useful, and the paragraph headed "When a frame is
  folded" about the bar boundary, which stays here because it is about timing at
  the boundary.
- `host-interface.md` 7.2, the `avgPrice` row: rename to `avgFillPrice`, same
  gloss. The `intentId` row gains: it is the key the fold matches on
  (`stdlib.md` section 17.8).
- `host-interface.md` 7.6, the row "A frame arrives for an intent the engine does
  not know": change the citation from "section 7.4 rule 1" to `stdlib.md` 17.8
  step 1.
- `host-interface.md` 10.1, duty 7: no change beyond decision 23's.
- `feature-matrix.md` 29: add three rows after "`order.working`,
  `order.pending`":
  `| Folding an order frame | Cumulative frames folded once, whatever order they arrive in and however many times | `specified` | `stdlib.md` 17.8 | `order/fold-frame` |`
  `| A repeated or stale frame | Folds to no change: no fill, no event, no report row | `specified` | `stdlib.md` 17.8 | `order/fold-repeat` |`
  `| A fill after a terminal status | Folded for its quantity with the status left terminal, because a cancel can race a fill and dropping it leaves the account holding a position the strategy cannot see | `specified` | `stdlib.md` 17.8 | `order/fold-after-terminal` |`

---

## 25. (D3) Version 1 does name a contract

**Question.** `host-interface.md` 9.3 says no order function takes a symbol so a
version 1 strategy trades the instrument its chart is showing, and cites
`stdlib.md` 17.1 for it, while `stdlib.md` 17.6 defines `leg.fixed` and
`leg.relative` as version 1 calls. What replaces the claim?

**Decision.** The claim is wrong and is deleted everywhere. Half of it is still
true and the two halves must not be confused again:

- **True, and stays:** no order function takes a symbol. An order names a leg.
  The engine never parses a symbol and never builds one.
- **False, and goes:** that a strategy therefore trades only the instrument its
  chart is showing.

The replacement sentence, which is the one every stale site adopts, is:

> A strategy trades the legs it declared. A leg names a contract outright with
> `leg.fixed` or describes one with `leg.relative`, and the host resolves the
> description before bar 0; a file that declares no leg has exactly one leg, the
> instrument its chart is showing, and every order acts on it with no leg named
> (`stdlib.md` sections 17.1 and 17.6).

What is still planned, and what `host-interface.md` 9.3 keeps saying, is the
*chart-side* surface for describing a contract: `chart.expiry`, `chart.strike`
and `chart.optionType` are planned (`stdlib.md` 3.4), and a `symbol` input kind
is planned (`stdlib.md` 13.1). Those are not the leg calls and their being
planned says nothing about the leg calls.

**Why.** There is no judgement here. Two sections of one specification describe
the same version, one of them says a facility does not exist, and the facility is
defined three sections later in the same file. The only decision is which way the
correction runs, and a defined call outranks a sentence about what is absent.

**Changes required.**

- `host-interface.md` 9.3, the paragraph "Where version 1 stands": delete the
  clause "and no order function takes a symbol, so a version 1 strategy trades
  the instrument its chart is showing (`stdlib.md` section 17.1)". Replace with
  "and a strategy names its contracts with the leg declarations of `stdlib.md`
  section 17.6, which this section's resolution shape is what a host answers."
  Keep the sentence about `chart.expiry`, `chart.strike`, `chart.optionType` and
  the `symbol` input unchanged.
- `feature-matrix.md` 29, the row "One net position": retitle to "One position
  per leg" and rewrite the What-it-is cell as "A strategy holds one position per
  declared leg, no order crosses zero, and a file that declares no leg has one
  leg, the chart's instrument". Section cell `stdlib.md` 17.1. Test identifier
  unchanged (`order/net-position`).
- `feature-matrix.md` 29, the row "No order takes a symbol": rewrite the
  What-it-is cell as "An order names a leg, never a symbol; the engine neither
  parses nor builds one". Section cell `stdlib.md` 17.1, `stdlib.md` 17.6. Test
  identifier unchanged (`order/no-symbol`).
- `feature-matrix.md` 29: add two rows after them:
  `| `leg.fixed`, `leg.relative` | Declare the contract a leg trades, outright or by description, top level only and resolved before bar 0 | `specified` | `stdlib.md` 17.6 | `order/leg-declaration` |`
  `| A description the host cannot resolve | OS6007 before the first bar, and the strategy does not start | `specified` | `stdlib.md` 17.6, `errors.md` OS6007 | `unit:order/leg-unresolvable` |`
- `docs/reference/functions/strategy.md` 15 to 22: replace the "one net position"
  paragraph with the replacement sentence above, and add a short section for the
  leg calls citing `stdlib.md` 17.6.
- `docs/first-strategy.md` 90 and 100: the same replacement sentence, once.
- `docs/faq.md` 287: the answer to "Can I hold a long and a short at the same
  time?" becomes yes, on two legs, and no, on one: a leg holds one position and
  no order crosses zero, and two opposite positions are two legs. Cite
  `stdlib.md` 17.1.
- `examples/README.md` entry 12: delete the sentence beginning "This is the
  script that found the version 1 boundary on orders" and the sentence after it.
  Replace with: this script trades one leg on its chart and routes the other from
  an alert, which is one of two shapes; a strategy that wants both legs in its own
  ledger declares them with `leg.relative` and enters them as a unit
  (`stdlib.md` sections 17.6 and 17.12).
- `examples/12-strategy-short-premium.oscript` lines 28 to 35: replace the
  comment with one that states the script's own reason and claims no boundary:
  a leg the chart does not show has no bar series of its own, so a backtest of it
  has to be given one, and this script therefore trades the chart's leg and routes
  the other from an alert; a strategy that wants both legs in its own ledger
  declares them with `leg.relative` (`stdlib.md` section 17.6). Change the
  "Exercises" line at the top of the file in the same way: delete "the single
  instrument order model at its limit" and write "a one-leg strategy whose signal
  is computed from a second instrument". No code in the file changes.
- No change to `docs/strategies/*.md` under this decision beyond what the same
  sentence requires; whoever owns `docs/` greps for "one net position" and for
  "no order function takes a symbol" and applies the replacement sentence at
  every hit.

---

## 26. (D4) One trail, one spelling, one home

**Question.** `stdlib.md` 17.2 says there is no trail on an order, while five
other places give `trail` and `trailOffset` as bracket arguments and one gives a
trail as a field of a bracket intent.

**Decision.** **There is one trailing stop in the language and it is
`leg.trail(name, distance, arm = none)` of `stdlib.md` 17.9.** `trail` and
`trailOffset` are deleted from `exit()` and from `order.bracket()`, and a trail
is not a field of an order intent.

The old two arguments map onto the new two exactly: `trail` is `distance`, the
amount the level follows behind the best price, and `trailOffset` is `arm`, the
profit at which the trail starts following. A worked call written
`exit(trail = 20, trailOffset = 5)` is written `leg.trail(distance = 20, arm = 5)`
in a file with one leg.

**Why it lives there.** A stop and a target are prices an order can rest at, so a
destination can hold them and a host can implement a bracket with resting orders.
A trail is not a price; it is a rule that recomputes a price on every bar from
the best price seen since arming. It cannot be handed to a destination as a
number, the engine has to evaluate it, and section 17.10 already fixes exactly
when in the bar it is evaluated and in what order against the other rules. A
trail listed as a bracket argument promises a host something the host cannot
implement and the engine will do anyway.

**Changes required.**

- `stdlib.md` 17.2: no change. It already states the rule and points at 17.9.
- `stdlib.md` 17.9, the `leg.trail` row: no change.
- `host-interface.md` 7.1, the note "A bracket is an instruction, not an
  implementation": replace "carrying its target, its stop, its trail and the
  trail offset (`stdlib.md` sections 17.2 and 17.3)" with "carrying its target
  and its stop (`stdlib.md` section 17.2)". Add one sentence: a trailing stop is
  never part of a bracket intent, because it is a rule the engine evaluates every
  bar rather than a price an order can rest at (`stdlib.md` section 17.9); what
  reaches the host when a trail is hit is an ordinary exit order.
- `feature-matrix.md` 29, the row "`exit(...)` brackets": rewrite the What-it-is
  cell as "A target or a stop, as absolute prices or as distances from the entry"
  and delete "or a trailing stop".
- `feature-matrix.md` 29: add one row after it:
  `| Trailing stop | `leg.trail`, armed at a profit and ratcheting in the leg's favour only, evaluated every bar rather than resting at a destination | `specified` | `stdlib.md` 17.9, `stdlib.md` 17.10 | `order/trailing-stop` |`
- `docs/reference/functions/strategy.md` 111: the `exit` signature loses `trail`
  and `trailOffset`, and its parameter list loses the two lines.
- `docs/reference/functions/strategy.md` 177 and the worked call at 186: the
  `order.bracket` signature loses `trail` and `trailOffset`; the worked call
  `order.bracket(trail = atr(14) * 2, trailOffset = chart.tickSize)` becomes
  `leg.trail(distance = atr(14) * 2)`. Add a `leg.trail` entry to the page citing
  `stdlib.md` 17.9 for the ratchet.
- `docs/first-strategy.md` 97: delete the `trail, trailOffset` cell from the
  `exit` row of the call table.
- `docs/first-strategy.md` 220: delete the `trail`, `trailOffset` row from the
  bracket argument table and add a sentence naming `leg.trail` with its two
  arguments.

---

## 27. (D5) Which calls are top level only

**Question.** Three lists again, and OS3006's placeholder says the name it prints
can only be one of five, so an engine raising OS3006 on a leg prints a name the
catalogue says cannot occur and offers a fix that is not a fix for a leg.

**Decision.** `language.md` 15.3 owns both placement lists (H14). The top level
only list is **seven** calls under OS3006: `plot`, `plotCandles`, `fill`,
`level`, `table`, `leg.fixed` and `leg.relative`. `input` remains top level only
under OS3007. The anywhere list gains the protective levels: `signal`, `alert`,
`barColor`, `background`, `cell`, `clear`, `print`, the `draw` namespace, every
order function, every protective level of `stdlib.md` 17.9 and every strategy
shape call of `stdlib.md` 17.12.

OS3006's `{name}` gloss is a value set, not a gloss, so it is not covered by the
catalogue clause: it must list the same seven. Its cause gains the leg case and
its fix gains the leg's fix, which is not the plot's fix. You cannot hide a leg by
passing `none`: a leg is a contract the strategy trades, and the way to trade it
on some bars and not others is to declare it at the top level and decide per bar
whether to send it an order.

**Why `language.md`.** The catalogue is authoritative by `language.md` 1 and 16,
which means the catalogue's text wins over another document's text about a code.
It does not mean the catalogue decides the rule: a rule about where a script may
write a call is the language's shape. The right relationship is that
`language.md` 15.3 states the rule, and OS3006's text is edited to match it, in
one place, when the rule changes.

**Changes required.**

- `language.md` 15.3, the top-level-only sentence: the list becomes `plot`,
  `plotCandles`, `fill`, `level`, `table`, `leg.fixed` and `leg.relative`
  (OS3006), and `input` (OS3007). Add one clause: the two leg declarations exist
  only in a `strategy()` file, and the set of contracts a strategy trades is part
  of its fixed shape for the same reason the set of columns is
  (`stdlib.md` section 17.6).
- `language.md` 15.3, the anywhere sentence: add "every protective level and
  every strategy shape call of `stdlib.md` section 17" after "every order
  function".
- `stdlib.md` 14.1: delete both lists and the sentence "This is the same split as
  `language.md` section 15.3, stated with both lists complete". Replace the whole
  opening with the H14 citation and one sentence saying why a leg is on the top
  level list, which is 17.6's reason and is `stdlib.md`'s own. Keep the paragraph
  about declaration handles and runtime objects unchanged.
- `errors.md` OS3006, the `{name}` bullet: "one of plot, plotCandles, fill,
  level, table, leg.fixed or leg.relative".
- `errors.md` OS3006, cause: add one sentence. "A leg declaration is on the list
  for the same reason: the set of contracts a strategy trades is fixed before bar
  0, and a leg that existed on some bars and not others would leave the run's
  record with nothing to key on."
- `errors.md` OS3006, fix: add one sentence. "A leg is not hidden by passing
  none: declare it at the top level and decide per bar whether to send it an
  order."
- `errors.md` OS3006, Reference line: add `stdlib.md` 17.6.
- `errors.json`, entry OS3006: the same three edits to `placeholders.name`,
  `cause` and `fix`, and `spec` becomes "language.md 7.1, 15.3; stdlib.md 17.6".
- `feature-matrix.md` 15: add one row:
  `| A leg declared inside a block | OS3006, because the set of contracts a strategy trades is part of its fixed shape | `specified` | `language.md` 15.3, `stdlib.md` 17.6, `errors.md` OS3006 | `unit:order/leg-in-block` |`

---

## 28. (D6) The namespace list

**Question.** `language.md` 15.2 lists ten namespaces and `stdlib.md` 17 adds two
more with twenty-six entries between them.

**Decision.** `language.md` 15.2 is the closed list (H15) and it gains `leg` and
`book`, each marked as existing only in a `strategy()` file. `stdlib.md` 2.1
stops listing them.

**Why.** `language.md` 15 says in its own words that what it fixes is the shape
of the library. A namespace is that shape. A namespace that exists in the
catalogue and not in the shape is a namespace no second implementer knows to
build.

**Changes required.**

- `language.md` 15.2, the namespace table: add two rows in the order the table
  already uses, after `order`:
  `| `leg` | The contract each leg trades, and each leg's own position and protective levels, in a strategy |`
  `| `book` | Every declared leg taken together: the combined rules, the entry filters and the book's own profit, in a strategy |`
  Add one sentence after the table: `leg` and `book` exist only in a `strategy()`
  file, and calling one from a `study()` file is OS7001.
- `language.md` 15.2, the fenced example: no change.
- `stdlib.md` 2.1: replace the sentence listing twelve namespaces with the H15
  citation, keeping the rule that decides bare from namespaced and keeping the
  sentence that `leg` and `book` exist only in a `strategy()` file, which is
  `stdlib.md`'s own and is cited from `language.md` rather than repeated in it.
- `feature-matrix.md` 15, the row about namespaces if one exists, otherwise add:
  `| The namespace list | The closed list of namespaces, two of which exist only in a strategy file | `specified` | `language.md` 15.2 | `lib/namespaces` |`

---

## 29. (D7) The session's home

**Question.** `compiled-program.md` 5.2 says an engine reads all of a list from
the host and none of it from anywhere else, and the session is not on the list
and the word does not appear in the document; three other documents are built on
the session coming from the host.

**Decision.** The session is part of the instrument record, and the instrument
record's home is `host-interface.md` 4.1 (H16). `compiled-program.md` 5.2's list
stays closed and stays where it is, and its instrument facts row becomes a
citation of 4.1 rather than an enumeration, which is what left the session with
nowhere to be listed.

**Why not the other way round.** `compiled-program.md` 5.2's job is the closed
list of *channels* an engine reads: bars, bar state, settings, the instrument
record, the chart clock, more bars on request, a drawing surface, an order route.
That list is the engine contract and it belongs there. The *contents* of the
record, eleven facts with types, required-ness and absence behaviour, never
appear in a compiled program at all: they are handed over at the boundary, which
is what `host-interface.md` is for, and 4.1 is the only copy with the detail.
This supersedes the placement decision 6 made, not its substance.

**Changes required.**

- `compiled-program.md` 5.2, the table row beginning "Instrument facts": replace
  the whole cell with "The instrument record (`host-interface.md` section 4.1)",
  keeping the Used-by cell as it is.
- `compiled-program.md` 5.2, the paragraph after the table: keep the sentence
  about `chart.intervalMinutes` and `chart.isIntraday` being derived, and delete
  the clause that restates which facts are absent when the host does not state
  them, which is 4.1's Required column.
- `host-interface.md` 4.1, the lead sentence: replace "Ten facts, plus the
  session. The ten are the list in `compiled-program.md` section 5.2; the session
  is the fact `stdlib.md` section 12.4 reads and OS6012 names" with "Eleven
  facts. This table is where they are defined; `compiled-program.md` section 5.2
  names the record as one of the things an engine reads from the host."
- `host-interface.md` 2, the duties table, duty 2: "The instrument record,
  section 4.1" in place of "Ten facts about the instrument, plus its session".
- `stdlib.md` 3.4, the sentence decision 6 added: replace with "Every fact here
  comes from the instrument record (`host-interface.md` section 4.1);
  `chart.intervalMinutes` and `chart.isIntraday` are derived by the engine from
  the interval string rather than supplied."
- `stdlib.md` 12.4, the opening sentence: "The session is the instrument record's
  session (`host-interface.md` section 4.3), not a window the script invents."
- `conformance.md` 2, the `instrument.json` row: "Instrument facts: the record of
  `host-interface.md` 4.1. Defaults in section 3."
- `conformance.md` 3, the lead-in to `instrument.json`: keep the default block
  exactly as it is, and replace the sentence that explains which facts the block
  holds with the H16 citation. The defaults themselves are `conformance.md`'s own
  and stay.
- `errors.md` OS6012, cause: replace "come from the host's instrument record, not
  from the bars" with "come from the instrument record (`host-interface.md` 4.1),
  not from the bars". `errors.json` the same.
- `feature-matrix.md` 33, the row "What the host supplies": see decision 36.

---

## 30. (D8) OS7009 against the ledger reads

**Question.** OS7009 says there is no working order tagged `{tag}` and its cause
says a tag names an order from placement until it fills, cancels or expires,
while `stdlib.md` 17.3 makes `order.rejection` and `order.avgFill` reads of a
finished order, which is the only time they have anything to say.

**Decision.** **Acting on a tag that names nothing is an error. Reading a tag
that names nothing is not.** OS7009 applies to a call that acts on an order:
`cancel(tag)`, and the planned `order.modify` and `order.oco`. It does not apply
to the seven reading calls.

A row stays in the ledger after it finishes. That is what the ledger is for: it
is append-only, it is the audit trail, and `order.rejection` and `order.avgFill`
exist to be read from a finished row. The reads therefore read a row at any
status, terminal included, and a tag naming no row at all returns the value each
entry already documents for "nothing yet": `order.working` false,
`order.id` `""`, `order.status` `""`, `order.filled` `0`, `order.avgFill` absent,
`order.rejection` `""`.

**Why the line falls there.** Acting on a tag that names nothing is a script that
believes an order exists when it does not, and it will keep believing it. Reading
is how a script finds out; a read that raised would mean a script could not ask
the question without already knowing the answer, and `order.working(tag)` would
be unusable as the guard that OS7009's own fix tells the author to write.

Where a tag names more than one row, because the same tag was used for a later
order, the reads read the most recently placed row carrying that tag. A tag is a
label a script reuses, not a key, and the most recent one is the only answer a
script can act on.

**Changes required.**

- `errors.md` OS7009, cause: replace the first sentence with "A tag names an
  order from the moment it is placed. Acting on a tag that names nothing is a
  script that has lost track of its own orders, and ignoring the call would leave
  it believing an order exists that does not." Add: "This code is for a call that
  acts on an order. The reading calls of `stdlib.md` section 17.3 read the
  ledger, which keeps a row after the order finishes, so a tag that names no row
  reads as the entry's documented empty value rather than raising."
  `errors.json` the same.
- `errors.md` OS7009, Reference line: add `stdlib.md` 17.3. `errors.json`'s
  `spec` the same.
- `stdlib.md` 17.3, the paragraph beginning "The five reading calls": it is seven
  calls, not five (`order.id`, `order.status`, `order.filled`, `order.avgFill`,
  `order.rejection`, `order.working`, `order.pending`). Replace the sentence "An
  unknown tag in any of them is OS7009, on the same ground as `cancel`" with:
  "They read the ledger at any status, terminal included, which is when
  `order.rejection` and `order.avgFill` have something to say. A tag that names
  no row reads as the entry's documented empty value; OS7009 is for a call that
  acts on an order, which is `cancel` and the two planned calls. Where a tag
  names more than one row, the reads read the most recently placed one."
- `stdlib.md` 17.3, the `order.id` row: the gloss becomes "The destination's own
  reference for that tag, `""` before the destination has answered", which is
  decision 24's rename.
- `feature-matrix.md` 29, the row "`cancel`, `cancelAll`": no change. Add one
  row:
  `| Reading a finished order | The ledger keeps a row after the order ends, so the reading calls read a terminal row and an unknown tag reads empty rather than raising | `specified` | `stdlib.md` 17.3, `errors.md` OS7009 | `order/ledger-reads` |`

---

## 31. (D9) Order frames in a conformance case

**Question.** `stdlib.md` 17 promises that 17.8 to 17.11 are a conformance area
with vectors of their own, and a case directory has no file that supplies order
frames, so there is no way to hand an engine a repeated frame, an out-of-order
frame or a fill after a terminal status.

**Decision.** A case directory gains an optional file, **`frames.csv`**, which
supplies order frames the way `bars.csv` supplies bars and `ticks.csv` supplies
intrabar updates. Its home is `conformance.md` 2 and 3 (H22).

```text
afterBar,intent,status,filledQty,avgFillPrice,orderRef,text
0,1,working,0,none,R1,
1,1,filled,25,101.5,R1,
1,1,filled,25,101.5,R1,
2,1,filled,40,101.75,R1,
```

- `afterBar` is the zero-based index of the bar after whose execution the frame
  is delivered, so the fold happens at a bar boundary before the next execution
  (`host-interface.md` section 7.2). Several rows may name one bar and are
  delivered in file order, which is how a case orders two frames that cross.
- `intent` is an ordinal, not an id: 1 is the first intent the run placed, 2 the
  second. A case cannot know the id an engine minted and must not depend on its
  spelling, so the runner maps the ordinal to the engine's own `intentId`. An
  ordinal greater than the number of intents the run placed is how a case
  exercises a frame naming an order the ledger does not hold.
- `status` is one word a host may send, from the vocabulary of `stdlib.md`
  section 17.7.
- `filledQty` is cumulative. `avgFillPrice` is absent as `none`, written as
  `bars.csv` writes an absent field.
- `orderRef` and `text` are optional columns; an omitted column is absent on
  every row. Extra columns are an error, as in `bars.csv`.

The four rows above are the whole of what was missing: a working frame, a fill,
the same fill repeated, and a frame whose cumulative quantity rose after the row
had gone terminal. A case asserts the result through the `orders` channel of
`expected.json`, whose elements are ledger rows of `stdlib.md` 17.7 compared on
the fields the case names.

**Why a file rather than a script call.** Every byte of a case's input lives in
the case directory, and a frame is input. A case that produced its own frames
from a script would be testing the script, and the fold is exactly the thing that
has to be provable against input the engine did not choose.

**Changes required.**

- `conformance.md` 2, the file table: add a row after `ticks.csv`:
  `| `frames.csv` | no | Order frames delivered between bars, for a strategy case that asserts the fold |`
- `conformance.md` 3: add a subsection `### frames.csv` after "Intrabar updates",
  carrying the fenced sample above and the six bullets above, with the citation
  of H4 for the frame's fields.
- `conformance.md` 4, under `expected.json`: add one sentence naming the `orders`
  channel's element as a ledger row of `stdlib.md` section 17.7, compared on the
  fields the case names and no others.
- `stdlib.md` 17, the paragraph promising a conformance area: keep it and add the
  citation "a case supplies frames from its case directory (`conformance.md`
  section 3)", so the promise names the mechanism that keeps it.
- `feature-matrix.md` 34: add one row:
  `| Order frames | `frames.csv` in the case directory, delivered between bars, so a repeated frame, a crossed frame and a fill after a terminal status can each be handed to an engine | `specified` | `conformance.md` 2, `conformance.md` 3 | `conf/frames` |`
- `feature-matrix.md` 29: the three rows decision 24 adds carry test identifiers
  `order/fold-frame`, `order/fold-repeat` and `order/fold-after-terminal`, each
  of which is a case directory holding a `frames.csv`.

---

## 32. (D10) The `side` and `type` value sets

**Question.** `order.place` takes `side` and `type` and no section says what
either may be; `"stopLimit"` is spelled only in `host-interface.md` 7.1, as a
wire field rather than as an argument's value set.

**Decision.** Both sets are written in `stdlib.md` 17.2 (H13), where a script
author reads, and every other appearance cites them.

- `side` is `"buy"` or `"sell"`.
- `type` is `"market"`, `"limit"`, `"stop"` or `"stopLimit"`.

`type` and the prices agree or the call is refused: `"limit"` needs `price`,
`"stop"` needs `trigger`, `"stopLimit"` needs both, `"market"` takes neither. A
type that names a price it was not given is OS7007, which already exists for
exactly that. A value outside either set is OS3008, which is the code for a value
outside a fixed set and already names the accepted values in its message.

`order.place(side, ...)` is the only place a script writes a side as a value,
because `buy` and `sell` write it as a name. That is why the set has to be
written down: a script computing `side` has nothing else to check its string
against.

**Why `stdlib.md` 17.2 and not 17.3.** 17.2 already fixes the correspondence
between the prices given and the order produced, in the paragraph beginning "With
neither `limit` nor `stop`". Putting the value sets anywhere else would split one
fact across two sections of one document, which is the same defect at a smaller
scale.

**Changes required.**

- `stdlib.md` 17.2, after the paragraph beginning "With neither `limit` nor
  `stop`": add one short paragraph giving both sets, the agreement rule between
  `type` and the prices, and the two codes. Word it as a value set and not as a
  gloss: the accepted values, spelled, and nothing about what an engine does with
  them.
- `stdlib.md` 17.3, the `order.place` row: no change. Add to the paragraph after
  the table: "`side` and `type` take the values of section 17.2."
- `host-interface.md` 7.1, the `side` row: "The order's side
  (`stdlib.md` section 17.2)." The `type` row: "The order's type
  (`stdlib.md` section 17.2)."
- `host-interface.md` 7.1, the note "`type` follows the prices": replace the
  first sentence with the H13 citation and keep the second, which is the boundary
  fact: the field is stated anyway, so a host never has to infer it.
- `docs/reference/functions/strategy.md`, the `order.place` entry: name both
  value sets and cite `stdlib.md` 17.2.
- `feature-matrix.md` 29, the row "Limit, stop and stop-limit": add "`side` is
  buy or sell and `type` is market, limit, stop or stopLimit" to the What-it-is
  cell, or add one row:
  `| The side and type value sets | What `order.place` accepts, written where a script author reads; a value outside either is OS3008 | `specified` | `stdlib.md` 17.2, `errors.md` OS3008 | `order/side-and-type` |`

---

## 33. (D11) One shape for a relative contract

**Question.** `host-interface.md` 9.3 names seven fields and `stdlib.md` 17.6
takes nine arguments; some of the difference is spelling drift of one fact, three
fields exist on one side only, and the `right` enum genuinely differs.

**Decision.** One shape, one set of words, home `stdlib.md` 17.6 (H10). The
signature becomes:

```text
leg.relative(name, underlying, kind, expiryRank = 0, expiryCycle = none,
             strikeOffset = 0, right = none, reference = none,
             exchange = chart.exchange, product = the declaration's,
             qty = the declaration's, side = "buy")
```

Field by field, with the ruling and its reason:

| Field | Ruling | Why |
|---|---|---|
| `underlying` | Kept, an identity, opaque | Agreed on both sides |
| `kind` | Kept, required, `"future"` or `"option"` | It decides which of the other fields apply, so it is required and has no default, exactly as `meta.kind` is in a compiled program. Encoding it as `right = "none"` made a value of one field mean "a different kind of contract", which is how `right` ended up with three values on one side and two on the other |
| `expiryRank` | `expiry` is renamed to it | `leg.expiry(name)` already reads back the resolved contract's expiry, which is a date. One document cannot have `expiry` meaning a rank in one section and a date in another |
| `expiryCycle` | Kept, optional, absent means the venue's default series | A venue listing a weekly and a monthly series cannot be addressed by rank alone, and a script that must say which could not say it at all |
| `strikeOffset` | `strike` is renamed to it | Same reason as `expiryRank`: `leg.strike(name)` reads back a price |
| `right` | `"call"` or `"put"`, absent for a future | With `kind` explicit, `"none"` has nothing left to say |
| `reference` | Kept, optional, absent means the underlying's price at the moment of resolution | An offset measured from nothing is not an offset, and a script measuring from a settlement or a session open has no way to say so otherwise |
| `name`, `exchange`, `product`, `qty`, `side` | Kept, `stdlib.md`'s own | They are the leg's bookkeeping, not part of the contract's description, and no host field corresponds to them |

Giving `right` or `strikeOffset` with `kind = "future"` is OS3010, which is
already the code for two arguments that cannot both be given.

**Why the source's words and not the boundary's.** The description's fields are
argument names a script author types. When a host refuses a resolution with
OS6007 the message has to be able to name the argument the author wrote, and a
host that had its own seven words for the author's seven would be describing a
call nobody made. Where the two sides differed on spelling, the boundary's word
won every time except `name`, because in each case `stdlib.md`'s word was already
taken by a read of the resolved contract in the same section.

**Changes required.**

- `stdlib.md` 17.6, the `leg.relative` row: the signature above.
- `stdlib.md` 17.6, the paragraph beginning "`leg.fixed` names a contract the
  host already knows": rewrite the second half as the field-by-field meanings,
  using the words above, and keep the sentence about the engine never parsing or
  building a symbol.
- `stdlib.md` 17.6: add one sentence: `right` or `strikeOffset` with
  `kind = "future"` is OS3010.
- `stdlib.md` 17.6, the bold paragraph "A relative contract resolves exactly
  once" and the paragraph after it: replace with the H11 citation. The rule does
  not change; its home does.
- `host-interface.md` 9.3, the seven-row table: delete it and replace with the
  H10 citation, plus the sentence that already follows about what the host
  answers with and OS6007, and the paragraph beginning "Every field is stated in
  the contract's own terms", which is `host-interface.md`'s own argument for why
  the description is portable.
- `errors.md` OS3010, cause: add one sentence naming the third pair: a relative
  leg described as a future and given a right or a strike offset, which are
  fields of an option. `errors.json` the same.
- `feature-matrix.md` 29, the `leg.relative` row decision 25 adds: Section cell
  `stdlib.md` 17.6, `host-interface.md` 9.3, 9.4.

---

## 34. (D12) Reaching `host-interface.md`

**Question.** Nothing links to `host-interface.md`. `spec/README.md` says three
documents make up the specification, `docs/README.md` lists six spec files
without it, and `feature-matrix.md` says all five exist and names five. A reader
never learns it exists.

**Decision.** `spec/README.md` is the home for what the specification is (H20):
the documents, what each holds, and which wins where two disagree. Six documents
are the specification, `decisions.md` is the minutes and `feature-matrix.md` is
the index, and the README says which is which rather than counting to three.

Precedence, stated once and cited from everywhere else: `errors.md` wins about
the text of a code, `language.md` wins about a rule of the language, `stdlib.md`
wins about a function, `compiled-program.md` wins about a representation,
`host-interface.md` wins about the boundary, and `conformance.md` wins about the
suite. Where none of those settles it, the home register in `decisions.md` names
the owner.

**Why the README and not the matrix.** The matrix's table exists to support a
build check on citations, which is a rule about rows, and it acquired a count as
a side effect. The README's whole job is the list. A list whose job is something
else is the list that goes stale.

**Changes required.**

- `spec/README.md`: rewrite. The opening sentence names six documents and does
  not count to three in prose. The table gains a `host-interface.md` row
  ("Everything a platform supplies so an engine can run, and everything the
  engine hands back: the boundary") and a `stdlib.md` row, which is also missing
  today. Add two rows below the table for `decisions.md` (the minutes of every
  settled cross-document question, and the home register) and `feature-matrix.md`
  (what is specified, implemented or planned, one row per feature). Add the
  precedence paragraph. Note that `errors.json` is `errors.md` in machine form
  and not a document of its own.
- `feature-matrix.md`, the section "Documents a row may cite": delete "All five
  exist" and the six-row table. Keep the rule, rewritten: a row may cite any
  document `spec/README.md` lists, and a citation to a document that does not
  exist is a build failure. Replace the precedence paragraph with the H20
  citation.
- `docs/README.md`, the specification table near line 402: add a
  `host-interface.md` row, and replace whatever counts the files with the H20
  citation.
- `docs/README.md` line 416: the pointer to `spec/README.md` stays and is now
  the pointer that carries the list.
- `language.md` 1, "Error codes": keep the sentence that the catalogue is
  authoritative and replace the general precedence clause with the H20 citation.
- `host-interface.md` 1, "Error codes": the same.
- `CONTRIBUTING.md`: whoever owns the root files greps for a count of
  specification documents and applies the H20 citation at each hit.

---

## 35. (D13) `signal`'s colour in the colour guide

**Question.** `docs/visuals/colors.md` line 178 still gives
`signal(text, color)` a colour computed for that bar, which decision 3 removed.

**Decision.** The cell is wrong and is replaced. `signal`'s `color`, `at` and
`shape` are part of the marker's declaration and are fixed before bar 0; only the
text is read per bar. The per-bar column for that row reads "Not per bar: the
colour is part of the declaration (`stdlib.md` section 14.3)".

**Why.** It is not a judgement call: decision 3 settled it, the edit landed in
`stdlib.md` 14.3 and not in the documentation page, and a page that contradicts
the specification is a page with a bug by `docs/README.md`'s own rule.

**Changes required.**

- `docs/visuals/colors.md` 178, the `signal(text, color)` row: the Per bar cell
  becomes "Not per bar: `at`, `shape` and `color` are fixed before bar 0
  (`stdlib.md` section 14.3)". The Constant cell keeps "Marker plate".
- `docs/visuals/colors.md`: whoever owns `docs/` greps the page for any other
  sentence that offers a per-bar signal colour and applies the same correction.

---

## 36. (D14) Seven one-line rulings

**1. OS3012 cited for an omitted leg, but its cause names a study title and an
indicator source.** OS3012 is the right code, because a `leg` argument in a file
with more than one leg is a parameter with no default and no value the engine
could invent; its cause gains one sentence naming the leg as a third common case,
and `errors.json` the same.

**2. OS3017 cited for two legs sharing a name, but it is titled "two of these
share a title" and its cause is about legend rows.** OS3017 is the right code and
its wording is the defect: the heading becomes "Two of these share a name", the
message becomes `{kind} names must be unique in a file; {name} is also used at
line {line}`, the `{title}` placeholder is renamed `{name}`, `{kind}` gains
`leg`, and the cause gains one sentence: a leg's name is what every later call
keys on, so two legs with one name leave every `leg.` call with no answer. "Name"
is true of a plot's title and "title" is false of a leg, so one word covers both
and the other does not. `errors.json` the same, and `stdlib.md` 17.6's sentence
citing OS3017 keeps its wording.

**3. `plots[].scale` writes `null` while its stdlib default is `"right"` and 2.3
says defaults are written with their effective value.** The rule wins: the field
is `string` rather than `string?`, its default is `"right"`, and
`compiled-program.md` 12.2's worked example writes `"scale": "right"`. `overlay`
stays `bool?` with `null`, because `plot`'s `overlay` argument's default really is
`none` and `null` is its effective value.

**4. `feature-matrix.md` 33's "and nothing else" turns a short list into a closed
one.** The row's What-it-is cell becomes "The closed list of what an engine reads
from the host", with no enumeration and no "and nothing else", citing
`compiled-program.md` 5.2, which is where the closure is stated (H19).

**5. `host-interface.md` 10.1 cites OS5003 for a host duty when OS5003 is about a
script's limits budget.** The citation is correct and stays: OS5003 fires when a
host's ceiling is below what a file asked for, which is a host duty declared at
load. What is missing is which code covers which ceiling, so duty 5 gains one
clause: OS6006 for a capability tag, OS5003 for a `limits()` option above the
host's ceiling, OS5006 for outstanding requests above it. OS5003's Reference line
in `errors.md` gains `host-interface.md` 10.1, and `errors.json` the same.

**6. `bar.updates` is "handed over" in one place and "executed" in two others.**
"Executed" is the word, everywhere, because `bar.updates` is read from inside an
execution and a script can only count what it ran. `host-interface.md` 6.1's row
and 6.2's sentence adopt it, and 6.4 gains the obligation that makes the two
counts one number: the host increments `updates` once per hand-over, the engine
executes once per hand-over, and a host that hands a bar over without it being
executed does not increment it. The meaning's home is `language.md` 7.2 (H18).

**7. `spec/README.md` says three documents and `spec/` holds nine.** Decision 34
rewrites that page; this is the same edit and not a second one.

---

## 37. What the sweep turned up beyond D1 to D14

Five more, each already carried in the home register above, listed here so that
nobody has to rediscover them: the ledger row restated in prose in
`host-interface.md` 7.5 (H6), the position reference defined twice (H7), the
account-position rule argued at length in two documents (H8), the four stated bar
facts listed in three (H18), and the strategy option defaults written out in the
compiled format's sample (H23).

One thing the sweep exposed that this part does not settle, because it is a new
question rather than a duplicated fact: **a leg on a contract the chart does not
show has no bar series of its own.** `stdlib.md` 17.6 lets a strategy declare it,
`stdlib.md` 17.10 tests its stop against a bar's range, and nothing says where
that bar comes from in a backtest. It is not a contradiction between two
documents, so it is not a defect this part can close by assigning a home. It
needs an issue of its own and a decision after it, and until then nothing should
be written that assumes either answer.

---

## Applier index

Seven appliers, each owning its own files and nobody else's. A decision touching
two owners is listed under both, and the text to write is in the decision.

| Applier | Files | Decisions and register entries |
|---|---|---|
| 1 | `spec/stdlib.md` | H1, H2, H6, H7, H8, H9, H10, H12, H13, H15, H16, H17, H18, H21, H22, H23; 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33 |
| 2 | `spec/host-interface.md` | H1 to H13, H16, H17, H18, H19, H20; 23, 24, 25, 26, 29, 32, 33, 34, 36.5, 36.6 |
| 3 | `spec/language.md`, `spec/compiled-program.md` | H14, H15, H18, H19, H20, H23, H24; 27, 28, 29, 34, 36.3, 36.6 |
| 4 | `spec/errors.md`, `spec/errors.json` | H14, H21; 27, 29, 30, 33, 36.1, 36.2, 36.5 |
| 5 | `spec/README.md`, `spec/feature-matrix.md`, `spec/conformance.md` | H16, H17, H19, H20, H22; 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 36.4 |
| 6 | `docs/` | H9, H12, H13, H20; 25, 26, 32, 34, 35 |
| 7 | `examples/` | H9; 25 |

Two standing reminders, the same ones this file opens with: every change to a
per-code section of `errors.md` is the same change to the matching field of the
same entry in `errors.json`, and every `feature-matrix.md` row added here must
satisfy the five rules in that file's preamble, with a test identifier that
appears nowhere else. `npm test` passes after every edit.
