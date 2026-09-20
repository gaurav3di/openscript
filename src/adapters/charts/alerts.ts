/**
 * Declared alerts into the chart's watched conditions.
 *
 * An `alert()` call site is lifted by the compiler into one declared entry: a
 * boolean channel carrying the chain of guards that reaches the call, a string
 * channel carrying the message, a stable key and a title (`stdlib.md` 16.1). The
 * chart's own watched condition is a row with a stable id, a title and a
 * predicate it evaluates per bar, so the mapping is the boolean channel: it
 * rides the values table as a column, and the predicate reads that column at the
 * bar it is judging.
 *
 * **Nothing fires for history, and the chart is what applies that.** It judges
 * only bars that are new since it last looked, so a study added at noon to a
 * chart holding two years announces none of them, and a settings change, which
 * recomputes the whole history without adding a bar, announces nothing either.
 * That is `stdlib.md` 16.2 reached from the host's side rather than the engine's,
 * and it is the rule the descriptor's own slot already carries.
 *
 * **An absent condition is not a true one.** The column holds a number where the
 * channel published `true` and `null` everywhere else, so an alert under a guard
 * that was absent during warmup does not fire. That is `language.md` 6.6's three
 * valued logic reaching a surface, and it is the most common reason a new alert
 * looks dead.
 *
 * **The message is computed on the bar that fired, and it travels.** It is a
 * string per bar, so it cannot ride the table of numbers the calculation
 * returns, and the entry's own field takes a function of the same context the
 * predicate was judged on: the bars, the columns, the settings and the bar's
 * index. The settings are the study instance (`produced.ts`), so the message
 * reads the run's own string channel there, at the one bar it is asked about,
 * and the alert a user receives carries the numbers the script put in it.
 *
 * A message the bar published nothing for falls back to the declared title,
 * which is what the chart itself does for an entry that states no message. That
 * is the honest answer for the one case that reaches it: `message` is a required
 * argument, so the string is absent only where the expression that built it was,
 * and absence reaching a surface draws nothing of its own (`language.md` 6.7).
 *
 * **One thing a declared alert carries still has no field on the chart's entry**
 * and is left out rather than approximated. The **frequency** (`stdlib.md` 16.2)
 * has nowhere to land: the chart evaluates each entry once for each new bar,
 * which is `"oncePerBar"`; `"once"` would need state that lives as long as the
 * study instance and `"everyUpdate"` would need the entry to be evaluated again
 * on a bar that is still moving, and the entry is handed neither. It is recorded
 * with its reason in `spec/chart-narrowings.json`, which
 * `scripts/check-chart-surface.mjs` refuses to let grow in silence.
 */
import type { CompiledProgram } from '../../core/emit/index.js';
import type { ColumnSpec } from './columns.js';
import { stringField } from './fields.js';
import type { InputLookup } from './fields.js';
import type { MessageColumn } from './produced.js';
import { producedFor } from './produced.js';
import type { Columns } from './run.js';
import type { ChartAlertContext, ChartAlertSpec } from './surfaces.js';

/** The key one alert's condition column travels under. */
export function alertKey(index: number): string {
  return `openscript:alert:${index}`;
}

export interface AlertBuild {
  readonly alerts: readonly ChartAlertSpec[];
  readonly columns: readonly ColumnSpec[];
}

/**
 * Each declared alert's message channel, as the run left it.
 *
 * Indexed by the alert's position in `outputs.alerts`, so an entry the program
 * declares without a message channel holds an empty column rather than shifting
 * the ones after it.
 */
export function alertMessages(
  program: CompiledProgram,
  columns: Columns,
): readonly MessageColumn[] {
  return program.outputs.alerts.map((declared) => {
    const channel = declared.messageChannel;
    return channel === null ? [] : (columns[channel] ?? []);
  });
}

/** The rows a user subscribes to, fixed before the first bar. */
export function buildAlerts(program: CompiledProgram, lookup: InputLookup): AlertBuild {
  const alerts: ChartAlertSpec[] = [];
  const columns: ColumnSpec[] = [];
  for (let index = 0; index < program.outputs.alerts.length; index += 1) {
    const declared = program.outputs.alerts[index];
    if (declared === undefined) continue;
    const key = alertKey(index);
    const title = stringField(declared.title, lookup, '');
    columns.push({ key, channel: declared.condChannel, part: 'flag' });
    alerts.push({
      id: declared.key,
      title,
      // A program whose alert has no message channel states no message, and the
      // chart's own default for that is the title. Declaring a function that
      // returned the title anyway would hide that fact behind this adapter.
      ...(declared.messageChannel === null
        ? {}
        : {
            message: (ctx: ChartAlertContext): string =>
              messageAt(producedFor(ctx.settings).messages[index], ctx.index) ?? title,
          }),
      when: (ctx: ChartAlertContext): boolean => ctx.values[key]?.[ctx.index] === 1,
    });
  }
  return { alerts, columns };
}

/** The message one bar published, or nothing where it published none. */
function messageAt(column: MessageColumn | undefined, index: number): string | undefined {
  const value = column?.[index];
  return typeof value === 'string' ? value : undefined;
}
