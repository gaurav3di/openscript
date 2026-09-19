export type { Flag, Flags, Series, Value } from './value.js';
export { NONE, absentSeries, at, isLength, isPresent, result } from './value.js';

export type { Tail } from './tail.js';
export { fold, mapTail } from './tail.js';

export type { Window } from './window.js';
export { makeWindow } from './window.js';

export type { Bar } from './bar.js';
export { derived, field, hl2, hlc3, hlcc4, ohlc4 } from './bar.js';
