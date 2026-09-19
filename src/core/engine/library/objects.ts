/**
 * Drawing objects and grid cells, `stdlib.md` section 14.
 *
 * Neither goes through a channel, and `compiled-program.md` 4.11 says why: both
 * would need an unbounded number of them, and a channel is by definition one
 * value per bar. A line, label or box is an object in the heap that a script
 * creates once and mutates over many bars; a grid is a handle the engine puts
 * in a slot and its cells are a per-bar buffer.
 *
 * **A drawing object rolls back with everything else.** A moving bar that
 * re-executes ten times must leave one box behind rather than ten, and the
 * object is in the heap, so the heap's undo journal already carries it. Section
 * 6.1's list of what a checkpoint holds does not name the drawing roster
 * separately, and it has to be part of it: without that, creation would survive
 * a rollback and the chart would accumulate a copy per tick.
 *
 * **A deleted object stays deleted rather than becoming absent.** OS4005 names
 * the bar it was deleted on, because a script that mutates a stale handle is
 * holding a name for something it already threw away, and answering "absent"
 * would hide that behind a drawing that quietly stopped moving.
 */
import type { DrawingObject, GridCell, Value } from '../values/index.js';
import { isDrawing, reference } from '../values/index.js';
import { entry, refAt, valueAt, wholeAt } from './binding.js';
import type { CallContext, ManifestEntry } from './binding.js';
import { clearArray } from './arrays.js';

/** The drawing object a handle names, refusing one the script already deleted. */
function drawing(ctx: CallContext, args: readonly Value[], index: number): DrawingObject | undefined {
  const handle = refAt(args, index);
  if (handle === null) return undefined;
  const object = ctx.heap.get(handle.id);
  if (object === undefined || !isDrawing(object)) return undefined;
  if (object.deleted) ctx.guard.deleted(ctx.span, object.kind, object.deletedAt);
  ctx.heap.touch(handle.id);
  return object;
}

function make(ctx: CallContext, kind: DrawingObject['kind'], props: Record<string, Value>): Value {
  const id = ctx.heap.allocate({ kind, props, deleted: false, deletedAt: -1 });
  return reference(id);
}

/** A mutator that writes named fields onto an existing object. */
function setter(
  name: string,
  params: string,
  fields: (args: readonly Value[]) => Record<string, Value>,
): ManifestEntry {
  return entry(name, params, (ctx, args) => {
    const object = drawing(ctx, args, 0);
    if (object === undefined) return null;
    object.props = { ...object.props, ...fields(args) };
    return null;
  });
}

