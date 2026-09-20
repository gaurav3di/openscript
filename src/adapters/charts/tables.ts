/**
 * Declared grids into the chart's summary grid.
 *
 * **A table is written, not plotted.** It is the one output that is not a value
 * per bar: its cells are written by library calls against a handle, into a
 * buffer the engine empties at the start of every execution of a bar
 * (`compiled-program.md` 2.8 and 5.1). What survives is what the last executed
 * bar wrote, which is what a grid pinned to a corner of a pane shows.
 *
 * **So it is read once, after the run, and never per bar.** The obvious way to
 * get this wrong is to collect a grid for every bar of a long history in order
 * to display the last one, which costs the length of the history and throws all
 * of it away. The engine holds one buffer per grid rather than one per bar, and
 * this reads it exactly once per calculation, so a hundred thousand bars cost
 * the same as ten.
 *
 * A script pays the other half of that bill for itself: `cell()` on every bar of
 * a long history does the work of writing a grid that only the last bar's copy
 * is kept from, and the documentation says to guard it with `bar.isLast`. That
 * is a script's decision and not one this can make for it, because the buffer is
 * cleared per bar and an engine cannot know which execution is the last one
 * until it is.
 *
 * **The engine's cells are sparse and the chart's grid is dense.** A script
 * writes the cells it has something to say about; the chart draws rows of cells.
 * So the declared size is filled with blank cells and the written ones are
 * placed into it, which is what `language.md` 6.7 asks for from the other
 * direction: a cell nothing was written into is blank, never a zero.
 *
 * **A chart pane holds one grid and the language declares as many as it likes.**
 * The descriptor has one `table` hook, so the first declared grid is the one
 * drawn and any after it are not. That is a gap in the descriptor rather than a
 * choice worth making here, and a study whose second grid never appears would
 * otherwise be a study with no explanation.
 */
import type { CompiledProgram, Grid as DeclaredGrid } from '../../core/emit/index.js';
import type { Grid, GridCell } from '../../core/engine/index.js';
import { cssColour, cssOf } from './colours.js';
import { colourField, numberField, stringField } from './fields.js';
import type { InputLookup } from './fields.js';
import type {
  ChartCell,
  ChartCellAlign,
  ChartGrid,
  ChartTablePosition,
} from './surfaces.js';

/** The language's four corners, in the chart's own words. */
const CORNERS: Readonly<Record<string, ChartTablePosition>> = {
  topLeft: 'top-left',
  topRight: 'top-right',
  bottomLeft: 'bottom-left',
  bottomRight: 'bottom-right',
};

const ALIGNMENTS: readonly string[] = ['left', 'center', 'right'];

/** The grid a chart draws, from the declaration and the engine's buffer. */
export function buildTable(
  program: CompiledProgram,
  lookup: InputLookup,
  written: readonly Grid[],
): ChartGrid | null {
  const declared = program.outputs.tables[0];
  if (declared === undefined) return null;
  return oneTable(declared, lookup, written[0]);
}

function oneTable(
  declared: DeclaredGrid,
  lookup: InputLookup,
  written: Grid | undefined,
): ChartGrid {
  const position = stringField(declared.position, lookup, 'topRight');
  const textColour = colourField(declared.options.textColor, lookup);
  const bgColour = colourField(declared.options.bgColor, lookup);
  const rows = whole(numberField(declared.rows, lookup, 0));
  const cols = whole(numberField(declared.cols, lookup, 0));
  const fallback = textColour === undefined ? undefined : cssColour(textColour);

  const grid: ChartCell[][] = [];
  for (let row = 0; row < rows; row += 1) {
    grid.push(new Array<ChartCell>(cols).fill({ text: '' }));
  }
  for (const cell of written?.cells ?? []) {
    const built = oneCell(cell, fallback);
    const line = grid[cell.row];
    if (built === undefined || line === undefined || cell.col >= cols) continue;
    line[cell.col] = built;
  }

  return {
    rows: grid,
    options: {
      position: CORNERS[position] ?? 'top-right',
      borderWidth: numberField(declared.options.borderWidth, lookup, 0),
      ...(bgColour === undefined ? {} : { background: cssColour(bgColour) }),
    },
  };
}

/**
 * One written cell, or none.
 *
 * A cell whose text is absent is dropped rather than drawn, which leaves the
 * blank cell that was already in its place: absence reaching a drawing surface
 * is a gap, and a blank cell is what a grid draws where nothing was written
 * (`language.md` 6.7).
 *
 * The grid's own text colour is written into each cell that named none, because
 * the chart carries a text colour per cell and the language declares one for the
 * whole grid as well.
 */
function oneCell(cell: GridCell, fallback: string | undefined): ChartCell | undefined {
  if (typeof cell.text !== 'string') return undefined;
  const align = typeof cell.align === 'string' && ALIGNMENTS.includes(cell.align)
    ? (cell.align as ChartCellAlign)
    : 'left';
  const textColour = cssOf(cell.textColor) ?? fallback;
  const bgColour = cssOf(cell.bgColor);
  return {
    text: cell.text,
    ...(textColour === undefined ? {} : { textColor: textColour }),
    ...(bgColour === undefined ? {} : { bgColor: bgColour }),
    align,
  };
}

/** A declared size, as a count of rows or columns a grid can be built with. */
function whole(size: number): number {
  return size > 0 ? Math.floor(size) : 0;
}
