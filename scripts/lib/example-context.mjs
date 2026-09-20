/**
 * The program a catalogue example is compiled inside.
 *
 * `spec/errors.json` carries a `before` and an `after` block per entry, and
 * section 1 of `spec/errors.md` says of them: "Both may be fragments." They are.
 * Two lines of a script with no `version` line, no declaration and names the
 * fragment never declares is not a program any compiler would accept, and that
 * is the right shape for the catalogue: a reader stuck on OS3011 wants the two
 * lines that differ, not a study around them.
 *
 * It is also why nothing ever put them through the compiler, and why OS7009's
 * fix named a function the language does not have and sat there being read.
 *
 * So this module builds the program a fragment is a fragment of. It adds the
 * two lines every file needs and binds the names the examples write without
 * declaring, and it adds nothing else: the fragment's own text is copied
 * through unchanged, on its own lines, so a diagnostic's line number can be
 * carried back to the block a reader sees.
 *
 * ## The conventional names
 *
 * `CONVENTIONAL` below is the whole of what a fragment may lean on. The
 * examples were written by hand over a long time and they lean on a small,
 * repeating cast: `trending` and `ready` are conditions, `fast` and `slow` are
 * two averages, `values` is an array. Each is bound here once, and a name is
 * bound into a block only when that block reads it and does not declare it, so
 * a block that declares its own `len` keeps its own.
 *
 * This is a fixture and not an exemption list, and the difference is worth
 * stating because this repository has been bitten by the second. Nothing here
 * names an entry or excuses one. Every entry is compiled, every entry is held
 * to the same rule, and what this table decides is only what `trending` means.
 * A fragment reaching for a name that is not here fails, and the two honest
 * answers are to declare it in the example, where the reader sees it, or to add
 * it here, where the next reviewer does.
 *
 * ## What it deliberately does not do
 *
 * It does not repair a block. It adds a `version` line only to a block that has
 * none and a declaration only to a block that has none, because several entries
 * are *about* the missing line, and a harness that helpfully supplied it would
 * report those entries as fixed. `check-examples-compile.mjs` compiles a before
 * block as written as well as inside this program for the same reason.
 *
 * It also has nothing to say about where a binding may sit. Bindings go between
 * the declaration and the block, which is where `limits()` has to be
 * (`stdlib.md`, OS3014), so a fragment that opens with `limits()` and reaches
 * for a conventional name would be refused for the position rather than for the
 * name. No example does both today; if one ever does, the check reports OS3014
 * against an after block and this note is where the reason is.
 */

/** A fenced example's placeholder instrument, from `errors.md` section 3. */
const SYMBOL = 'SYMBOL';

/**
 * Every name the examples write without declaring, and what it means.
 *
 * Ordered as a reader would meet them: the conditions, the series, the numbers,
 * the arrays, the strings, then the two functions. The order decides the order
 * the bindings are written in, so two runs produce the same program.
 *
 * Three of these are chosen rather than obvious, and each one is chosen so that
 * the example it appears in can raise the code it is filed under. A fixture that
 * makes every example run clean proves nothing about any of them.
 *
 * `len` is fifteen rather than fourteen, because two entries divide it by two
 * and are about the half that is not a whole number: OS4003 on a length and
 * OS4001 on a history index. An even `len` would make both run clean while
 * teaching a refusal.
 *
 * `lookback` is a warmup value rather than a number, because OS4013 is about a
 * loop bound that is absent, which is what a twenty bar average is on bar one.
 * Its own after block guards with `isNone`, which is the entry saying the same
 * thing.
 *
 * `target` is zero, because OS7004's example subtracts the position from it and
 * is about the quantity that comes out zero or negative.
 */