export const OBJECT_ENTRIES: readonly ManifestEntry[] = [
  entry('draw.line', 't1 p1 t2 p2 color width style extendLeft extendRight', (ctx, args) =>
    make(ctx, 'line', {
      t1: valueAt(args, 0),
      p1: valueAt(args, 1),
      t2: valueAt(args, 2),
      p2: valueAt(args, 3),
      color: valueAt(args, 4),
      width: valueAt(args, 5),
      style: valueAt(args, 6),
      extendLeft: valueAt(args, 7),
      extendRight: valueAt(args, 8),
    }),
  ),

  entry('draw.label', 't p text color textColor align tooltip', (ctx, args) =>
    make(ctx, 'label', {
      t: valueAt(args, 0),
      p: valueAt(args, 1),
      text: valueAt(args, 2),
      color: valueAt(args, 3),
      textColor: valueAt(args, 4),
      align: valueAt(args, 5),
      tooltip: valueAt(args, 6),
    }),
  ),

  entry(
    'draw.box',
    't1 p1 t2 p2 color fillColor opacity width text textColor tooltip',
    (ctx, args) =>
      make(ctx, 'box', {
        t1: valueAt(args, 0),
        p1: valueAt(args, 1),
        t2: valueAt(args, 2),
        p2: valueAt(args, 3),
        color: valueAt(args, 4),
        fillColor: valueAt(args, 5),
        opacity: valueAt(args, 6),
        width: valueAt(args, 7),
        text: valueAt(args, 8),
        textColor: valueAt(args, 9),
        tooltip: valueAt(args, 10),
      }),
  ),

  entry('draw.polyline', 'times prices color width closed fillColor opacity', (ctx, args) =>
    make(ctx, 'polyline', {
      times: valueAt(args, 0),
      prices: valueAt(args, 1),
      color: valueAt(args, 2),
      width: valueAt(args, 3),
      closed: valueAt(args, 4),
      fillColor: valueAt(args, 5),
      opacity: valueAt(args, 6),
    }),
  ),

  setter('draw.setFrom', 'obj t p', (args) => ({ t1: valueAt(args, 1), p1: valueAt(args, 2) })),
  setter('draw.setTo', 'obj t p', (args) => ({ t2: valueAt(args, 1), p2: valueAt(args, 2) })),
  setter('draw.setAt', 'obj t p', (args) => ({ t: valueAt(args, 1), p: valueAt(args, 2) })),
  setter('draw.setBounds', 'obj t1 p1 t2 p2', (args) => ({
    t1: valueAt(args, 1),
    p1: valueAt(args, 2),
    t2: valueAt(args, 3),
    p2: valueAt(args, 4),
  })),
  setter('draw.setPoints', 'obj times prices', (args) => ({
    times: valueAt(args, 1),
    prices: valueAt(args, 2),
  })),
  setter('draw.setText', 'obj text', (args) => ({ text: valueAt(args, 1) })),
  setter('draw.setColor', 'obj color', (args) => ({ color: valueAt(args, 1) })),
  setter('draw.setTextColor', 'obj color', (args) => ({ textColor: valueAt(args, 1) })),
  setter('draw.setFillColor', 'obj color', (args) => ({ fillColor: valueAt(args, 1) })),
  setter('draw.setWidth', 'obj width', (args) => ({ width: valueAt(args, 1) })),
  setter('draw.setStyle', 'obj style', (args) => ({ style: valueAt(args, 1) })),
  setter('draw.setExtend', 'obj left right', (args) => ({
    extendLeft: valueAt(args, 1),
    extendRight: valueAt(args, 2),
  })),
  setter('draw.setTooltip', 'obj text', (args) => ({ tooltip: valueAt(args, 1) })),

  entry('draw.delete', 'obj', (ctx, args) => {
    const handle = refAt(args, 0);
    if (handle === null) return null;
    const object = ctx.heap.get(handle.id);
    if (object === undefined || !isDrawing(object)) return null;
    // Deleting twice is not an error: the script asked for the object to be
    // gone and it is gone. Only a change to a deleted object is OS4005.
    if (object.deleted) return null;
    ctx.heap.touch(handle.id);
    object.deleted = true;
    object.deletedAt = ctx.bar.index;
    return null;
  }),

  entry('draw.deleteAll', '', (ctx) => {
    for (const { id, object } of ctx.heap.drawings()) {
      ctx.heap.touch(id);
      object.deleted = true;
      object.deletedAt = ctx.bar.index;
    }
    return null;
  }),

  entry('draw.count', '', (ctx) => ctx.heap.drawings().length),

  /**
   * `cell(t, row, col, text, ...)`: one cell of a grid for this bar.
   *
   * The buffer is emptied at step 3 of every execution, so a re-executed bar
   * rebuilds the whole grid and a checkpoint holds none of it. That is why a
   * grid needs no rollback of its own while a drawing object does.
   */
  entry('cell', 't row col text textColor bgColor align', (ctx, args) => {
    const handle = refAt(args, 0);
    if (handle === null) return null;
    const object = ctx.heap.get(handle.id);
    if (object === undefined || object.kind !== 'table') return null;
    const row = wholeAt(ctx, 'cell', 'row', args, 1);
    const col = wholeAt(ctx, 'cell', 'col', args, 2);
    if (row === null || col === null) return null;
    if (row >= object.rows || col >= object.cols) {
      ctx.guard.badIndex(
        ctx.span,
        ctx.nameOf(valueAt(args, 0)),
        `${row}, ${col}`,
        object.rows * object.cols,
      );
    }
    const written: GridCell = {
      row,
      col,
      text: valueAt(args, 3),
      textColor: valueAt(args, 4),
      bgColor: valueAt(args, 5),
      align: valueAt(args, 6),
    };
    object.cells.push(written);
    return null;
  }),

  entry('clear', 'handle', (ctx, args) => {
    if (clearArray(ctx, args)) return null;
    const handle = refAt(args, 0);
    if (handle === null) return null;
    const object = ctx.heap.get(handle.id);
    if (object === undefined || object.kind !== 'table') return null;
    object.cells = [];
    return null;
  }),
];
