/**
 * What this chart cannot draw of what a program declares, refused before a bar.
 *
 * `compiled-program.md` section 11: a host draws what its surface has room for,
 * and refuses what it does not with OS6024 rather than drawing part of a study
 * and saying nothing. Two things a version 1 program can declare have no place
 * on this chart's surface, and both used to be dropped in silence.
 *
 * - **A second grid.** The descriptor has one `table` hook, so one grid reaches
 *   a pane. Merging two into it would put cells somewhere the script never
 *   asked for, and drawing the first alone is a study whose second panel never
 *   appears and whose cells look broken.
 * - **A band colour computed per bar.** The chart's band takes one colour for
 *   the whole run and has no channel to point at, so a band whose colour the
 *   script computes was drawn in the first plot's colour faded, which is a
 *   colour the script did not choose.
 *
 * The compiled program carries no source position for a declaration, so the
 * refusal names the declaration by its title, which is what a reader sees in
 * the legend and the settings dialog, and its span is the load's own.
 */
import { diagnosticFor, makeSpan } from '../../core/index.js';
import type { Diagnostic } from '../../core/index.js';
import type { CompiledProgram, Field } from '../../core/emit/index.js';

/** A load refusal has no line of its own: the program is what was refused. */
const AT_LOAD = makeSpan(0, 0, 0, 0);

export function undrawable(program: CompiledProgram): Diagnostic | undefined {
  const second = program.outputs.tables[1];
  if (second !== undefined) {
    return diagnosticFor('OS6024', AT_LOAD, {
      what: `the table ${titled(second.title, 'after the first')}, the second grid this study declares`,
      limit: 'a chart pane draws one grid',
    });
  }
  for (const band of program.outputs.fills) {
    if (band.colorUpChannel !== null || band.colorDownChannel !== null) {
      return diagnosticFor('OS6024', AT_LOAD, {
        what: "a band's colour that is computed per bar",
        limit: "a chart's band takes one colour for the whole run",
      });
    }
  }
  return undefined;
}

/** A title as a reader sees it, or a description where it is a setting's. */
function titled(title: Field, otherwise: string): string {
  return typeof title === 'string' ? `"${title}"` : otherwise;
}
