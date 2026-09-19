/**
 * A colour on either side of the boundary.
 *
 * The language carries a colour as four numbers, three whole channels and an
 * alpha that is an ordinary number from 0 to 1. A chart carries one as a CSS
 * string. The two directions are not symmetric and it is worth saying why.
 *
 * **Out of the language, nothing is lost.** The functional form is written
 * rather than eight hexadecimal digits, because a hexadecimal alpha is a byte
 * and the language's is not: `fade(x, 93)` is an alpha of 0.07, which no pair of
 * hexadecimal digits holds exactly, and a study whose band came back a shade off
 * would be a difference nobody could account for.
 *
 * **Into the language, alpha is the part that goes missing.** A chart's colour
 * control is a swatch with no alpha channel, so the value it stores back is six
 * digits and the transparency the script asked for is gone. Rather than turn
 * every translucent input opaque the first time somebody opens the dialog, a
 * value with no alpha of its own keeps the alpha the script declared, and only
 * a value that states one replaces it.
 *
 * A per-bar colour reaches a chart through the values table, which holds columns
 * of numbers, so it travels as two columns: the three channels packed into one
 * whole number, and the alpha beside them as itself. One column would have to
 * put the alpha in a byte and lose exactly what the functional form is here to
 * keep.
 */
import type { ColourValue, Value } from '../../core/engine/index.js';

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, and the two functional forms. */
const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTIONAL = /^rgba?\(([^)]*)\)$/i;

/** The CSS spelling of a colour. */
export function cssColour(colour: ColourValue): string {
  return `rgba(${colour.r}, ${colour.g}, ${colour.b}, ${colour.a})`;
}

/** The CSS spelling of a value that may not be a colour at all. */
export function cssOf(value: Value): string | undefined {
  return isColourValue(value) ? cssColour(value) : undefined;
}

export function isColourValue(value: Value): value is ColourValue {
  return typeof value === 'object' && value !== null && value.tag === 'color';
}

export function colourOf(r: number, g: number, b: number, a: number): ColourValue {
  return { tag: 'color', r: channel(r), g: channel(g), b: channel(b), a: a < 0 ? 0 : a > 1 ? 1 : a };
}

/**
 * A CSS colour back into the language's four numbers.
 *
 * `alpha` is what a value with no alpha of its own is given: the alpha the
 * script declared for that input, so a swatch that cannot express transparency
 * does not remove it. Anything unparseable is nothing, which the caller turns
 * into the refusal the input's own validation would have produced.
 */
export function parseColour(text: string, alpha: number): ColourValue | undefined {
  const trimmed = text.trim();

  const hex = HEX.exec(trimmed);
  if (hex !== null) {
    const digits = hex[1] ?? '';
    const wide = digits.length === 3 || digits.length === 4;
    if (!wide && digits.length !== 6 && digits.length !== 8) return undefined;
    const at = (index: number): number => {
      const pair = wide
        ? `${digits.charAt(index)}${digits.charAt(index)}`
        : digits.slice(index * 2, index * 2 + 2);
      return Number.parseInt(pair, 16);
    };
    const opaque = digits.length === 4 || digits.length === 8;
    return colourOf(at(0), at(1), at(2), opaque ? at(3) / 255 : alpha);
  }

  const functional = FUNCTIONAL.exec(trimmed);
  if (functional === null) return undefined;
  const parts = (functional[1] ?? '')
    .split(/[\s,/]+/)
    .filter((one) => one.length > 0)
    .map((one) => Number(one));
  if (parts.length < 3 || parts.some((one) => !Number.isFinite(one))) return undefined;
  const [r, g, b, a] = parts as [number, number, number, number | undefined];
  return colourOf(r, g, b, a ?? alpha);
}

/** The three channels as one whole number, for a column of per-bar colours. */
export function packChannels(colour: ColourValue): number {
  return (colour.r * 256 + colour.g) * 256 + colour.b;
}

/** The CSS spelling of a packed triple and the alpha that travelled beside it. */
export function unpackColour(packed: number, alpha: number): string {
  const b = packed % 256;
  const g = ((packed - b) / 256) % 256;
  const r = (packed - b - g * 256) / 65_536;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A whole channel inside the range a chart can draw.
 *
 * A colour arriving from a chart has whole channels already: every control that
 * writes one writes an integer. The rounding is here for a hand written string
 * rather than as a rule of the language, whose own rounding applies where a
 * script computes a colour and is the engine's to apply, not this module's.
 */
function channel(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const whole = Math.round(x);
  return whole < 0 ? 0 : whole > 255 ? 255 : whole;
}
