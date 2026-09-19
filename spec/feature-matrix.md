# Feature matrix

One row per language feature. Each row says what the feature is, whether it is
specified, implemented or planned, which specification section defines it, and
which test proves it.

**There is no completion percentage in this file.** The percentage is computed
and printed by continuous integration, which reads these tables, counts the rows,
counts the rows marked `implemented`, confirms that each of those rows names a
test that exists and passes, and prints the ratio. Nobody types a number, so
nobody can be optimistic about one. The build fails in three cases:

1. A row is marked `implemented` and the test it names does not exist, or exists
   and fails.
2. A conformance case exists that no row names. Coverage that no feature claims
   is coverage that proves nothing.
3. A row names a specification section that does not exist in a document that
   exists. A `planned` row may name a planned document; see the document table
   below.

## Status values

| Status | Means |
|---|---|
| `specified` | A specification section defines the behaviour completely. No implementation yet. |
| `implemented` | Specified, implemented, and the named test passes in the last CI run. |
| `planned` | Agreed as in scope for language version 1, but not yet written into a specification section. The section column names where it will be defined. |

Every row in this matrix is currently `specified` or `planned`, because the
compiler is not written yet. The first `implemented` row appears when a compiler
stage passes the test that row names, and not before.

`planned` is not a soft form of `specified`. A `planned` row means the design
question is still open in at least one detail, and that detail has to be decided
and written down before any code is written for it, because a rule that is
decided in code is a rule that two engines will decide differently.

## Specification documents cited

| Document | State |
|---|---|
| `language.md` | Exists. Syntax, types, scope, the per-bar model. |
| `compiled-program.md` | Planned. The instruction schema every engine reads. |
| `errors.md` | Planned. The error catalogue. |
| `conformance.md` | Exists. How the suite works and what passing means. |
| `library.md` | Planned. Generated per-function reference: signature, exact warmup, absence behaviour. |
| `surface.md` | Planned. The drawing surface: plots, fills, levels, bar colour, background, tables, drawing objects, alerts. |
| `strategy.md` | Planned. Orders, position, cost model, the performance report. |

## Test identifiers

A test identifier is `<area>/<name>`. That is also the path of the conformance
case directory, relative to the suite root, so a row in this table and a
directory on disk are the same string. `conformance.md` defines the case layout.

An identifier prefixed `unit:` is a compiler unit test rather than a conformance
case, used where the thing being proved is a diagnostic or a compiler-internal
invariant and there are no bars to run.

Areas: `lex`, `version`, `type`, `absent`, `bar`, `persist`, `expr`, `flow`,
`fn`, `scope`, `decl`, `input`, `array`, `str`, `math`, `color`, `ta`, `plot`,
`fill`, `level`, `barcolor`, `background`, `table`, `draw`, `time`, `session`,
`req`, `alert`, `order`, `pos`, `perf`, `err`, `log`, `prog`.

---

