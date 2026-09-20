/**
 * Declared markers into the chart's bar anchored markers.
 *
 * **A marker is a discrete event with a label, not a column of prices.** Its
 * declaration fixes where it sits, what shape it is drawn as and what colour it
 * is, all before bar 0; only the text is read per bar, and a bar whose channel
 * holds no string has no marker at all (`compiled-program.md` 2.8). So this
 * walks one string channel per call site and produces an entry for each bar that
 * wrote one, which is why a `signal()` under an `if` marks the bars the branch
 * was taken and nothing anywhere else.
 *
 * **The text cannot travel in the values table**, which holds numbers, so the
 * markers are built here, once per calculation, and left in the run record that
 * `produced.ts` keeps for the hook to read.
 *
 * **Two of the chart's words are not the language's, and the translation is
 * here.** A position is `"above"` in the language and `aboveBar` on the chart;
 * `"price"` names no price for the language to put a marker at, so it becomes
 * the chart's in-bar position rather than a price this module chose. A shape is
 * the same word in both worlds for nine of the ten, and the tenth, `"label"`, is
 * a plate whose tail points at the anchor, so the side the marker sits on is
 * what decides which of the chart's two plates it is.
 *
 * A marker is anchored to a bar's time rather than to its index, because an
 * index moves when more history loads and a time does not.
 */
import type { CompiledProgram, Marker } from '../../core/emit/index.js';
import { cssColour } from './colours.js';
import type { ChartBar } from './contract.js';
import { colourField, stringField } from './fields.js';
import type { InputLookup } from './fields.js';
import type { Columns } from './run.js';
import type { ChartMarker, ChartMarkerPosition, ChartMarkerShape } from './surfaces.js';

/** The language's three positions, in the chart's own words. */
const POSITIONS: Readonly<Record<string, ChartMarkerPosition>> = {
  above: 'aboveBar',
  below: 'belowBar',
  price: 'inBar',
};

/** The nine shapes both worlds spell the same way. */
const SHAPES: readonly string[] = [
  'arrowUp',
  'arrowDown',
  'triangleUp',
  'triangleDown',
  'circle',
  'square',
  'diamond',
  'cross',
  'flag',
];

/** Which plate a `"label"` is: the tail points at the bar from where it sits. */
const PLATES: Readonly<Record<ChartMarkerPosition, ChartMarkerShape>> = {
  aboveBar: 'labelDown',
  belowBar: 'labelUp',
  inBar: 'text',
};

/**
 * Every marker the run produced, oldest bar first.
 *
 * The bars are walked once per call site rather than once in total, so the
 * entries of one call site are contiguous; the sort afterwards is what puts the
 * whole set in bar order, and it is stable, so two call sites that marked one
 * bar stay in declaration order on it.
 */
export function buildMarkers(
  program: CompiledProgram,
  lookup: InputLookup,
  bars: readonly ChartBar[],
  columns: Columns,
  defaultColour: string,
): readonly ChartMarker[] {
  const out: { readonly marker: ChartMarker; readonly index: number }[] = [];
  for (const declared of program.outputs.markers) {
    const style = styleOf(declared, lookup, defaultColour);
    const column = columns[declared.channel] ?? [];
    for (let index = 0; index < bars.length; index += 1) {
      const text = column[index];
      const bar = bars[index];
      if (typeof text !== 'string' || bar === undefined) continue;
      out.push({ index, marker: { ...style, time: bar.time, text } });
    }
  }
  return out.sort((a, b) => a.index - b.index).map((one) => one.marker);
}

/** The part of a marker that is declared once and is the same on every bar. */
function styleOf(
  declared: Marker,
  lookup: InputLookup,
  defaultColour: string,
): Omit<ChartMarker, 'time' | 'text'> {
  const colour = colourField(declared.color, lookup);
  const written = stringField(declared.position, lookup, 'above');
  // A declaration a host cannot draw takes the default rather than stopping the
  // study: the compiler refuses an unknown one with OS3008, so a value arriving
  // here that is not in the set came from a hand edited program.
  const position = POSITIONS[written] ?? 'aboveBar';
  return {
    position,
    shape: shapeOf(stringField(declared.shape, lookup, 'label'), position),
    // The language has no marker size and the chart needs one, so every marker
    // is drawn at the size the chart's own studies use.
    size: 'small',
    // `signal`'s colour defaults to absence, which `stdlib.md` 14.3 reads as the
    // host's own default for a marker. The chart has no default of its own to
    // fall back to, so a host that has one states it.
    color: colour === undefined ? defaultColour : cssColour(colour),
  };
}

function shapeOf(written: string, position: ChartMarkerPosition): ChartMarkerShape {
  if (SHAPES.includes(written)) return written as ChartMarkerShape;
  return PLATES[position];
}
