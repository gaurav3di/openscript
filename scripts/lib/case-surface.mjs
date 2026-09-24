/**
 * The `drawings` and `table` channels of `conformance.md` section 4, from what
 * the first engine hands a host.
 *
 * Neither is one value per bar, and neither is in a run's record: the record is
 * the reproducible run, and the objects and grids a study leaves behind are what
 * its last bar drew. So the backtest hands them back beside the record when a
 * case asks, and this turns them into the elements section 4 fixes, spelled as a
 * cell of the `values` channel is.
 *
 * **Nothing here decides what the channels hold.** The engine's `drawings()`
 * already leaves a deleted object out and orders the rest by creation, and its
 * `tables()` already holds only what the last execution wrote. What this adds is
 * the spelling, and the one thing the channel drops on purpose: the identity an
 * engine gives an object, which nothing outside that engine can name.
 */
import { reported } from './case-values.mjs';

/** The channel of drawing objects the script holds after the last bar. */
export const DRAWINGS = 'drawings';

/** The channel of the cells the last bar wrote into the grids. */
export const TABLE = 'table';

/** One drawing object as section 4 spells it. */
function drawingElement(drawing) {
  const element = {
    kind: drawing.kind,
    anchors: drawing.anchors.map((anchor) => ({ time: reported(anchor.time), price: reported(anchor.price) })),
  };
  for (const [name, value] of Object.entries(drawing.style)) element[name] = reported(value);
  return element;
}

/** The drawing objects, oldest first. */
export function drawingsAnswer(surface) {
  return surface.drawings.map(drawingElement);
}

/**
 * Every cell of every grid, grid by grid in declaration order and each in write
 * order, the grid named by the title its declaration carries under its key.
 */
export function tableAnswer(surface, program) {
  const titles = new Map(program.outputs.tables.map((one) => [one.key, one.title]));
  const out = [];
  for (const grid of surface.tables) {
    for (const cell of grid.cells) {
      out.push({
        table: titles.get(grid.key) ?? null,
        row: cell.row,
        col: cell.col,
        text: reported(cell.text),
        textColor: reported(cell.textColor),
        bgColor: reported(cell.bgColor),
        align: reported(cell.align),
      });
    }
  }
  return out;
}
