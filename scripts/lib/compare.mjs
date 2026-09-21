/**
 * The comparison of `conformance.md` section 6, written once.
 *
 * Two programs compare a channel: the adapter, holding what this engine
 * computed against an expected file, and the runner, holding what two engines
 * computed against each other. Section 9 says the second exists so that one
 * comparison happens in one place, which is what makes "exactly, whatever the
 * case declares" mean the same thing for both engines. So the rule lives here
 * and both call it, and neither carries a second reading of the page.
 *
 * ## The rule, step by step, and the wrong implementation each step refuses
 *
 * `compareNumbers` is the function section 6 prints, in its order:
 *
 * 1. Two absent values match, before anything numeric is asked.
 * 2. One absent and one present fail, whatever the tolerance: a number is not
 *    nearly absent, and warmup length is a specified property.
 * 3. A non-finite actual is `nonFinite`, its own outcome, never buried among
 *    numeric failures and never inside a tolerance.
 * 4. Signed zero is normalised, because no script can tell the two apart.
 * 5. Equality is over the binary64 bits, not over a decimal rendering, so a
 *    formatting decision can never make two different values look equal.
 * 6. With both bounds zero, anything past step 5 fails.
 * 7. The bound is `max(abs, rel * |e|)`, never a sum: exactly one bound is in
 *    force at any magnitude, and a failure names which one.
 *
 * Every step is a test in `tests/suite/compare.test.ts`, each written against
 * the implementation that would get it wrong.
 *
 * ## What is compared beyond a number
 *
 * Section 6's table: a bool exactly, a string as its code points with no
 * folding or trimming, and an ordered list by length first and then element
 * by element at the same index, naming the first index that differs. An
 * element of a channel is a flat object of named fields (section 4), compared
 * on the fields the expected element names and no others, which is section
 * 4's rule for a ledger row; a diagnostic is compared on four named fields
 * only, so that improving a message never breaks a case.
 *
 * ## What this does not reach, said plainly
 *
 * A per-column tolerance. Section 6 allows one and fixes no shape for it, so
 * none is read: the case's own tolerance applies to every channel, and a case
 * that needs a bound on one column and exactness on another cannot say so
 * here until the page says how.
 */

/** Section 4: what a diagnostic is compared on, and nothing else. */
export const DIAGNOSTIC_FIELDS = ['code', 'line', 'column', 'severity'];

/** The channel those four fields are the whole comparison of. */
const DIAGNOSTICS = 'diagnostics';

/** Section 6: exact, which is what a comparison is until a case declares otherwise. */
export const EXACT = Object.freeze({ abs: 0, rel: 0 });

const PASS = Object.freeze({ outcome: 'pass' });

const isAbsent = (value) => value === null || value === undefined;

/** The eight bytes of a binary64, as one integer, so equality is over bits. */
const VIEW = new DataView(new ArrayBuffer(8));
export function bits64(value) {
  VIEW.setFloat64(0, value);
  return VIEW.getBigUint64(0);
}

/** Step 4: negative zero and positive zero are one value here. */
const normaliseZero = (value) => (value === 0 ? 0 : value);

/**
 * Steps 1 to 8 of section 6 over one asserted numeric value.
 *
 * `bound` names what a failure broke: `absence` for step 2, `exact` for step
 * 6, and `abs` or `rel` for whichever of the two was in force at step 7.
 */
export function compareNumbers(actual, expected, abs, rel) {
  if (isAbsent(expected) && isAbsent(actual)) return PASS;
  if (isAbsent(expected) || isAbsent(actual)) return { outcome: 'fail', bound: 'absence' };
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return { outcome: 'nonFinite' };
  if (typeof expected !== 'number' || !Number.isFinite(expected)) return { outcome: 'nonFinite' };
  const a = normaliseZero(actual);
  const e = normaliseZero(expected);
  if (bits64(a) === bits64(e)) return PASS;
  const difference = Math.abs(a - e);
  if (abs === 0 && rel === 0) return { outcome: 'fail', bound: 'exact', difference };
  const relative = rel * Math.abs(e);
  if (difference <= Math.max(abs, relative)) return PASS;
  return { outcome: 'fail', bound: abs >= relative ? 'abs' : 'rel', difference };
}

/** The kind a value is compared as, which decides which row of section 6's table applies. */
function kindOf(value) {
  if (isAbsent(value)) return 'absent';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string') return 'string';
  return Array.isArray(value) ? 'list' : 'object';
}

/**
 * One value of any kind against another, under section 6's table.
 *
 * Absence is asked first for every kind, because the table says it is never
 * subject to tolerance and that is true of a string as much as of a number.
 * Two values of different kinds fail as `kind`: a bool where a number was
 * expected is not a near miss.
 */
export function compareValues(actual, expected, tolerance) {
  if (isAbsent(expected) || isAbsent(actual)) {
    return compareNumbers(actual, expected, tolerance.abs, tolerance.rel);
  }
  const kind = kindOf(expected);
  if (kind !== kindOf(actual)) return { outcome: 'fail', bound: 'kind' };
  if (kind === 'number') return compareNumbers(actual, expected, tolerance.abs, tolerance.rel);
  if (kind === 'bool' || kind === 'string') {
    return actual === expected ? PASS : { outcome: 'fail', bound: 'exact' };
  }
  return stableText(actual) === stableText(expected) ? PASS : { outcome: 'fail', bound: 'exact' };
}

