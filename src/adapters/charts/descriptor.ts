/**
 * A compiled program as a chart's indicator descriptor.
 *
 * The whole of the mapping is here in one function, because the mapping is the
 * adapter: every other file in this module is one column of the table this
 * assembles. `compiled-program.md` 11 writes that table out, and the shape of
 * this function follows it line for line.
 *
 * **The calculation drives the engine and computes nothing.** A descriptor's
 * `calc` is the chart asking for one column per plot; the engine already
 * produces exactly that, one channel at a time, so `calc` loads a program, runs
 * the bars and reads the channels out. Nothing here knows what a moving average
 * is, and that is the point: a second implementation of any of it would be a
 * second thing to keep in step with the specification.
 *
 * **The id is the source hash, not the title.** A saved layout stores the
 * descriptor id and the settings, and two scripts can easily share a title while
 * an edited script keeps the one it had. Hashing the source means the same
 * script restores to the same study and an edited one does not silently inherit
 * the settings of the study it replaced. A host that manages its own script
 * identities passes its own id instead.
 */
import type { CompiledProgram } from '../../core/emit/index.js';
import { valuesFrom } from './columns.js';
import type {
  ChartBar,
  ChartCalcContext,
  ChartDescriptor,
  ChartSettings,
  ChartStore,
  ChartValues,
} from './contract.js';
import { buildFills } from './fills.js';
import { boolField, stringField } from './fields.js';
import { buildLevels, buildRange } from './levels.js';
import { buildPlots } from './plots.js';
import { fullRun, tailRun } from './run.js';
import type { ChartAdapterOptions } from './run.js';
import { inputRows, lookupFor } from './settings.js';

export function descriptorFor(
  program: CompiledProgram,
  options: ChartAdapterOptions = {},
): ChartDescriptor {
  // The declared shape is fixed before bar 0, so the fields that make it up are
  // read against the declared defaults. The ones a settings change may move
  // afterwards carry a settings key instead of a value, and the two that cannot
  // are read again per call: a level's style and the pane's range.
  const declared = lookupFor(program, {});

  const overlay = boolField(program.meta.overlay, declared) === true;
  const plots = buildPlots(program, declared, !overlay);
  const levels = buildLevels(program);
  const fills = buildFills(program, declared);
  const columns = [...plots.columns, ...levels.columns];
  // A study's own group is its category, and a host may name one for a script
  // whose author left the group blank.
  const group = stringField(program.meta.group, declared, '');
  const category = group === '' ? options.category : group;

  return {
    id: options.id ?? `openscript:${program.source.hash}`,
    name: stringField(program.meta.title, declared, 'Study'),
    ...(category === undefined ? {} : { category }),
    placement: overlay ? 'onchart' : 'pane',
    inputs: inputRows(program),
    plots: plots.plots,
    ...(fills.length === 0 ? {} : { fills }),

    calc(
      bars: readonly ChartBar[],
      settings: ChartSettings,
      store: ChartStore,
      ctx?: ChartCalcContext,
    ): ChartValues {
      return valuesFrom(columns, fullRun(program, bars, settings, store, ctx, options), 0, bars.length);
    },

    calcTail(
      bars: readonly ChartBar[],
      settings: ChartSettings,
      fromIndex: number,
      _previous: ChartValues,
      store: ChartStore,
      ctx?: ChartCalcContext,
    ): ChartValues | null {
      const ran = tailRun(program, bars, fromIndex, settings, store, ctx, options);
      return ran === null ? null : valuesFrom(columns, ran, fromIndex, bars.length);
    },

    ...(program.outputs.levels.length === 0 ? {} : { levels: levels.levels }),
    ...(program.meta.range === null ? {} : { range: buildRange(program) }),
  };
}
