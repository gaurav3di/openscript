/**
 * What a running program holds: the six values of `compiled-program.md` 3.1
 * and the heap the sixth one points into.
 *
 * Separate from the engine's own module because the library needs both and the
 * engine needs both, and a value model that lived inside either one would make
 * the other import it through a door it has no business going through.
 */
export type { ColourValue, Reference, Value } from './value.js';
export {
  ABSENT,
  colour,
  isAbsent,
  isBool,
  isColour,
  isNumber,
  isRef,
  isString,
  numberValue,
  reference,
  tagOf,
  valuesEqual,
} from './value.js';

export type {
  ArrayObject,
  DrawingObject,
  GridCell,
  HeapObject,
  ObjectKind,
  RootWalk,
  TableObject,
} from './heap.js';
export { Heap, isDrawing } from './heap.js';
