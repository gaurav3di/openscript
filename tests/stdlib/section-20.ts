/**
 * The figures `stdlib.md` section 20 prints, read out of the page.
 *
 * Section 20 is the manifest a second engine implements from, and the round
 * that wrote this found three sentences there that fixed nothing and two more
 * whose quantifier was wrong. Every one of them had been true of something once
 * and was measured by nobody since, which is the only way a sentence in a
 * normative document goes wrong.
 *
 * So the numbers now beside those refusals are not asserted against a constant
 * typed twice. They are read from the page and compared with the arithmetic run
 * here, which is the shape `tests/gate/gaps.test.ts` already uses for 20.11's
 * table: the document is the input, so rewording the claim, moving the figure or
 * changing the population fails a test instead of going on being quoted.
 *
 * A sentence this cannot find is a failure, not a skip. A figure nothing reads
 * is exactly what these tests exist to stop existing.
 */
import { readFileSync } from 'node:fs';

/** The specification page, from the source tree rather than from the build. */
const PAGE = new URL('../../../spec/stdlib.md', import.meta.url);

let held: string | undefined;

function page(): string {
  if (held === undefined) held = readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
  return held;
}

/**
 * The numbers one sentence of section 20 prints, in the order it prints them.
 *
 * `pattern` is matched against the page with its line breaks turned into spaces,
 * because a claim that sits across two lines is one sentence to a reader and the
 * wrapping is not a fact about it.
 */
export function figuresIn(pattern: RegExp, howMany: number): readonly number[] {
  const flat = page().replace(/\n/g, ' ');
  // A pattern loose enough to match two sentences would read one entry's figures
  // and assert them against another entry's arithmetic, which is how the first
  // draft of this file passed the wrong numbers to the wrong test. Ambiguity is
  // refused by name rather than resolved by taking the first one.
  const everywhere = [...flat.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
  if (everywhere.length > 1) {
    throw new Error(
      `${pattern} matches ${everywhere.length} sentences of stdlib.md, so which figures it reads ` +
        'is decided by whichever comes first. Narrow it to the one claim it is about.',
    );
  }
  const found = pattern.exec(flat);
  if (found === null) {
    throw new Error(
      `stdlib.md prints no sentence matching ${pattern}. Either the claim was reworded, in ` +
        'which case measure it again and bring this pattern with it, or it is gone, in which ' +
        'case this test goes with it. A figure nothing reads is what section 20 keeps going ' +
        'wrong by.',
    );
  }
  const numbers = found.slice(1, howMany + 1).map(Number);
  if (numbers.length !== howMany || numbers.some((one) => !Number.isFinite(one))) {
    throw new Error(`${pattern} matched and did not yield ${howMany} numbers: ${found[0]}`);
  }
  return numbers;
}

/** How many of two runs over the same arguments disagree, bit for bit. */
export function differing(
  count: number,
  one: (x: number) => number,
  other: (x: number) => number,
  at: (index: number) => number,
): number {
  let found = 0;
  for (let index = 0; index < count; index += 1) {
    const x = at(index);
    if (!Object.is(one(x), other(x))) found += 1;
  }
  return found;
}
