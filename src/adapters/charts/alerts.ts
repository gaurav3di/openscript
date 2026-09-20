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
 * **Two things a declared alert carries have no field on the chart's entry, and
 * are left out rather than approximated.**
 *
 * The **message** is computed on the bar that fired, so it is a string per bar,
 * and the chart's entry takes either a fixed string or a function of the bars,
 * the columns and the settings. None of those reaches the per-instance store
 * where this adapter keeps a run's strings, so the message the script wrote
 * cannot travel and the entry carries the declared title instead. This is the
 * one output of the language that the descriptor narrows rather than carries.
 *
 * The **frequency** (`stdlib.md` 16.2) has no field at all. The chart evaluates
 * each entry once for each new bar, which is `"oncePerBar"`; `"once"` would need
 * state that lives as long as the study instance and `"everyUpdate"` would need
 * the entry to be evaluated again on a bar that is still moving, and the entry is
 * handed neither.
 */
import type { CompiledProgram } from '../../core/emit/index.js';
import type { ColumnSpec } from './columns.js';
import { stringField } from './fields.js';
import type { InputLookup } from './fields.js';
import type { ChartAlertContext, ChartAlertSpec } from './surfaces.js';

/** The key one alert's condition column travels under. */
export function alertKey(index: number): string {
  return `openscript:alert:${index}`;
}

export interface AlertBuild {
  readonly alerts: readonly ChartAlertSpec[];
  readonly columns: readonly ColumnSpec[];
}

/** The rows a user subscribes to, fixed before the first bar. */
export function buildAlerts(program: CompiledProgram, lookup: InputLookup): AlertBuild {
  const alerts: ChartAlertSpec[] = [];
  const columns: ColumnSpec[] = [];
  for (let index = 0; index < program.outputs.alerts.length; index += 1) {
    const declared = program.outputs.alerts[index];
    if (declared === undefined) continue;
    const key = alertKey(index);
    columns.push({ key, channel: declared.condChannel, part: 'flag' });
    alerts.push({
      id: declared.key,
      title: stringField(declared.title, lookup, ''),
      when: (ctx: ChartAlertContext): boolean => ctx.values[key]?.[ctx.index] === 1,
    });
  }
  return { alerts, columns };
}