/**
 * A value as a report writes it: the shortest round-tripping decimal for a
 * number, `none` for absence, and the value itself otherwise.
 */
export function written(value) {
  if (isAbsent(value)) return 'none';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return stableText(value);
}

/** A nested value as one piece of text, keys sorted, so two spellings are one. */
function stableText(value) {
  if (Array.isArray(value)) return `[${value.map(stableText).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const members = keys.map((key) => `${JSON.stringify(key)}:${stableText(value[key])}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/** The fields one element is compared on: section 4's four for a diagnostic, else the expected element's own. */
function fieldsOf(channel, expected) {
  if (channel === DIAGNOSTICS) return DIAGNOSTIC_FIELDS;
  return Object.keys(expected).sort();
}

/**
 * One channel: an ordered list, length first, then element by element.
 *
 * Returns null when the channel matches, else the first difference with the
 * channel, the index and the column it was found at, both values as a report
 * writes them, and the bound that was broken. A length mismatch is reported
 * at the first index one list has and the other lacks, before any element is
 * compared, as section 6's table says.
 */
export function compareChannel(channel, actual, expected, tolerance) {
  if (!Array.isArray(expected) || !Array.isArray(actual)) {
    return {
      outcome: 'fail',
      channel,
      index: null,
      column: null,
      bound: 'kind',
      expected: kindOf(expected),
      actual: kindOf(actual),
    };
  }
  if (actual.length !== expected.length) {
    return {
      outcome: 'fail',
      channel,
      index: Math.min(actual.length, expected.length),
      column: null,
      bound: 'length',
      expected: String(expected.length),
      actual: String(actual.length),
    };
  }
  for (let index = 0; index < expected.length; index += 1) {
    const want = expected[index];
    const got = actual[index];
    if (kindOf(want) !== 'object') {
      const result = compareValues(got, want, tolerance);
      if (result.outcome !== 'pass') return difference(result, channel, index, null, got, want);
      continue;
    }
    for (const column of fieldsOf(channel, want)) {
      const wanted = want[column];
      const found = kindOf(got) === 'object' ? got[column] : undefined;
      const result = compareValues(found, wanted, tolerance);
      if (result.outcome !== 'pass') return difference(result, channel, index, column, found, wanted);
    }
  }
  return null;
}

/** A failure of one value, placed. */
function difference(result, channel, index, column, actual, expected) {
  return {
    outcome: result.outcome,
    channel,
    index,
    column,
    expected: written(expected),
    actual: written(actual),
    ...(result.bound === undefined ? {} : { bound: result.bound }),
    ...(result.difference === undefined ? {} : { difference: written(result.difference) }),
  };
}

/**
 * Every asserted channel, in the case's order, to one outcome.
 *
 * Both sides hold every asserted channel by the time this is called; the
 * caller says what a missing one means, because it means different things to
 * an adapter (a malformed case) and to a runner (an engine that answered less
 * than it was asked).
 */
export function compareChannels(asserted, actual, expected, tolerance) {
  for (const channel of asserted) {
    const found = compareChannel(channel, actual[channel], expected[channel], tolerance);
    if (found !== null) return found;
  }
  return { outcome: 'pass' };
}

/**
 * The tolerance a case declares, held to section 6, or why it is refused.
 *
 * Absent means exact. A non-zero bound needs a reason, and a bound past the
 * cap the page prints is not a conformance case at all. `caps` is read out of
 * the page by `conformance-page.mjs`, so the number this refuses at is the
 * page's and not a copy.
 */
export function toleranceFrom(declared, caps) {
  if (isAbsent(declared)) return { ok: true, abs: 0, rel: 0 };
  if (typeof declared !== 'object') return { ok: false, reason: 'tolerance is not an object' };
  const abs = declared.abs ?? 0;
  const rel = declared.rel ?? 0;
  const numeric = typeof abs === 'number' && typeof rel === 'number';
  if (!numeric || !Number.isFinite(abs) || !Number.isFinite(rel)) {
    return { ok: false, reason: 'a tolerance bound is not a finite number' };
  }
  if (abs < 0 || rel < 0) return { ok: false, reason: 'a tolerance bound is below zero' };
  const stated = typeof declared.reason === 'string' && declared.reason.trim() !== '';
  if ((abs !== 0 || rel !== 0) && !stated) {
    return { ok: false, reason: 'a non-zero tolerance is declared with no reason (section 6)' };
  }
  if (abs > caps.abs || rel > caps.rel) {
    return {
      ok: false,
      reason:
        `a tolerance of abs ${String(abs)} and rel ${String(rel)} is looser than the cap of abs ` +
        `${String(caps.abs)} and rel ${String(caps.rel)}, so this is not a conformance case (section 6)`,
    };
  }
  return { ok: true, abs, rel };
}
