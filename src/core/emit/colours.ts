/**
 * The nineteen named colours, as channel values.
 *
 * **This table is standing in for something that does not exist yet, and it
 * should move the moment it does.** `stdlib.md` 11.1 says the exact channel
 * values of the named colours are fixed in the library manifest and are part of
 * the conformance suite. There is no library manifest in this repository, so an
 * emitter that has to write `["c", [r, g, b, a]]` into a plot's `color` field
 * has nowhere to read them from.
 *
 * The alternative was to give every named colour a per-bar channel and let the
 * engine's own manifest supply the value, which is a legal representation and
 * is what `colorChannel` is for. It does not work: a level's colour, a table's
 * `textColor` and a marker's `color` are declaration fields with no channel
 * beside them, so there are three places in the format where a named colour has
 * to be a value before bar 0 or it cannot be carried at all.
 *
 * The values are the long-standing web colour keywords of the same names, which
 * is what `language.md` 3.8's list is drawn from. They are written here rather
 * than guessed at three call sites, and `emit()` reports them as a gap so that
 * nobody mistakes this file for the authority it is standing in for.
 */
import type { Colour } from './program.js';

const OPAQUE = 1;

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

export function isColourName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHANNELS, name);
}

/** The colour a name denotes, at full opacity, or nothing if it is not one. */
export function namedColour(name: string): Colour | undefined {
  const channels = CHANNELS[name];
  return channels === undefined
    ? undefined
    : [channels[0], channels[1], channels[2], OPAQUE];
}

/**
 * A `#rrggbb` or `#rrggbbaa` literal, `language.md` 3.8.
 *
 * The alpha byte is divided by 255 here rather than left to an engine, because
 * `compiled-program.md` 2.9 requires the pool to carry the divided number: two
 * engines dividing separately is a place they can differ by one part in 255.
 */
export function hexColour(text: string): Colour | undefined {
  const digits = text.startsWith('#') ? text.slice(1) : text;
  if (digits.length !== 6 && digits.length !== 8) return undefined;
  if (!/^[0-9a-fA-F]+$/.test(digits)) return undefined;
  const byte = (at: number): number => Number.parseInt(digits.slice(at, at + 2), 16);
  const alpha = digits.length === 8 ? byte(6) / 255 : OPAQUE;
  return [byte(0), byte(2), byte(4), alpha];
}