export const CONVENTIONAL = [
  { name: 'trending', declaration: 'trending = close > open' },
  { name: 'ready', declaration: 'ready = bar.index > 20' },
  { name: 'up', declaration: 'up = close > open' },
  { name: 'useBand', declaration: 'useBand = close > open' },
  { name: 'signalUp', declaration: 'signalUp = close > open' },
  { name: 'enter', declaration: 'enter = close > open' },
  { name: 'a', declaration: 'a = close > open' },
  { name: 'b', declaration: 'b = close > high[1]' },
  { name: 'c', declaration: 'c = close < low[1]' },
  { name: 'd', declaration: 'd = volume > 1000' },

  { name: 'fast', declaration: 'fast = ema(close, 9)' },
  { name: 'slow', declaration: 'slow = ema(close, 21)' },
  { name: 'ema20', declaration: 'ema20 = ema(close, 20)' },
  { name: 'basis', declaration: 'basis = sma(close, 20)' },
  { name: 'dev', declaration: 'dev = stdev(close, 20)' },
  { name: 'upper', declaration: 'upper = sma(close, 20) + stdev(close, 20)' },
  { name: 'lower', declaration: 'lower = sma(close, 20) - stdev(close, 20)' },
  { name: 'atrValue', declaration: 'atrValue = high - low' },
  { name: 'hi', declaration: 'hi = highest(high, 20)' },
  { name: 'v', declaration: 'v = sma(volume, 20)' },
  { name: 'r', declaration: 'r = rsi(close, 14)' },
  { name: 'value', declaration: 'value = hlc3' },

  { name: 'len', declaration: 'len = 15' },
  { name: 'lookback', declaration: 'lookback = floor(sma(close, 20))' },
  { name: 'hitCount', declaration: 'hitCount = 0' },
  { name: 'strength', declaration: 'strength = 0.5' },
  { name: 'month', declaration: 'month = 11' },
  { name: 'lots', declaration: 'lots = 2' },
  { name: 'target', declaration: 'target = 0' },
  { name: 'total', declaration: 'var total = 0.0' },
  { name: 'i', declaration: 'var i = 0' },

  { name: 'values', declaration: 'var values: array<number> = [1.0, 2.0, 3.0]' },
  { name: 'closes', declaration: 'var closes: array<number> = [1.0, 2.0, 3.0]' },
  { name: 'window', declaration: 'var window: array<number> = [1.0, 2.0, 3.0]' },

  { name: 'sym', declaration: `sym = "${SYMBOL}"` },
  { name: 'method', declaration: 'method = "fast"' },

  { name: 'band', declaration: 'fn band(src, len = 20, mult = 3) => sma(src, len) * mult' },
  // OS8013 is the deprecation warning, and version 1 has deprecated nothing, so
  // its example names the old and the new spelling of a rename that has not
  // happened. They stand in for library names here, which is the only thing a
  // fragment can do with a name the library does not have yet.
  { name: 'oldName', declaration: 'fn oldName(src, len) => sma(src, len)' },
  { name: 'newName', declaration: 'fn newName(src, len) => sma(src, len)' },
];

const BY_NAME = new Map(CONVENTIONAL.map((one) => [one.name, one]));

/** Whether this name is one the fixture can bind. */
export const isConventional = (name) => BY_NAME.has(name);

const VERSION_LINE = /^\s*version\s+\d+\s*$/m;
const DECLARATION_LINE = /^\s*(study|strategy)\s*\(/m;

/**
 * Whether a block reaches for an order, and therefore needs a strategy header.
 *
 * Read from the library rather than from a list written here: `ORDER_NAMES` and
 * `STRATEGY_NAMESPACES` come out of the compiler's own surface, so a call added
 * to the order library is covered without anybody remembering this file.
 */
export function needsStrategy(block, orderNames, strategyNamespaces) {
  for (const name of orderNames) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(block)) return true;
  }
  for (const namespace of strategyNamespaces) {
    if (new RegExp(`\\b${namespace}\\.`).test(block)) return true;
  }
  return false;
}

/**
 * A name declared by the block itself, at any depth.
 *
 * Only a guard, and a deliberately blunt one: a block that declares a name is
 * never given the fixture's version of it, whatever the compiler said about the
 * order the two appear in. `OS2001`'s own example reads `spread` on its first
 * line and declares it on its second, and binding `spread` would report that
 * entry as raising nothing.
 */
const declarationOf = (name) =>
  new RegExp(`^\\s*(?:live\\s+)?(?:var\\s+)?${name}\\s*(?::[^=]*)?=|^\\s*fn\\s+${name}\\s*\\(|^\\s*for\\s+${name}\\s*=`, 'm');

/**
 * The program one block is compiled inside, and where the block starts in it.
 *
 * `free` is the set of names the caller's last compile reported as undefined.
 * Only those are bound, and only those of them the fixture knows and the block
 * does not declare itself.
 */
export function programFor(block, options = {}) {
  const { free = [], orderNames = [], strategyNamespaces = [] } = options;

  const head = [];
  if (!VERSION_LINE.test(block)) head.push('version 1');
  if (!DECLARATION_LINE.test(block)) {
    head.push(needsStrategy(block, orderNames, strategyNamespaces)
      ? 'strategy("Example")'
      : 'study("Example")');
  }

  const bound = [];
  for (const one of CONVENTIONAL) {
    if (!free.includes(one.name)) continue;
    if (declarationOf(one.name).test(block)) continue;
    bound.push(one);
  }

  const lines = [...head, ...bound.map((one) => one.declaration)];
  if (lines.length === 0) return { text: block, offset: 0, bound: [] };

  // One blank line between what this adds and the block, so that a reader of a
  // failure can see where the fragment starts, and so that a fragment opening
  // with a comment is not read as a continuation of the line above it.
  const text = `${lines.join('\n')}\n\n${block}`;
  return { text, offset: lines.length + 1, bound: bound.map((one) => one.name) };
}
