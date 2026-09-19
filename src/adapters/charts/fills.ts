/**
 * Declared bands into the chart's shaded bands.
 *
 * A band is two plot keys and two colours, which is the chart's own spec, so the
 * pair of keys crosses unchanged. Two details do not.
 *
 * **Opacity is a dimmer, not a second alpha.** A colour carries its own alpha
 * everywhere in the language, and the band's `opacity` multiplies whatever the
 * colours already are. That is exactly what the chart does with the field, so a
 * script that never touches it gets the colour it wrote.
 *
 * **A band with no colour of its own follows the first plot.** `stdlib.md` 14.2
 * says such a band is that plot's colour faded to twelve percent, and the plot's
 * colour may be one the host picked from its palette rather than one the script
 * wrote, so the band is pointed at the plot's settings key rather than at a value
 * read now. The twelve percent is then the dimmer, multiplied by whatever the
 * script asked for.
 */
import type { Band, CompiledProgram } from '../../core/emit/index.js';
import { cssColour } from './colours.js';
import type { ChartFill } from './contract.js';
import { boolField, colourField, isReference, numberField } from './fields.js';
import type { InputLookup } from './fields.js';

/**
 * The fade a band with no declared colour is drawn at, `stdlib.md` 14.2.
 *
 * It is written here because the adapter has to multiply it by the script's own
 * opacity, and a chart applies its own default only where the field is absent.
 */
const UNCOLOURED_FADE = 0.12;

export function buildFills(program: CompiledProgram, lookup: InputLookup): readonly ChartFill[] {
  const out: ChartFill[] = [];
  for (const band of program.outputs.fills) out.push(oneBand(program, band, lookup));
  return out;
}

function oneBand(program: CompiledProgram, band: Band, lookup: InputLookup): ChartFill {
  const up = colourField(band.colorUp, lookup);
  const down = colourField(band.colorDown, lookup);
  const overlay = boolField(band.overlay, lookup);
  const declared = up !== undefined || down !== undefined;
  const opacity = numberField(band.opacity, lookup, 1) * (declared ? 1 : UNCOLOURED_FADE);
  const follow = declared ? undefined : plotColourKey(program, band.between[0]);

  return {
    between: band.between,
    ...(up === undefined ? {} : { colorUp: cssColour(up) }),
    ...(down === undefined ? {} : { colorDown: cssColour(down) }),
    ...(isReference(band.colorUp) ? { colorUpKey: band.colorUp.input } : {}),
    ...(isReference(band.colorDown) ? { colorDownKey: band.colorDown.input } : {}),
    ...(follow === undefined ? {} : { colorUpKey: follow, colorDownKey: follow }),
    opacity,
    ...(overlay === undefined ? {} : { overlay }),
  };
}

/**
 * The settings key holding a plot's colour.
 *
 * A chart generates one appearance row per plot and names it after the plot,
 * except where the plot declares a colour key of its own, which is what a plot
 * whose colour came from an `input()` does. The two cases are the same two this
 * adapter produces in `plots.ts`.
 */
function plotColourKey(program: CompiledProgram, key: string): string {
  const plot = program.outputs.plots.find((one) => one.key === key);
  if (plot !== undefined && isReference(plot.color)) return plot.color.input;
  return `${key}:color`;
}
