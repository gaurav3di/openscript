/**
 * Colour: the nineteen names and the calls that compute one.
 *
 * **The channel table is standing in for something that does not exist yet.**
 * `stdlib.md` 11.1 fixes the exact channel values of the named colours in the
 * library manifest and makes them part of the conformance suite; there is no
 * manifest in this repository, so the compiler carries a copy for the colours
 * it has to write into a declaration field before bar 0, and the engine carries
 * one for the colours a script computes on a bar. Two copies of one fact is
 * exactly what should not happen, and `tests/engine/colours.test.ts` asserts
 * they agree, so the day the manifest exists both are deleted rather than
 * reconciled.
 *
 * Every call that computes a colour rounds red, green and blue to a whole
 * number before it returns, halves away from zero, which `colour()` in the
 * value module does. Alpha is not rounded: it stays a binary64 number from 0 to
 * 1 and becomes a byte only at the contract boundary, where the conversion is
 * one way and is not a round trip (3.1).
 */
import type { Value } from '../values/index.js';
import { colour } from '../values/index.js';
import { colourAt, entry, numberAt } from './binding.js';
import type { ManifestEntry } from './binding.js';

const CHANNELS: Readonly<Record<string, readonly [number, number, number]>> = {
  aqua: [0, 255, 255],
  black: [0, 0, 0],
  blue: [0, 0, 255],
  brown: [165, 42, 42],
  fuchsia: [255, 0, 255],
  gray: [128, 128, 128],
  green: [0, 128, 0],
  lime: [0, 255, 0],
  maroon: [128, 0, 0],
  navy: [0, 0, 128],
  olive: [128, 128, 0],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
  purple: [128, 0, 128],
  red: [255, 0, 0],
  silver: [192, 192, 192],
  teal: [0, 128, 128],
  white: [255, 255, 255],
  yellow: [255, 255, 0],
};

/** The nineteen names, for a test that has to compare two tables. */
export const COLOUR_NAMES: readonly string[] = Object.keys(CHANNELS);

export function namedColour(name: string): Value {
  const channels = CHANNELS[name];
  return channels === undefined ? null : colour(channels[0], channels[1], channels[2], 1);
}

export const COLOUR_ENTRIES: readonly ManifestEntry[] = [
  ...COLOUR_NAMES.map((name) => entry(name, '', () => namedColour(name))),

  entry('rgb', 'r g b', (_ctx, args) => {
    const r = numberAt(args, 0);
    const g = numberAt(args, 1);
    const b = numberAt(args, 2);
    if (r === null || g === null || b === null) return null;
    return colour(r, g, b, 1);
  }),

  entry('rgba', 'r g b a', (_ctx, args) => {
    const r = numberAt(args, 0);
    const g = numberAt(args, 1);
    const b = numberAt(args, 2);
    const a = numberAt(args, 3);
    if (r === null || g === null || b === null || a === null) return null;
    return colour(r, g, b, a);
  }),

  // `fade` takes transparency, not opacity, and the argument is a percentage:
  // 100 is invisible. Both spellings follow the way a chart's own style controls
  // are labelled, and the two conventions are opposites, so the arithmetic is
  // written out rather than left to a reader to infer from the name.
  entry('fade', 'color percent', (_ctx, args) => {
    const base = colourAt(args, 0);
    const percent = numberAt(args, 1);
    if (base === null || percent === null) return null;
    return colour(base.r, base.g, base.b, base.a * (1 - percent / 100));
  }),

  entry('mix', 'a b weight', (_ctx, args) => {
    const a = colourAt(args, 0);
    const b = colourAt(args, 1);
    const weight = numberAt(args, 2);
    if (a === null || b === null || weight === null) return null;
    const blend = (from: number, to: number): number => from + (to - from) * weight;
    return colour(
      blend(a.r, b.r),
      blend(a.g, b.g),
      blend(a.b, b.b),
      blend(a.a, b.a),
    );
  }),

  entry('alpha', 'color', (_ctx, args) => {
    const base = colourAt(args, 0);
    return base === null ? null : base.a;
  }),

  entry('withAlpha', 'color a', (_ctx, args) => {
    const base = colourAt(args, 0);
    const a = numberAt(args, 1);
    if (base === null || a === null) return null;
    return colour(base.r, base.g, base.b, a);
  }),
];
