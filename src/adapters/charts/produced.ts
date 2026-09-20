/**
 * What one calculation produced that no column of numbers can carry.
 *
 * A chart's calculation returns a table of numbers, and four of the things a
 * study emits are not numbers: a marker's text, a cell's text, a drawing's
 * caption and a drawing's geometry. The chart reads each of those from its own
 * hook, and **those hooks are handed the run rather than the study**: the bars,
 * the table the calculation just returned, and the settings it was run with.
 * There is no per-instance store among them, so there is nowhere for the
 * calculation to leave the answer and nowhere for the hook to pick it up.
 *
 * This is that place, and it is deliberately the only one.
 *
 * **The settings object is the instance.** A chart resolves one settings object
 * per study instance and hands the same object to the calculation and to every
 * hook that follows it, so its identity is what tells three moving averages of
 * one script apart. A map keyed on it therefore holds one record per instance,
 * and holds it only while the chart still holds the settings: the map is weak,
 * so an instance the chart has dropped takes its record with it and nothing
 * here has to be told about removal.
 *
 * **A hook that finds no record draws nothing.** That is the honest answer to a
 * hook called before any calculation has run, and it is a gap rather than
 * somebody else's markers, which is what a single latched record would give on
 * a chart holding two studies.
 */
import type { ChartSettings } from './contract.js';
import type { ChartDrawing, ChartGrid, ChartMarker } from './surfaces.js';

/** One run's non-numeric output, as the three hooks read it. */
export interface Produced {
  readonly markers: readonly ChartMarker[];
  readonly table: ChartGrid | null;
  readonly drawings: readonly ChartDrawing[];
}

const NOTHING: Produced = { markers: [], table: null, drawings: [] };

const runs = new WeakMap<ChartSettings, Produced>();

/** What the calculation just produced, against the settings it was run with. */
export function remember(settings: ChartSettings, produced: Produced): void {
  runs.set(settings, produced);
}

/** What the last calculation for this instance produced, or nothing. */
export function producedFor(settings: ChartSettings): Produced {
  return runs.get(settings) ?? NOTHING;
}
