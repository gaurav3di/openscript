# Checking a library against the vectors

For anyone implementing the numeric library in another language, who wants to
know their arithmetic is this engine's to the last bit before running a single
conformance case.

The [0.7.0 numerical audit](numerical-audit.md) tracks expanded cross-engine and
chart comparisons beyond the current vector corpus. It is still in progress.

By the end of this page you will know what a vector file holds, how to decode
one, how to drive your function over it, what "matches" means, and which cases
you are not held to.

---

## What is there

[`spec/vectors/library/`](../../spec/vectors/library/) holds one JSON file per
arithmetic function of the library manifest, named `<name>-<arity>.json`
because the manifest keys a function by its name and its argument count
(`change-1.json` and `change-2.json` are two functions), and `index.json`,
which names every file and lists the manifest entries that have no vector and
why. Every number in them is a binary64 bit pattern: sixteen lower case hex
digits, sign bit first, the eight bytes of the value in big-endian order.
Nothing was formatted as decimal anywhere on the way, so what you decode is
what this engine held.

The files are generated from the fixture `tests/stdlib/vectors.ts` by
`scripts/generate-library-vectors.mjs`, and `npm test` regenerates them and
fails on a byte that differs, so a file is never older than the engine.

## A file

```json
{
  "name": "ema", "arity": 2, "state": true, "params": ["src", "len"],
  "cases": [
    {
      "id": "full-0", "call": "ema(src, 20)", "gaps": [], "bars": 80,
      "args": [
        { "name": "src", "kind": "number", "values": ["4058e51eb851eb85", "..."] },
        { "name": "len", "kind": "number", "values": ["4034000000000000", "..."] }
      ],
      "outputs": [{ "kind": "number", "values": [null, "..."], "warmup": 19 }]
    }
  ]
}
```

A case is a run of `bars` bars. Every column is `bars` long: one per
parameter, in parameter order, and one per output. A function that returns
several values has several output columns, in the order its entry in
[`spec/stdlib.md`](../../spec/stdlib.md) documents. A cell is `null` for the
absent value, `true` or `false` for a bool, a bit pattern for a number, or a
plain string where the parameter takes one; `kind` says which, and is `none`
for a column that is absent throughout. `warmup` is the index of the first bar
with a value, or `-1` where no bar has one.

A function that reads the bar carries a `bar` object with a column per fact it
read, `high`, `previousClose` and so on, and one that asks the host a fact
carries a `host` object with that fact's value. A function that reads neither
has neither.

## Driving it

For each case, start a fresh state region, then for each bar `i` from 0: give
your function the bar facts at `i`, the arguments at `i`, and the region, and
compare what it returns with the outputs at `i`. The `short-0`, `holes-0` and
`absent-args-0` cases exist because the language's central idea is absence:
they check what your function does with too little history, a hole in a series,
and an argument that has no value yet.

To decode a cell in Python:

```python
import struct
value = struct.unpack('>d', bytes.fromhex(cell))[0]
```

and to compare, do not compare floats. Compare the sixteen digits, or unpack
both sides to integers: `struct.unpack('>Q', ...)`. A value matches when the
patterns are equal and absence matches only absence, which is the comparison
[`spec/conformance.md`](../../spec/conformance.md) section 6 defines with a
tolerance of zero; the engine never produces a negative zero or a non-finite
value, so there is nothing to normalise on its side.

## What you are not held to

A case whose `gaps` is not empty reaches a gap of `stdlib.md` section 20.11,
which the index also records per function. Its numbers are what this engine
produced, and no document fixes them, so a difference there is not a defect in
your engine. Gap 1 is every call that reaches a transcendental function, and
gap 2 is the inner length of `hma`, which the `ma` case that selects it by name
reaches as surely as a call does.

The index's `notReached` list is every manifest entry with no vector file, in
groups with the reason: colours, text, arrays, drawing objects, chart and
ledger reads, and the calendar hold no accumulation to fix, and the
conformance suite compares them in their own kinds.