## 1. Lexical structure

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Source encoding | UTF-8 text, a leading byte order mark accepted and ignored | specified | `language.md` 3.1 | `unit:lex/encoding-bom` |
| Line ending normalisation | CRLF folded to LF before anything else, so one file compiles identically on any operating system | specified | `language.md` 3.1 | `unit:lex/line-endings` |
| Illegal character rejection | Anything outside the permitted set, including a non-breaking space or a typographic quote, is OS1001 at the character | specified | `language.md` 3.1 | `unit:lex/illegal-character` |
| Line comment | `//` to end of line, and not inside a string literal | specified | `language.md` 3.2 | `unit:lex/comment` |
| No block comment | The form does not exist, so an unterminated one cannot swallow a file | specified | `language.md` 3.2 | `unit:lex/no-block-comment` |
| Identifiers | ASCII letter or underscore, then letters, digits, underscores; case sensitive | specified | `language.md` 3.3 | `unit:lex/identifier` |
| Reserved words | The version 1 reserved list, including words reserved but unused | specified | `language.md` 3.4 | `unit:lex/reserved-words` |
| Decimal number literal | Integer, fractional, and a leading `.` with no digit before it | specified | `language.md` 3.5 | `lex/number-decimal` |
| Digit group separator | `_` between digits, carrying no meaning | specified | `language.md` 3.5 | `lex/number-underscore` |
| Exponent form | `2.5e-4` | specified | `language.md` 3.5 | `lex/number-exponent` |
| Hexadecimal literal | `0xFF`, with no octal and no binary form, so `010` is ten | specified | `language.md` 3.5 | `lex/number-hex` |
| Unary minus on a literal | A negative number is an operator applied to a literal, not part of it | specified | `language.md` 3.5 | `lex/number-negative` |
| String literal | Double or single quoted, the two forms identical | specified | `language.md` 3.6 | `lex/string-literal` |
| String escapes | `\\ \" \' \n \t \r \0 \uXXXX`, any other backslash sequence OS1004 | specified | `language.md` 3.6 | `lex/string-escapes` |
| Unterminated string | OS1004 reported at the opening quote, naming the missing delimiter | specified | `language.md` 3.6 | `unit:lex/string-unterminated` |
| Boolean literals | `true` and `false`, of type `bool`, never numbers | specified | `language.md` 3.7 | `lex/bool-literal` |
| Named colour literal | Nineteen bare names, no prefix | specified | `language.md` 3.8 | `lex/color-named` |
| Hex colour literal | `#rrggbb` and `#rrggbbaa` | specified | `language.md` 3.8 | `lex/color-hex` |
| Absent literal | `none`, written bare, with its own type | specified | `language.md` 3.9 | `lex/none-literal` |
| Newline terminates a statement | One statement per line, no separator; a `;` is OS1007 | specified | `language.md` 3.10 | `unit:lex/no-semicolon` |
| Indentation blocks | A header line and the more deeply indented lines under it | specified | `language.md` 3.10 | `lex/block-indent` |
| Spaces only | A tab in leading whitespace is OS1002, because a tab's width is an editor setting | specified | `language.md` 3.10 | `unit:lex/tab-indent` |
| Sibling indentation equality | Every line of one block carries identical leading whitespace, or OS1003 | specified | `language.md` 3.10 | `unit:lex/indent-mismatch` |
| Empty block | A header with no indented body is OS1010 | specified | `language.md` 3.10 | `unit:lex/empty-block` |
| Continuation by open bracket | An unclosed `(` or `[` continues the statement | specified | `language.md` 3.11 | `lex/continuation-bracket` |
| Continuation by trailing token | A trailing binary operator, comma, `?`, `:` or `=` continues the statement | specified | `language.md` 3.11 | `lex/continuation-operator` |
| Continuation by backslash | A trailing `\` continues the statement | specified | `language.md` 3.11 | `lex/continuation-backslash` |
| Continuation indentation | A continuation line must be indented past the statement's first line, or OS1003 | specified | `language.md` 3.11 | `unit:lex/continuation-indent` |
| Operator token set | The exact punctuation list of section 3.12 | specified | `language.md` 3.12 | `unit:lex/operator-tokens` |
| Rejected operator spellings | `!`, `&&`, `\|\|`, `^`, `;` and the increment operators do not exist, each with a named fix | specified | `language.md` 3.12 | `unit:lex/rejected-operators` |

## 2. Version declaration and compatibility

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `version` statement | A bare first line naming the language version, readable by a one-line scan | specified | `language.md` 4 | `version/declared` |
| Absent version declaration | Compiled at the newest version, with warning OS8003 naming the line to add | specified | `language.md` 4 | `version/undeclared-warns` |
| Front end selection | Version 1 source is always parsed by the version 1 front end, which is kept forever | specified | `language.md` 4.1 | `version/front-end-pinned` |
| Compatibility promise | A script that compiles under version N compiles under every later release and produces the same numbers | specified | `language.md` 4.1 | `version/promise-corpus` |
| Deprecation instead of removal | A construct that was a mistake keeps working and gains an OS8xxx warning naming its replacement | specified | `language.md` 4.1 | `version/deprecation-warns` |

## 3. Types and conversion

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `number` | Binary64, always finite; infinity and not-a-number never appear as values | specified | `language.md` 5.1 | `type/number-finite` |
| No integer type | One numeric type, so no conversion exists to get wrong | specified | `language.md` 5.1 | `type/no-integer-type` |
| Whole-number arguments | A fractional length or index is OS3004, rejected rather than truncated | specified | `language.md` 5.1 | `type/whole-number-required` |
| `string` | A sequence of Unicode code points | specified | `language.md` 5.1 | `type/string` |
| `bool` | `true` or `false`, not a number | specified | `language.md` 5.1 | `type/bool` |
| `color` | Red, green, blue and alpha | specified | `language.md` 5.1 | `type/color` |
| `none` type | The absent value, a member of every type | specified | `language.md` 5.1, 6 | `type/none` |
| `series T` | One `T` per bar | specified | `language.md` 5.2 | `type/series` |
| `array<T>` | Ordered, mutable, resizable, homogeneous | specified | `language.md` 5.1, 14.1 | `type/array` |
| Time as a number | Milliseconds since the epoch, UTC; no separate time type in version 1 | specified | `language.md` 5.1 | `type/time-is-number` |
| No implicit conversion | `0` is not false, `""` is not false, `1 + true` is OS2003 | specified | `language.md` 5.3 | `type/no-coercion` |
| `text(x)` | Any value to a string; `text(none)` is `"none"` | specified | `language.md` 5.3 | `type/text` |
| `text(x, decimals)` | A number to a string with fixed decimals | specified | `language.md` 5.3 | `type/text-decimals` |
| `number(s)` | A string to a number, or absence when it does not parse | specified | `language.md` 5.3 | `type/number-parse` |
| `bool(x)` | Absence to `false`, a bool to itself; numbers rejected | specified | `language.md` 5.3 | `type/bool-convert` |
| Broadcast | A plain `T` used where `series T` is expected is that value on every bar | specified | `language.md` 5.2 | `type/broadcast` |
| Type fixed by first assignment | Assigning a different type to a name later is OS2003 | specified | `language.md` 10.1 | `type/first-assignment-fixes` |
| Type annotations | `series number`, `array<number>` and the rest, checked when present | specified | `language.md` 11.2, 19 | `type/annotation` |

## 4. The absent value

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `isNone(x)` | True when absent | specified | `language.md` 6.1 | `absent/is-none` |
| `orElse(x, fallback)` | The value when present, the fallback when absent | specified | `language.md` 6.1 | `absent/or-else` |
| Arithmetic propagation | Any absent operand makes the result absent | specified | `language.md` 6.2 | `absent/arithmetic` |
| `none * 0` is absent | Zero times unknown is unknown, because the operand was not a number at all | specified | `language.md` 6.2 | `absent/times-zero` |
| Concatenation propagation | `"a" + none` is absent; print it deliberately with `text(none)` | specified | `language.md` 6.2 | `absent/concat` |
| Division by zero | Absence, including `0 / 0`, so one bad bar does not kill a correct study | specified | `language.md` 6.3 | `absent/divide-by-zero` |
| Non-finite maths | `sqrt(-1)`, `log(0)`, overflow: absence, never infinity | specified | `language.md` 6.3 | `absent/non-finite` |
| Ordering propagation | `<`, `<=`, `>`, `>=` return absence when either operand is absent, never `false` | specified | `language.md` 6.4 | `absent/ordering` |
| Equality is total | `==` and `!=` always return a bool, so a script can ask the question | specified | `language.md` 6.5 | `absent/equality` |
| Three-valued logic | The `and`, `or`, `not` table with absence meaning unknown | specified | `language.md` 6.6 | `absent/three-valued-logic` |
| Short circuit | An operand is evaluated only when it can change the result | specified | `language.md` 6.6, 9.4 | `absent/short-circuit` |
| Absent condition | An absent condition takes the false branch, in `if`, `while`, the ternary, a switch arm and an alert | specified | `language.md` 6.6 | `absent/condition-false-branch` |
| OS8004 warning | Warns on an `if` whose condition can be absent and whose block assigns a name read outside it | specified | `language.md` 6.6 | `unit:absent/os8004-warning` |
| Library propagation | A window function is absent if any bar in its window is absent | specified | `language.md` 6.7 | `absent/window-propagation` |
| The three skipping functions | `sumSkip`, `avgSkip`, `countPresent`, named for what they do | specified | `language.md` 6.7 | `absent/skip-functions` |
| Absence on a drawing surface | A gap, never a zero: a broken line, a stopped fill, an unpainted bar, a blank cell | specified | `language.md` 6.7 | `absent/surface-gap` |
| Absence in an order | An absent price or quantity is OS7002 naming the argument, never a substituted value | specified | `language.md` 6.8 | `absent/order-rejected` |

## 5. The per-bar execution model

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| One pass per bar | Every top-level statement runs, first line to last, once per bar, oldest first | specified | `language.md` 7.1 | `bar/one-pass-per-bar` |
| No entry point | The file is the body of the per-bar loop; there is no main and no event handler | specified | `language.md` 7.1 | `bar/no-entry-point` |
| Fixed-surface statements | `plot`, `fill`, `level`, `input`, `table` and the declaration are read once; their arguments run every bar | specified | `language.md` 7.1 | `bar/fixed-surface-once` |
| Fixed surface in a block | A fixed-surface call inside a conditional is OS3006, with the fix "plot `none` instead" | specified | `language.md` 7.1 | `unit:bar/os3006-in-block` |
| `bar.index` | Zero-based position in the supplied dataset, oldest bar 0 | specified | `language.md` 7.2 | `bar/index` |
| `bar.count` | `bar.index + 1` | specified | `language.md` 7.2 | `bar/count` |
| `bar.isFirst` | This is bar 0 | specified | `language.md` 7.2 | `bar/is-first` |
| `bar.isLast` | This is the newest bar in the dataset | specified | `language.md` 7.2 | `bar/is-last` |
| `bar.isConfirmed` | This bar's interval has elapsed; true for every historical bar | specified | `language.md` 7.2 | `bar/is-confirmed` |
| `bar.isRealtime` | A live feed is driving updates | specified | `language.md` 7.2 | `bar/is-realtime` |
| `bar.isNew` | The last update appended a bar rather than replacing one | specified | `language.md` 7.2 | `bar/is-new` |
| `bar.updates` | How many times this bar has been executed | specified | `language.md` 7.2 | `bar/updates` |
| Warmup as absence | No warmup phase exists: a function needing `k` bars is absent until `k` bars exist | specified | `language.md` 7.3 | `bar/warmup-is-absence` |
| Exact warmup lengths | Each function's first present bar is specified, not approximate | specified | `language.md` 7.3, `library.md` | `ta/warmup-exact` |
| History past the start | `x[n]` with `n > bar.index` is absent: not clamped, not zero, not an error | specified | `language.md` 7.4 | `bar/history-before-start` |
| Fractional history index | OS4001, with the fix naming `floor` or `round` | specified | `language.md` 7.4 | `bar/history-fractional` |
| Negative history index | OS3004 for a literal, OS4001 at runtime; reading the future is not available | specified | `language.md` 7.4 | `bar/history-negative` |
| History past retained depth | OS4002 naming the depth and the `limits(history = ...)` line, distinct from a value that never existed | specified | `language.md` 7.4 | `bar/history-past-depth` |
| Default retained depth | The full history of the supplied dataset, so OS4002 appears only when a host set a depth | specified | `language.md` 7.4 | `bar/history-default-depth` |
| Rollback on the moving bar | Persistent values are restored to the end of the previous bar before each re-execution | specified | `language.md` 7.5 | `bar/rollback` |
| Rollback covers array contents | Not only the reference, so an intrabar push does not accumulate duplicates | specified | `language.md` 7.5, 14.1 | `bar/rollback-array` |
| Deferred effects | Signals, alerts and orders wait for bar confirmation and never happen if the condition goes away | specified | `language.md` 7.5 | `bar/deferred-effects` |
| `onUnconfirmed` opt-in | A declaration option, with OS8002 on any higher timeframe read in that file | specified | `language.md` 7.5 | `bar/on-unconfirmed` |
| Determinism of arithmetic | Binary64, round-to-nearest-even, source order; no reassociation, no fused multiply-add, no extended precision | specified | `language.md` 7.6 | `bar/determinism-arithmetic` |
| Determinism of iteration | Array iteration is index order; no unordered collection exists in version 1 | specified | `language.md` 7.6 | `bar/determinism-iteration` |
| No hidden clock or randomness | The only clock is `chart.now()`, whose value the host supplies and a case fixes | specified | `language.md` 7.6 | `bar/no-clock-no-random` |

## 6. Series history and persistence

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Bare series read | Reading a series gives the value on the bar being executed | specified | `language.md` 5.2 | `persist/series-read` |
| History operator | `x[n]` gives the value `n` bars back; `x[0]` is `x` | specified | `language.md` 5.2, 9.6 | `persist/history-read` |
| History eligibility | Only built-in series, top-level names, series-returning calls and series parameters accept `[]`; anything else is OS2004 | specified | `language.md` 5.2 | `persist/history-eligibility` |
| Call-site series retention | Passing an expression to a series parameter retains that expression's per-bar values for that call site | specified | `language.md` 5.2 | `persist/call-site-retention` |
| Plain assignment | Recomputed fresh every bar; the previous value is readable only through `[]` | specified | `language.md` 8.1 | `persist/plain-assignment` |
| `var` | Initialised once, then carried from bar to bar | specified | `language.md` 8.2 | `persist/var` |
| `var` first reached late | The initialiser runs on the first bar control reaches it, and the value is absent before that | specified | `language.md` 8.2 | `persist/var-late-init` |
| `var` in a function | Allowed, and scoped to the function body while persisting across bars | specified | `language.md` 8.2, 11.4 | `persist/var-in-function` |
| `var` with no initialiser | OS1011, with the fix naming `var name = none` | specified | `language.md` 8.2 | `unit:persist/var-no-initialiser` |
| `live var` | Identical to `var` but exempt from rollback, spelled longer because it makes live and backtest numbers differ | specified | `language.md` 8.2 | `persist/live-var` |
| History versus persistence | Two unrelated ideas that share a syntax; `x[1]` on a `var` reads the persistent value one bar ago | specified | `language.md` 8.3 | `persist/history-vs-persistence` |
| `history(expr, n)` | The explicit form, always history, for lines where `[]` would read ambiguously | specified | `language.md` 9.6 | `persist/history-explicit` |
| `element(arr, i)` | The explicit form, always element access | specified | `language.md` 9.6 | `array/element-explicit` |

## 7. Expressions and operators

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Precedence | The nine-level table, left associative except unary and the ternary | specified | `language.md` 9.1 | `expr/precedence` |
| Arithmetic operators | `+ - * /` on numbers, with absence and finiteness rules | specified | `language.md` 9.2 | `expr/arithmetic` |
| Remainder | `%` is truncated division's remainder, so its sign follows the left operand | specified | `language.md` 9.2 | `expr/remainder` |
| `mod(a, b)` | The always-positive form, because both are wanted about equally often | specified | `language.md` 9.2 | `math/mod` |
| String concatenation | `+` joins two strings and does nothing else; `"a" + 5` is OS2003 | specified | `language.md` 9.2 | `expr/concat` |
| Numeric ordering | `< <= > >=` on numbers | specified | `language.md` 9.3 | `expr/ordering-number` |
| String ordering | By Unicode code point, stable across locales, and not offered as an alphabetical sort | specified | `language.md` 9.3 | `expr/ordering-string` |
| Equality | Same type, or any value against `none`; mixed types are OS2003 | specified | `language.md` 9.3 | `expr/equality` |
| Colour equality | Equal when all four channels match | specified | `language.md` 9.3 | `color/equality` |
| Array identity | Two arrays are equal when they are the same array; `arrayEqual` compares contents | specified | `language.md` 9.3, 14.1 | `array/identity-equality` |
| No chained comparison | `a < b < c` is OS1008, because the two plausible readings disagree | specified | `language.md` 9.3 | `unit:expr/chained-comparison` |
| Ternary | `cond ? a : b`, right associative, only the taken arm evaluated, arms same type or one absent | specified | `language.md` 9.5 | `expr/ternary` |
| Subscript disambiguation | `[]` is history on a series and element access on an array, decided at compile time | specified | `language.md` 9.6 | `expr/subscript-dispatch` |
| Assignment is a statement | `if x = 5` is OS1006 with the fix "write `==`" | specified | `language.md` 10.1 | `unit:expr/assignment-not-expression` |
| Compound assignment | `+= -= *= /= %=`, expanding to the obvious form and obeying absence propagation | specified | `language.md` 10.1 | `expr/compound-assignment` |

## 8. Control flow

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `if` / `else if` / `else` | The three forms, with `else if` on one line and no extra indentation | specified | `language.md` 10.2 | `flow/if-else` |
| Condition typing | A condition must be `bool` or absent; anything else is OS2003, with no truthiness rule | specified | `language.md` 10.2 | `flow/condition-type` |
| `for x = a to b` | Inclusive at both ends | specified | `language.md` 10.3 | `flow/for-to` |
| `step` | Defaults to 1; a descending loop must say `step -1` | specified | `language.md` 10.3 | `flow/for-step` |
| Non-reversing loop | If the end is below the start with a positive step, the body does not run | specified | `language.md` 10.3 | `flow/for-no-reverse` |
| Zero step | OS3004, removing the only accidental infinite `for` | specified | `language.md` 10.3 | `unit:flow/for-zero-step` |
| `for x in arr` | Visits indices 0 to size-1 as measured on entry | specified | `language.md` 10.3 | `flow/for-in` |
| Mutation during `for in` | Appended elements are not visited; a shrink past the cursor ends the loop | specified | `language.md` 10.3 | `flow/for-in-mutation` |
| Loop variable is read-only | Assigning to it is OS2006; leave early with `break` | specified | `language.md` 10.3 | `unit:flow/loop-var-readonly` |
| `while` | Condition re-evaluated before each iteration, same typing rule as `if` | specified | `language.md` 10.4 | `flow/while` |
| `break` and `continue` | Leave or skip the innermost loop; outside a loop either is OS1009 | specified | `language.md` 10.5 | `flow/break-continue` |
| `switch` value form | Compares a subject against each case | specified | `language.md` 10.6 | `flow/switch-value` |
| `switch` condition form | No subject; takes the first true arm | specified | `language.md` 10.6 | `flow/switch-condition` |
| Multiple values per case | Comma separated, all of the subject's type | specified | `language.md` 10.6 | `flow/switch-multi-value` |
| No fall-through | Each arm's block ends at the next `case` or `default` | specified | `language.md` 10.6 | `flow/switch-no-fallthrough` |
| `default` | Optional, last; with no match and no default, nothing happens | specified | `language.md` 10.6 | `flow/switch-default` |
| Names set by arms | Must be declared before the `switch`, which makes the "declared in one arm only" bug impossible | specified | `language.md` 10.6, 12.2 | `flow/switch-name-scope` |
| Per-bar loop budget | Iterations summed over all loops in one bar, default 2,000,000, exceeding it is OS5001 | specified | `language.md` 10.7 | `flow/loop-budget` |
| Budget failure stops the bar | It does not break out of the loop, because a truncated loop produces a plausible wrong number | specified | `language.md` 10.7 | `flow/loop-budget-stops-bar` |
| `limits(loops = ...)` | Raises the budget deliberately, in one place | specified | `language.md` 10.7 | `flow/limits-loops` |
| `limits(history = ...)` | Sets the retained series depth | specified | `language.md` 10.7, 7.4 | `flow/limits-history` |
| `limits()` placement | At most once, immediately after the declaration, literal arguments only | specified | `language.md` 10.7 | `unit:flow/limits-placement` |
| Host refusal of a limit | A host unwilling to run a requested limit says so with OS5003 rather than capping quietly | specified | `language.md` 10.7 | `flow/limits-refused` |

## 9. User functions

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Single-line `fn` | `fn name(params) => expression` | specified | `language.md` 11.1 | `fn/single-line` |
| Multi-line `fn` | A block whose final expression is the value | specified | `language.md` 11.1 | `fn/multi-line` |
| Top level only | Functions may not be nested and are not values in version 1 | specified | `language.md` 11.1 | `unit:fn/no-nesting` |
| Parameter annotations | Optional, checked when present, inferred otherwise | specified | `language.md` 11.2 | `fn/parameter-annotation` |
| Parameter defaults | A default expression per parameter | specified | `language.md` 11.2 | `fn/parameter-default` |
| Positional arguments | In declared order | specified | `language.md` 11.2 | `fn/positional-arguments` |
| Named arguments | By parameter name, not repeating a positional one | specified | `language.md` 11.2 | `fn/named-arguments` |
| Positional after named | OS3005 | specified | `language.md` 11.2 | `unit:fn/positional-after-named` |
| Wrong argument count | OS3001 | specified | `language.md` 11.2 | `unit:fn/argument-count` |
| Unknown named argument | OS3002, whose message lists the names that exist | specified | `language.md` 11.2 | `unit:fn/unknown-named-argument` |
| `return expression` | Exits immediately with that value | specified | `language.md` 11.3 | `fn/return` |
| Bare `return` | Exits with absence | specified | `language.md` 11.3 | `fn/return-bare` |
| Implicit return | A trailing bare expression is the return value | specified | `language.md` 11.3 | `fn/implicit-return` |
| State per call site | Two calls in two places are two independent pieces of state | specified | `language.md` 11.4 | `fn/state-per-call-site` |
| One slot per loop call site | A call inside a loop shares one slot across iterations, which is what an accumulation wants | specified | `language.md` 11.4 | `fn/state-in-loop` |
| No recursion | Direct or cyclic self-call is OS2005 naming the cycle, because slots are allocated statically | specified | `language.md` 11.4 | `unit:fn/recursion-rejected` |
| Unexecuted call site | Its series is absent for that bar and its state does not advance | specified | `language.md` 11.4 | `fn/unexecuted-call-site` |
| OS8001 warning | Warns on a stateful call inside a conditional branch and names the fix | specified | `language.md` 11.4 | `unit:fn/os8001-warning` |
| Forward reference | A function may be called before its declaration appears | specified | `language.md` 12.5 | `fn/forward-reference` |

## 10. Scope

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Three scopes | Global (library), file (top-level names and functions), block (every block and function body) | specified | `language.md` 12.1 | `scope/three-scopes` |
| First assignment declares | A name is declared by its first assignment in a scope | specified | `language.md` 12.2 | `scope/first-assignment-declares` |
| Assignment updates an outer name | An assignment to a name from an enclosing scope updates it and creates nothing | specified | `language.md` 12.2 | `scope/outer-update` |
| Block-local names | A name first assigned in a block is invisible outside it, which is OS2001 when read | specified | `language.md` 12.2 | `scope/block-local` |
| No shadowing | Declaring an inner name that exists outside is OS2002, naming the outer line | specified | `language.md` 12.3 | `unit:scope/no-shadowing` |
| Parameter shadowing | A parameter named after a file-scope name or a library function is OS2002 | specified | `language.md` 12.3 | `unit:scope/parameter-shadowing` |
| Assigning to a built-in | `close = 5` is OS2002, with a suggested name | specified | `language.md` 12.4 | `unit:scope/builtin-assignment` |
| Use before assignment | Reading a file-scope name above its assignment is OS2001, not absence | specified | `language.md` 12.5 | `unit:scope/use-before-assignment` |
| Lifetime versus visibility | `var` sets how long a value lives; the block sets where the name is seen | specified | `language.md` 8.2, 12.1 | `scope/lifetime-vs-visibility` |

## 11. Declarations

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `study()` | Declares a study; first statement after any `version` line and leading comments | specified | `language.md` 13.1 | `decl/study` |
| `strategy()` | Every study option plus the trading options, so one file plots and trades | specified | `language.md` 13.1, 13.3 | `decl/strategy` |
| Exactly one declaration | Missing is OS2007, two is OS2008 | specified | `language.md` 13.1 | `unit:decl/one-declaration` |
| Compile-time constant options | Literals, arithmetic over literals or an `input()` call; anything bar-dependent is OS3003 | specified | `language.md` 13.2 | `unit:decl/constant-options` |
| `title` | The legend and picker name, first positional argument | specified | `language.md` 13.2 | `decl/option-title` |
| `short` | A shorter legend name, defaulting to the title | specified | `language.md` 13.2 | `decl/option-short` |
| `overlay` | Price pane when true, own pane when false | specified | `language.md` 13.2 | `decl/option-overlay` |
| `precision` | Decimals on this study's axis and legend, 0 to 10 | specified | `language.md` 13.2 | `decl/option-precision` |
| `format` | `"price"`, `"percent"` or `"volume"` axis and crosshair formatting | specified | `language.md` 13.2 | `decl/option-format` |
| `range` | `[min, max]` fixing the study pane's scale | specified | `language.md` 13.2 | `decl/option-range` |
| `scale` | `"right"`, `"left"` or `"none"` | specified | `language.md` 13.2 | `decl/option-scale` |
| `group` | Category in a picker | specified | `language.md` 13.2 | `decl/option-group` |
| `onUnconfirmed` | Allows signals, alerts and orders on a moving bar | specified | `language.md` 13.2, 7.5 | `decl/option-on-unconfirmed` |
| `capital` | Starting equity for the backtest | specified | `language.md` 13.3 | `decl/option-capital` |
| `currency` | Display label for money in the report | specified | `language.md` 13.3 | `decl/option-currency` |
| `qty` | Default order size when an order names none | specified | `language.md` 13.3 | `decl/option-qty` |
| `qtyType` | `"units"`, `"lots"`, `"cash"` or `"equityPercent"` | specified | `language.md` 13.3 | `decl/option-qty-type` |
| `product` | `"intraday"` or `"overnight"` | specified | `language.md` 13.3 | `decl/option-product` |
| `fillOn` | `"nextOpen"` (the default, because a close cannot fill at that same close) or `"close"` | specified | `language.md` 13.3 | `decl/option-fill-on` |
| `slippage` | Ticks of adverse slippage on every fill | specified | `language.md` 13.3 | `decl/option-slippage` |
| `commission` | Cost per the commission unit | specified | `language.md` 13.3 | `decl/option-commission` |
| `commissionType` | `"perTrade"`, `"perUnit"` or `"percent"` | specified | `language.md` 13.3 | `decl/option-commission-type` |
| `pyramiding` | Maximum entries in one direction before entries are refused | specified | `language.md` 13.3 | `decl/option-pyramiding` |
| `closeOnSessionEnd` | Flatten at the session close | specified | `language.md` 13.3 | `decl/option-close-on-session-end` |

## 12. Inputs

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `input(default, title)` | Declares a tunable value and one row of the settings dialog | specified | `language.md` 13.4 | `input/basic` |
| Type from the default | The input's type follows the default's type, which is why the default comes first | specified | `language.md` 13.4 | `input/type-from-default` |
| Number input | With `min`, `max` and `step` bounds | specified | `language.md` 13.4 | `input/number` |
| Bool input | A checkbox row | specified | `language.md` 13.4 | `input/bool` |
| String input | A text row | specified | `language.md` 13.4 | `input/string` |
| Colour input | A colour row | specified | `language.md` 13.4 | `input/color` |
| Source input | A built-in series chosen from the price fields | specified | `language.md` 13.4 | `input/source` |
| Options list | `options = [...]` makes the row a fixed choice | specified | `language.md` 13.4 | `input/options` |
| `kind = "interval"` | A timeframe row, validated against the known timeframes | specified | `language.md` 13.4 | `input/interval` |
| Top level only | An `input()` inside a block or a function is OS3007 | specified | `language.md` 13.4 | `unit:input/top-level-only` |
| Out-of-range value | A supplied value outside `min` and `max` is rejected before the first bar | planned | `surface.md` inputs | `input/out-of-range` |
| Settings round trip | Saved settings reload to the same values and produce the same output | planned | `surface.md` inputs | `input/settings-round-trip` |
| Group and inline layout | Optional grouping of rows in the generated dialog | planned | `surface.md` inputs | `input/dialog-layout` |

## 13. Collections

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Array literal | `[1, 2, 3]`, homogeneous | specified | `language.md` 14.1 | `array/literal` |
| Empty literal | Takes its type from an annotation or from context | specified | `language.md` 14.1 | `array/empty-literal` |
| Reference semantics | Assignment shares the array; `copy` makes an independent one, so passing is never quietly expensive | specified | `language.md` 14.1 | `array/reference-semantics` |
| `size(arr)` | Element count | specified | `language.md` 14.1 | `array/size` |
| Element read and write | `arr[i]`, `element(arr, i)`, `set(arr, i, v)` | specified | `language.md` 14.1 | `array/element-access` |
| `push` and `pop` | Append, and remove and return the last | specified | `language.md` 14.1 | `array/push-pop` |
| `shift` and `unshift` | Remove and return the first, and insert at the front | specified | `language.md` 14.1 | `array/shift-unshift` |
| `insert` and `remove` | Insert before an index, and remove and return an index | specified | `language.md` 14.1 | `array/insert-remove` |
| `clear(arr)` | Remove everything | specified | `language.md` 14.1 | `array/clear` |
| `slice(arr, from, to)` | A new array, `from` inclusive, `to` exclusive | specified | `language.md` 14.1 | `array/slice` |
| `copy(arr)` | An independent copy | specified | `language.md` 14.1 | `array/copy` |
| `indexOf(arr, v)` | First index, or -1 | specified | `language.md` 14.1 | `array/index-of` |
| `sort(arr, order)` | In place, ascending or descending, and stable so two engines agree on ties | specified | `language.md` 14.1 | `array/sort` |
| `reverse(arr)` | In place | specified | `language.md` 14.1 | `array/reverse` |
| Array statistics | `sum`, `avg`, `min`, `max`, `stdev` over the whole array | specified | `language.md` 14.1 | `array/statistics` |
| `arrayEqual` | Compares contents rather than identity | specified | `language.md` 9.3, 14.1 | `array/array-equal` |
| Out-of-range index | OS4004 naming the index and the size, because an array has an extent the script chose | specified | `language.md` 14.1 | `array/out-of-range` |
| Element limit | 1,000,000 by default; exceeding it is OS5002 and `limits()` does not raise it in version 1 | specified | `language.md` 14.1 | `array/element-limit` |
| Persistent array | An array in a `var` persists, and rollback restores its contents | specified | `language.md` 14.1, 7.5 | `array/persistent` |
| `map<K, V>` | Reserved word, not implemented; insertion-order iteration when it arrives, for determinism | specified | `language.md` 14.2 | `unit:array/map-reserved` |
| `matrix<T>` | Reserved word, not implemented; two-dimensional numeric container when it arrives | specified | `language.md` 14.2 | `unit:array/matrix-reserved` |

## 14. Strings

The `str` namespace holds everything beyond concatenation. Each row is `planned`
because the per-function reference is not written; the shape of the namespace is
fixed by `language.md` 15.2.

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `str.length` | Count of Unicode code points, not bytes and not UTF-16 units | planned | `library.md` str | `str/length` |
| Code point semantics | Length, indexing and slicing all count code points, so one engine cannot disagree with another | planned | `library.md` str | `str/code-points` |
| `str.upper`, `str.lower` | Case conversion, using the locale-independent mapping so a result never depends on a machine setting | planned | `library.md` str | `str/case` |
| `str.contains` | Substring test | planned | `library.md` str | `str/contains` |
| `str.startsWith`, `str.endsWith` | Prefix and suffix tests | planned | `library.md` str | `str/prefix-suffix` |
| `str.indexOf` | First index of a substring, or -1 | planned | `library.md` str | `str/index-of` |
| `str.substring` | A range by code point index | planned | `library.md` str | `str/substring` |
| `str.replace`, `str.replaceAll` | First and every occurrence | planned | `library.md` str | `str/replace` |
| `str.split` | To an `array<string>` | planned | `library.md` str | `str/split` |
| `str.join` | From an `array<string>` | planned | `library.md` str | `str/join` |
| `str.trim` | Leading and trailing whitespace removed | planned | `library.md` str | `str/trim` |
| `str.padLeft`, `str.padRight` | Pad to a width, for table cells that line up | planned | `library.md` str | `str/pad` |
| `str.repeat` | Repeat a string a whole number of times | planned | `library.md` str | `str/repeat` |
| `str.format` | A template with positional placeholders, so a message is one string rather than six concatenations | planned | `library.md` str | `str/format` |

## 15. Mathematics

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `abs`, `sign` | Magnitude, and -1, 0 or 1 | planned | `library.md` math | `math/abs-sign` |
| `floor`, `ceil`, `round` | Rounding, with `round` using round-half-away-from-zero, stated so engines agree on `.5` | planned | `library.md` math | `math/rounding` |
| `round(x, decimals)` | Rounding to a number of decimals | planned | `library.md` math | `math/round-decimals` |
| `truncate` | Towards zero | planned | `library.md` math | `math/truncate` |
| `min`, `max` | Two-argument forms, bare | planned | `library.md` math | `math/min-max` |
| `pow` | The power function, because `^` has two plausible readings | specified | `language.md` 3.12 | `math/pow` |
| `sqrt`, `exp`, `log`, `log10` | With absence for a non-finite or non-real result | planned | `library.md` math | `math/exp-log` |
| Trigonometry | `sin`, `cos`, `tan` and the inverses, with the exact binary64 results a case pins | planned | `library.md` math | `math/trigonometry` |
| `math.toDegrees`, `math.toRadians` | Angle conversion | planned | `library.md` math | `math/angle-conversion` |
| Constants | `math.pi`, `math.e` | planned | `library.md` math | `math/constants` |
| `clamp` | Bound a value between a low and a high | planned | `library.md` math | `math/clamp` |
| No random source | There is no random function, because a script that plots differently twice cannot be conformance tested | specified | `language.md` 7.6 | `math/no-random` |

## 16. Colours

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Named colours | The nineteen bare names, which are ordinary globals so more can be added without a grammar change | specified | `language.md` 3.8 | `color/named` |
| Hex colours | 24 bit, and 32 bit with an alpha byte | specified | `language.md` 3.8 | `color/hex` |
| `rgb(r, g, b)` | Construct from channels | specified | `language.md` 3.8 | `color/rgb` |
| `rgba(r, g, b, a)` | Construct with alpha from 0 to 1 | specified | `language.md` 3.8 | `color/rgba` |
| `fade(color, percent)` | Lower a colour's alpha | specified | `language.md` 3.8 | `color/fade` |
| Absent colour | An absent colour paints nothing, rather than falling back to a default | planned | `surface.md` colour | `color/absent` |

## 17. Technical analysis library

Roughly one hundred functions. One row per family here, and one conformance case
per function inside the family's directory, because a hundred rows would drown
the rest of this table without proving anything a family row does not. The
function count itself is printed by continuous integration from the library
manifest, alongside the count of manifest entries that have a case.

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Simple and weighted averages | `sma`, `wma`, `swma` | planned | `library.md` ta | `ta/average-simple` |
| Exponential and running averages | `ema`, `rma`, `dema`, `tema`, each with its stated seeding | planned | `library.md` ta | `ta/average-exponential` |
| Adaptive and volume averages | `hma`, `alma`, `vwma` | planned | `library.md` ta | `ta/average-adaptive` |
| Momentum oscillators | `rsi`, `stoch`, `cci`, `mfi`, `williamsR` | planned | `library.md` ta | `ta/momentum` |
| Trend indicators | `macd`, `adx`, `dmi`, `aroon`, `supertrend` | planned | `library.md` ta | `ta/trend` |
| Volatility | `tr`, `atr`, `stdev`, `variance`, `bollinger`, `keltner`, `donchian` | planned | `library.md` ta | `ta/volatility` |
| Volume | `obv`, `ad`, `cmf`, `pvt`, `vwap`, anchored `vwap` | planned | `library.md` ta | `ta/volume` |
| Extremes and pivots | `highest`, `lowest`, `highestBars`, `lowestBars`, `pivotHigh`, `pivotLow` | planned | `library.md` ta | `ta/extremes` |
| Crossover tests | `crossUp`, `crossDown`, `cross` | planned | `library.md` ta | `ta/crossover` |
| Change and accumulation | `change`, `roc`, `cum`, `sum`, `barsSince`, `valueWhen` | planned | `library.md` ta | `ta/change` |
| Regression and correlation | `linreg`, `slope`, `correlation`, `covariance` | planned | `library.md` ta | `ta/regression` |
| Rank and distribution | `percentRank`, `percentile`, `median`, `mode` | planned | `library.md` ta | `ta/rank` |
| Exact warmup per function | Each function's first present bar is fixed by the manifest and asserted per function | specified | `language.md` 7.3 | `ta/warmup-exact` |
| Absence behaviour per function | Window propagation, or the named skipping behaviour, asserted per function | specified | `language.md` 6.7 | `ta/absence-behaviour` |
| Independent reference agreement | Every library function matches an independently written reference, with its provenance recorded | planned | `conformance.md` categories | `ta/reference-agreement` |

## 18. The plot family

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `plot(value, title, color)` | One column of one value per bar | specified | `language.md` 15.3 | `plot/basic` |
| Line, stepline and histogram styles | The three most used shapes of a per-bar column | planned | `surface.md` plot | `plot/style-line-family` |
| Area and column styles | Filled to a baseline | planned | `surface.md` plot | `plot/style-area-column` |
| Point styles | Circles and crosses at each bar's value | planned | `surface.md` plot | `plot/style-points` |
| Candle and bar plots | Four series drawn as price bars in the study's own pane | planned | `surface.md` plot | `plot/style-candle` |
| Width, opacity and line style | Solid, dashed and dotted, with a width and an opacity | specified | `language.md` 15.3 | `plot/appearance` |
| Per-bar plot colour | A colour expression evaluated per bar, so one line changes colour with a condition | planned | `surface.md` plot | `plot/per-bar-color` |
| Plot offset | Shift a plotted column forward or back by a whole number of bars | planned | `surface.md` plot | `plot/offset` |
| Price scale selection | Left, right or none, per plot | planned | `surface.md` plot | `plot/price-scale` |
| Precision and format | Per-plot override of the declaration's precision and format | planned | `surface.md` plot | `plot/precision-format` |
| Fixed column set | The set of plots is fixed before bar 0, which is what lets a legend and a settings dialog exist | specified | `language.md` 7.1 | `plot/fixed-column-set` |
| Hiding by absence | A plot is hidden on a bar by plotting `none`, never by wrapping it in an `if` | specified | `language.md` 7.1, 6.7 | `plot/hide-by-absence` |
| `signal(text)` | The whole of shape plotting: one call, one named marker on the bar | specified | `language.md` 15.3 | `plot/signal` |
| Signal layer replacement | The marker layer is rebuilt each run, so a signal that stops firing leaves nothing behind | planned | `surface.md` plot | `plot/signal-layer-clear` |

## 19. Fills, levels, bar colour and background

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `fill(a, b, color)` | A shaded band between two plots | specified | `language.md` 15.3 | `fill/basic` |
| Two-sided fill colour | A different colour depending on which plot leads, because which side leads is itself the signal | planned | `surface.md` fill | `fill/two-sided` |
| Fill opacity | Alpha on the band, usually through `fade` | specified | `language.md` 3.8, 15.3 | `fill/opacity` |
| Fill across absence | The band stops on a bar where either plot is absent | specified | `language.md` 6.7 | `fill/absence-gap` |
| `level(price, title, color)` | A horizontal reference line in the study's pane | specified | `language.md` 13.2, 15.3 | `level/basic` |
| Computed level | A level whose price comes from the data and moves with it | planned | `surface.md` level | `level/computed` |
| Level appearance | Width and dashed or solid | planned | `surface.md` level | `level/appearance` |
| `barColor(color)` | Recolours the price candles, one colour per bar | specified | `language.md` 15.3 | `barcolor/basic` |
| Bar colour absence | An absent colour leaves the bar its own colour | specified | `language.md` 6.7 | `barcolor/absence` |
| Single publisher rule | Only one study colours the candles at a time, and the winner is stable from frame to frame | planned | `surface.md` barcolor | `barcolor/single-publisher` |
| `background(color)` | Per-bar shading behind the pane, a full-height column | specified | `language.md` 15.3 | `background/basic` |
| Background absence | An absent colour clears that bar's shading | specified | `language.md` 6.7 | `background/absence` |

## 20. Tables

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `table(...)` declaration | Declared at the top level, because it is part of the study's fixed shape | specified | `language.md` 15.3 | `table/declaration` |
| Cell content | Text, text colour and background colour per cell | planned | `surface.md` table | `table/cell-content` |
| Cell alignment | Horizontal and vertical alignment per cell | planned | `surface.md` table | `table/cell-alignment` |
| Row and column sizing | Widths and heights, or automatic | planned | `surface.md` table | `table/sizing` |
| Corner placement | Which corner of the pane the grid is pinned to | planned | `surface.md` table | `table/placement` |
| Per-bar update | Cells written during the bar, with the last write of the last bar being what is shown | planned | `surface.md` table | `table/per-bar-update` |
| Clearing | Writing no rows draws nothing, which is how a "show table" input switches it off | planned | `surface.md` table | `table/clear` |
| Absent cell | An absent value renders a blank cell, never a zero | specified | `language.md` 6.7 | `table/absent-cell` |

## 21. Mutable drawing objects

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `draw.line` | A line between two anchors | planned | `surface.md` draw | `draw/line` |
| `draw.label` | A text plate at one anchor | planned | `surface.md` draw | `draw/label` |
| `draw.box` | A rectangle between two anchors, with an optional fill | planned | `surface.md` draw | `draw/box` |
| `draw.polyline` | A path through several anchors, optionally closed and filled | planned | `surface.md` draw | `draw/polyline` |
| Time and price anchoring | An anchor is a time and a price, not a bar index, so a shape stays put when history is paged in | planned | `surface.md` draw | `draw/time-anchored` |
| Mutation after creation | Move, recolour and retext an object on a later bar | planned | `surface.md` draw | `draw/mutation` |
| Deletion | Remove an object the script created | planned | `surface.md` draw | `draw/delete` |
| Identity across bars | An object handle held in a `var` refers to the same object next bar | planned | `surface.md` draw | `draw/identity` |
| Rollback of drawing state | Objects created on a moving bar are undone before the bar re-runs, as `var` values are | planned | `surface.md` draw, `language.md` 7.5 | `draw/rollback` |
| No object cap | There is no platform limit on object count; the only limit is memory and the script's own `limits()` | planned | `surface.md` draw | `draw/no-cap` |
| Line extension | Continue a line past its anchor to the pane edge, left or right | planned | `surface.md` draw | `draw/extend` |
| Tooltip and hit identity | Hover detail and a click identity on a box or a label | planned | `surface.md` draw | `draw/tooltip-hit` |
| Layer replacement | The object layer is rebuilt from the script's state each run, so nothing orphaned survives | planned | `surface.md` draw | `draw/layer-replacement` |

## 22. Time, session and instrument facts

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `time` | The bar's open time, UTC milliseconds | specified | `language.md` 15.1 | `time/bar-time` |
| `date.year`, `.month`, `.day` | Calendar fields from a timestamp, in the chart's timezone | planned | `library.md` date | `time/date-fields` |
| `date.hour`, `.minute`, `.second` | Clock fields from a timestamp | planned | `library.md` date | `time/clock-fields` |
| `date.dayOfWeek` | Day number, with the numbering fixed so a weekly rule cannot differ between engines | planned | `library.md` date | `time/day-of-week` |
| Timestamp construction | Build a timestamp from calendar and clock fields plus a timezone | planned | `library.md` date | `time/construct` |
| Timestamp formatting | A timestamp to a string with an explicit pattern, never a locale default | planned | `library.md` date | `time/format` |
| `chart.timezone` | The timezone every calendar conversion uses | planned | `library.md` chart | `time/timezone` |
| `chart.symbol`, `chart.exchange` | The instrument being charted | planned | `library.md` chart | `time/instrument-identity` |
| `chart.interval` | The chart's timeframe | planned | `library.md` chart | `time/interval` |
| `chart.tickSize`, `chart.lotSize` | Instrument facts a strategy needs for rounding and sizing | planned | `library.md` chart | `time/tick-and-lot` |
| `chart.now()` | The only wall clock, supplied by the host and fixed by a conformance case | specified | `language.md` 7.6, 15.2 | `time/now` |
| `session.isFirstBar` | The first bar of the instrument's session | specified | `language.md` 15.2 | `session/first-bar` |
| `session.isLastBar` | The last bar of the session | planned | `library.md` session | `session/last-bar` |
| `session.isMarketOpen` | Whether this bar falls inside the instrument's trading session | planned | `library.md` session | `session/is-open` |
| Session boundaries | Start and end times taken from the instrument facts the host supplies, not guessed | planned | `library.md` session | `session/boundaries` |
| Session day boundary | Which calendar day a bar belongs to when a session crosses midnight | planned | `library.md` session | `session/day-boundary` |

## 23. Higher timeframe and other instrument reads

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `req.timeframe(tf, expr)` | A value computed on a higher timeframe and folded onto this chart's bars | specified | `language.md` 15.2 | `req/timeframe` |
| Repaint mode | Every higher timeframe read states its mode, and the mode is part of the call, not a setting | planned | `surface.md` req | `req/repaint-mode` |
| Default is non-repainting | The default mode uses only completed higher timeframe bars, because an honest default is worth more than a convenient one | planned | `surface.md` req | `req/default-non-repainting` |
| Warning OS8002 | A higher timeframe read in a file declaring `onUnconfirmed = true` warns, because that is where repainting comes from | specified | `language.md` 7.5 | `unit:req/os8002-warning` |
| Unknown timeframe | OS6001 naming the timeframes that exist | specified | `language.md` 16 | `req/unknown-timeframe` |
| Alignment | Which chart bar each higher timeframe value first appears on, specified exactly | planned | `surface.md` req | `req/alignment` |
| Absence before the first close | Absent until the first higher timeframe bar in the dataset completes | planned | `surface.md` req | `req/warmup` |
| `req.symbol(...)` | Another instrument's bars or a value computed from them | planned | `surface.md` req | `req/symbol` |
| Missing instrument data | An OS6xxx error naming the instrument and what was missing, never a silent empty series | planned | `errors.md` OS6xxx | `req/missing-data` |
| Calendar mismatch | How bars align when two instruments have different sessions or holidays | planned | `surface.md` req | `req/calendar-mismatch` |
| Request accounting | How many distinct reads a script makes, reported rather than capped | planned | `surface.md` req | `req/request-accounting` |

## 24. Alerts

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `alert(condition, message)` | A condition the runtime watches and a message it emits | specified | `language.md` 15.3 | `alert/basic` |
| Message from per-bar values | The message may be built from this bar's values | planned | `surface.md` alert | `alert/message-template` |
| Confirmed bar only | An alert does not fire on a moving bar unless the declaration opts in | specified | `language.md` 7.5 | `alert/confirmed-only` |
| Absent condition | An absent condition does not fire, by the false-branch rule | specified | `language.md` 6.6 | `alert/absent-condition` |
| One firing per bar | An alert fires at most once per bar, however many times the bar is executed | planned | `surface.md` alert | `alert/once-per-bar` |
| Payload contract | What the host receives: identity, title, message, bar time and bar index | planned | `surface.md` alert | `alert/payload` |

## 25. Strategy: orders

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `buy(...)` | Enter or add to a long position | specified | `language.md` 13.3 | `order/buy` |
| `sell(...)` | Enter or add to a short position | specified | `language.md` 13.3 | `order/sell` |
| `close()` | Flatten the current position | specified | `language.md` 13.3 | `order/close` |
| Limit orders | An order with a limit price, and what happens when it is not reached | planned | `strategy.md` orders | `order/limit` |
| Stop orders | An order with a stop price, and the fill rule when a bar gaps through it | planned | `strategy.md` orders | `order/stop` |
| Brackets | A stop loss and a take profit attached to an entry, cancelling each other on fill | planned | `strategy.md` orders | `order/bracket` |
| Order identity and cancel | Naming an order so a later bar can modify or cancel it | planned | `strategy.md` orders | `order/identity-cancel` |
| Quantity types | Units, lots, cash and equity percent, with the rounding rule for each | planned | `strategy.md` sizing | `order/qty-types` |
| Default quantity | Taken from the declaration when an order names none | specified | `language.md` 13.3 | `order/default-qty` |
| Pyramiding limit | Entries beyond the limit are refused, and the refusal is reported | specified | `language.md` 13.3 | `order/pyramiding` |
| Fill timing | `nextOpen` or `close`, applied consistently in backtest and live | specified | `language.md` 13.3 | `order/fill-timing` |
| Slippage | Ticks of adverse slippage applied to every fill | specified | `language.md` 13.3 | `order/slippage` |
| Commission models | Per trade, per unit and percent | specified | `language.md` 13.3 | `order/commission` |
| Market-specific costs | Taxes, exchange and regulator charges and stamp duty for the market being traded | planned | `strategy.md` costs | `order/market-costs` |
| Product type | Intraday versus overnight, and what each implies for carrying a position | specified | `language.md` 13.3 | `order/product-type` |
| Session flattening | `closeOnSessionEnd` flattens at the session close | specified | `language.md` 13.3 | `order/session-flatten` |
| Reversal in one order | Going from long to short with a single order, and how the trade list records it | planned | `strategy.md` orders | `order/reversal` |
| Absent argument | An absent price or quantity is OS7002 naming the argument | specified | `language.md` 6.8 | `order/absent-argument` |
| Deferral on a moving bar | An order decided intrabar is placed when the bar confirms, or not at all | specified | `language.md` 7.5 | `order/deferred` |
| Rejection reporting | Every refused order reports an OS7xxx code and a reason, and none is dropped silently | planned | `errors.md` OS7xxx | `order/rejection-reported` |

## 26. Strategy: position and performance

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `pos.size` | Signed position size, zero when flat | specified | `language.md` 15.2 | `pos/size` |
| `pos.avgPrice` | Average entry price of the open position | specified | `language.md` 15.2 | `pos/avg-price` |
| `pos.unrealised` | Open profit at this bar | specified | `language.md` 15.2 | `pos/unrealised` |
| `pos.realised` | Closed profit so far | planned | `strategy.md` position | `pos/realised` |
| `pos.barsHeld`, `pos.entryTime` | How long the position has been open and when it opened | planned | `strategy.md` position | `pos/held` |
| Long, short and flat transitions | The exact state machine, including partial closes | planned | `strategy.md` position | `pos/transitions` |
| Trade list | One row per closed trade: entry, exit, size, cost, profit | planned | `strategy.md` report | `perf/trade-list` |
| Equity curve | Equity per bar, including open profit | planned | `strategy.md` report | `perf/equity-curve` |
| Drawdown | Peak-to-trough decline, on the stated basis | planned | `strategy.md` report | `perf/drawdown` |
| Win rate and expectancy | The two headline statistics, each with its formula written down | planned | `strategy.md` report | `perf/win-rate-expectancy` |
| Monthly return table | Returns grouped by calendar month | planned | `strategy.md` report | `perf/monthly-table` |
| Trade markers | Every trade marked on the chart at its fill bar | planned | `strategy.md` report | `perf/trade-markers` |
| Run reproducibility | A run records its script revision, inputs, date range, cost settings and compiled program hash, and reruns identically | planned | `strategy.md` report | `perf/reproducible-run` |
| Run comparison | Two runs compared well enough to tell a real improvement from noise | planned | `strategy.md` report | `perf/run-comparison` |

## 27. Errors, warnings and diagnostics

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Code ranges | OS1xxx syntax, OS2xxx names and types, OS3xxx arguments, OS4xxx runtime, OS5xxx limits, OS6xxx data, OS7xxx orders, OS8xxx warnings | specified | `language.md` 16 | `err/code-ranges` |
| Diagnostic shape | Every diagnostic carries a code, a line, a column, a message and a fix | specified | `language.md` 16 | `err/diagnostic-shape` |
| Caret under the text | The reported column points at the offending characters | specified | `ROADMAP.md` phase 1, `errors.md` | `unit:err/caret` |
| Warnings do not stop | OS8xxx never halts compilation or a bar; it is reported on the line | specified | `language.md` 16 | `err/warning-does-not-stop` |
| A runtime error stops the bar | The study is marked errored and the message is shown on the chart, rather than producing a plausible wrong number | specified | `language.md` 10.7, 16 | `err/runtime-stops-bar` |
| Catalogue authority | `errors.md` wins over any other document quoting a code | specified | `language.md` 1, 16 | `unit:err/catalogue-authority` |
| No undocumented code | The build fails if the compiler can emit a code with no catalogue entry | specified | `language.md` 16 | `unit:err/no-undocumented-code` |
| No untested entry | The build fails if a catalogue entry has no test that produces it | specified | `language.md` 16 | `unit:err/no-untested-entry` |
| Every error names a fix | A diagnostic that cannot state a fix is a defect in the diagnostic | specified | `language.md` 16 | `unit:err/fix-present` |

## 28. Logging

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| `print(x)` | Write a value to the script's log for the bar being executed | planned | `library.md` log | `log/print` |
| Levels | `log.info`, `log.warn`, `log.error`, so a live script's log can be filtered | planned | `library.md` log | `log/levels` |
| Bar context | Every entry carries the bar time and bar index, so a log line can be matched to a bar | planned | `library.md` log | `log/bar-context` |
| Rate limit | A per-bar and per-run cap, with the cap reported rather than silently dropping lines | planned | `library.md` log | `log/rate-limit` |
| Rollback of log output | Lines written during a re-executed moving bar replace the previous execution's lines | planned | `library.md` log | `log/rollback` |
| No effect on numbers | Logging changes no value, so a case's numeric output is identical with logging on or off | planned | `library.md` log | `log/no-side-effect` |
| Log as an assertable output | A conformance case may assert the log stream, which is how logging itself is proved | planned | `conformance.md` categories | `log/assertable` |

## 29. Compiled program and engines

| Feature | What it is | Status | Section | Test |
|---|---|---|---|---|
| Compiled program is data | A plain instruction list against a versioned schema, never generated source | specified | `README.md`, `compiled-program.md` | `prog/is-data` |
| No dynamic code | Nothing calls `eval` or builds a function from text, so a strict content security policy is enough | specified | `README.md`, `compiled-program.md` | `unit:prog/no-eval` |
| Schema round trip | Serialise, deserialise and run, with identical output | planned | `compiled-program.md` | `prog/round-trip` |
| Schema versioning | A compatibility promise on the format, so an engine written today reads a program compiled tomorrow | planned | `compiled-program.md` | `prog/schema-version` |
| Program hash stability | The same source under the same language version compiles to the same program and the same hash | planned | `compiled-program.md` | `prog/hash-stability` |
| Cross-engine equality | Every engine produces identical output on every case, and a disagreement blocks the release | specified | `conformance.md`, `ROADMAP.md` phase 6 | `prog/cross-engine-equality` |
</content>
</invoke>
