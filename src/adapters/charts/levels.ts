/**
 * Declared levels into the chart's horizontal levels, and the pane's range.
 *
 * A level's price is a channel rather than a constant, so it is evaluated on
 * every bar and **the level drawn is the one from the last bar executed**. That
 * is what makes a level that tracks the data possible at all, and the chart
 * recomputes its levels after every calculation for the same reason, so the two
 * meet without either giving anything up: the price travels in the values table
 * like any other column and is read at its last entry.
 *
 * A level whose last value is absent is not drawn, which is the rule for an
 * absent value reaching any drawn surface: a line breaks, a band stops, a level
 * is not drawn. Returning it at some substituted price would put a line on the
 * chart that the script did not ask for.
 *
 * The colour, the dash and the width are read against the settings the chart
 * holds at the moment it asks, not against the ones it held when the descriptor
 * was built, so a level whose colour came from an `input()` follows the dialog.
 */
import type { CompiledProgram } from '../../core/emit/index.js';
import { cssColour } from './colours.js';
import { levelKey } from './columns.js';
import type { ColumnSpec } from './columns.js';
import type { ChartLevel, ChartLevelContext, ChartLineStyle, ChartSettings } from './contract.js';
import { colourField, numberField, rangeField, stringField } from './fields.js';
import { lookupFor } from './settings.js';

const LINE_STYLES: readonly string[] = ['solid', 'dashed', 'dotted'];

export interface LevelsBuild {
  readonly columns: readonly ColumnSpec[];
  levels(ctx: ChartLevelContext): readonly ChartLevel[];
}

export function buildLevels(program: CompiledProgram): LevelsBuild {
  const columns: ColumnSpec[] = program.outputs.levels.map((declared, index) => ({
    key: levelKey(index),
    channel: declared.channel,
    part: 'value',
  }));

  return {
    columns,
    levels(ctx: ChartLevelContext): readonly ChartLevel[] {
      const lookup = lookupFor(program, settingsOf(ctx));
      const out: ChartLevel[] = [];
      for (let index = 0; index < program.outputs.levels.length; index += 1) {
        const declared = program.outputs.levels[index];
        if (declared === undefined) continue;
        const column = ctx.values?.[levelKey(index)];
        const price = column === undefined ? undefined : column[column.length - 1];
        if (typeof price !== 'number') continue;
        const colour = colourField(declared.color, lookup);
        const title = stringField(declared.title, lookup, '');
        const style = stringField(declared.lineStyle, lookup, 'dashed');
        out.push({
          price,
          ...(colour === undefined ? {} : { color: cssColour(colour) }),
          ...(title === '' ? {} : { title }),
          lineWidth: numberField(declared.lineWidth, lookup, 1),
          lineStyle: LINE_STYLES.includes(style) ? (style as ChartLineStyle) : 'dashed',
        });
      }
      return out;
    },
  };
}

/**
 * The study's own pane range, or nothing when it fixed none.
 *
 * It is read per call rather than once, because `range` is one of the fields a
 * script may write with an `input()`, and a chart asks again whenever the
 * settings change.
 */
export function buildRange(
  program: CompiledProgram,
): (settings: ChartSettings) => { readonly min: number; readonly max: number } | null {
  return (settings: ChartSettings) => rangeField(program.meta.range, lookupFor(program, settings));
}

/**
 * The settings a level context carries.
 *
 * The context spreads the settings keys onto itself and also carries them under
 * `settings`, so a caller that built one by hand from a settings bag alone still
 * works: the named member when there is one, the context itself otherwise.
 */
function settingsOf(ctx: ChartLevelContext): ChartSettings {
  const named = ctx.settings;
  return named === undefined ? (ctx as ChartSettings) : (named as ChartSettings);
}
