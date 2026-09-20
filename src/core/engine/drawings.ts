/**
 * The drawing objects a host reads, as facts rather than as heap contents.
 *
 * The heap is the engine's own representation: a polyline's path is a
 * reference into it, a handle is an integer, and neither means anything to
 * whoever is drawing. This is the door between the two. A host is handed one
 * record per live object, in creation order, with every value resolved, and it
 * never dereferences anything.
 *
 * **An anchor is a time and a price.** That is the whole of where an object
 * sits, and it is why an object survives what happens to the view: a zoom
 * changes pixels and nothing here, loading more history renumbers every bar and
 * nothing here, and an anchor past the newest bar is carried through as it was
 * written so a projection reaches into the margin instead of being clamped to
 * the last bar. Turning either number into a coordinate is the host's job and
 * needs the host's scales, which is exactly why the engine does not attempt it.
 *
 * **Absence is a gap.** An anchor with no time or no price, and a style value a
 * script left absent, are handed over absent. `language.md` 6.7 fixes what that
 * means on a drawing surface: nothing is drawn there, and nothing is invented
 * to fill it.
 *
 * **A host reads this after every execution, re-executions of a moving bar
 * included.** The set is rebuilt from what the bar left behind, which the
 * rollback has already restored, so a host that draws whatever it is given here
 * needs no rule of its own for a chart that ticks.
 */
import type { DrawingObject, Heap, Value } from './values/index.js';
import { isNumber } from './values/index.js';

export type DrawingKind = DrawingObject['kind'];

/** Where one point of an object sits, in the two units a chart never loses. */
export interface Anchor {
  readonly time: number | null;
  readonly price: number | null;
}

/** One live object, as the surface holding it needs to see it. */
export interface Drawing {
  /** Stable while the object lives, so a host can hold its own view of it. */
  readonly id: number;
  readonly kind: DrawingKind;
  /**
   * The object's points, in order.
   *
   * A line and a box have two, a label has one, and a polyline has as many as
   * its path. A host that knows the kind knows what the points mean, and one
   * that does not can still draw the extent of it.
   */
  readonly anchors: readonly Anchor[];
  /**
   * Everything that is not a point: colours, text, width, line style, the
   * extend flags, the fill opacity and the tooltip, under the names
   * `stdlib.md` 14.4 gives them.
   */
  readonly style: Readonly<Record<string, Value>>;
}

/** The property pairs each kind anchors itself with, in order. */
const ANCHORS: Readonly<Record<DrawingKind, readonly (readonly [string, string])[]>> = {
  line: [
    ['t1', 'p1'],
    ['t2', 'p2'],
  ],
  box: [
    ['t1', 'p1'],
    ['t2', 'p2'],
  ],
  label: [['t', 'p']],
  polyline: [],
};

function numberOf(value: Value | undefined): number | null {
  return value !== undefined && isNumber(value) ? value : null;
}

/** A polyline's path, from the two arrays the object copied at the call. */
function pathOf(heap: Heap, object: DrawingObject): readonly Anchor[] {
  const times = heap.deref(object.props['times'] ?? null);
  const prices = heap.deref(object.props['prices'] ?? null);
  const timeItems = times !== undefined && times.kind === 'array' ? times.items : [];
  const priceItems = prices !== undefined && prices.kind === 'array' ? prices.items : [];
  const out: Anchor[] = [];
  for (let i = 0; i < Math.max(timeItems.length, priceItems.length); i += 1) {
    out.push({ time: numberOf(timeItems[i]), price: numberOf(priceItems[i]) });
  }
  return out;
}

function anchorsOf(heap: Heap, object: DrawingObject): readonly Anchor[] {
  if (object.kind === 'polyline') return pathOf(heap, object);
  return ANCHORS[object.kind].map(([time, price]) => ({
    time: numberOf(object.props[time]),
    price: numberOf(object.props[price]),
  }));
}

function styleOf(object: DrawingObject): Readonly<Record<string, Value>> {
  const anchored = new Set<string>(['times', 'prices']);
  for (const [time, price] of ANCHORS[object.kind]) {
    anchored.add(time);
    anchored.add(price);
  }
  const out: Record<string, Value> = {};
  for (const key of Object.keys(object.props)) {
    if (!anchored.has(key)) out[key] = object.props[key] ?? null;
  }
  return out;
}

/**
 * Every object the script holds, oldest first.
 *
 * Creation order rather than any other, because it is the order the script
 * wrote and therefore the order a reader expects one drawing to sit over
 * another. Deleted objects are not here at all: an object lives until the
 * script deletes it, and then it is gone rather than hidden.
 */
export function drawingsIn(heap: Heap): readonly Drawing[] {
  return heap.drawings().map(({ id, object }) => ({
    id,
    kind: object.kind,
    anchors: anchorsOf(heap, object),
    style: styleOf(object),
  }));
}
