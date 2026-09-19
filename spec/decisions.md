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
