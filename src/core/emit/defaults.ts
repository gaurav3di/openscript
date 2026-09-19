/**
 * The effective value of every declaration option a script left out.
 *
 * `compiled-program.md` 2.3 is unusually firm about this: every field of
 * `meta`, of `meta.strategy` and of every declaration in `outputs` is written
 * with the value that option resolved to, defaults included, rather than
 * omitted or written as null. So an engine never needs a table of defaults, and
 * a default that changes in a later language version cannot silently change an
 * old program, because the old program carries the old value in writing.
 *
 * That is also why this file exists and why it is only this. These are the
 * defaults of `language.md` 13.2 and 13.3 and of `stdlib.md` 14.2, 14.3, 16 and
 * 10.7, transcribed once. Nothing here is a runtime argument default: those
 * belong to the library manifest, and `calls.ts` says what happens where the
 * two are confused.
 */
import type { Value } from './values.js';
import { namedColour } from './colours.js';

const ABSENT: Value = { kind: 'absent' };

function number(value: number): Value {
  return { kind: 'number', value };
}

function string(value: string): Value {
  return { kind: 'string', value };
}

function bool(value: boolean): Value {
  return { kind: 'bool', value };
}

function colour(name: string): Value {
  const value = namedColour(name);
  return value === undefined ? ABSENT : { kind: 'colour', value };
}

/** `language.md` 13.2. `title` is required and `short` falls back to it. */
export const STUDY_DEFAULTS: Readonly<Record<string, Value>> = {
  overlay: bool(false),
  precision: number(4),
  format: string('price'),
  range: ABSENT,
  scale: string('right'),
  group: string(''),
  onUnconfirmed: bool(false),
};

/** `language.md` 13.3, the options only a `strategy()` adds. */
export const STRATEGY_DEFAULTS: Readonly<Record<string, Value>> = {
  capital: number(100000),
  currency: string(''),
  qty: number(1),
  qtyType: string('units'),
  product: string('intraday'),
  fillOn: string('nextOpen'),
  slippage: number(0),
  commission: number(0),
  commissionType: string('perTrade'),
  pyramiding: number(1),
  closeOnSessionEnd: bool(false),
};

/** The order `meta.strategy` lists them in, 2.3. */
export const STRATEGY_OPTIONS: readonly string[] = [
  'capital',
  'currency',
  'qty',
  'qtyType',
  'product',
  'fillOn',
  'slippage',
  'commission',
  'commissionType',
  'pyramiding',
  'closeOnSessionEnd',
];

/**
 * `stdlib.md` 14.2.
 *
 * `lineStyle` has no argument on `plot` at all: the call's `style` names the
 * column's shape and becomes the entry's `type`. A plot therefore always
 * carries the one line style a host draws an undecorated line with.
 */
export const PLOT_DEFAULTS: Readonly<Record<string, Value>> = {
  color: ABSENT,
  width: number(1.5),
  style: string('line'),
  offset: number(0),
  overlay: ABSENT,
  precision: ABSENT,
  format: ABSENT,
  scale: string('right'),
};

export const PLOT_LINE_STYLE: Value = string('solid');

/** `stdlib.md` 14.2. A candle's border takes a plot's own width and style. */
export const CANDLE_DEFAULTS: Readonly<Record<string, Value>> = {
  colorUp: colour('lime'),
  colorDown: colour('red'),
  wickColor: ABSENT,
  borderColor: ABSENT,
};

export const FILL_DEFAULTS: Readonly<Record<string, Value>> = {
  color: ABSENT,
  colorUp: ABSENT,
  colorDown: ABSENT,
  opacity: number(1),
  overlay: ABSENT,
};

export const LEVEL_DEFAULTS: Readonly<Record<string, Value>> = {
  title: string(''),
  color: colour('gray'),
  style: string('dashed'),
  width: number(1),
};

/** `stdlib.md` 14.3. `title`, `rows` and `cols` have no default. */
export const TABLE_DEFAULTS: Readonly<Record<string, Value>> = {
  position: string('topRight'),
  textColor: ABSENT,
  bgColor: ABSENT,
  borderWidth: number(0),
};

export const MARKER_DEFAULTS: Readonly<Record<string, Value>> = {
  color: ABSENT,
  at: string('above'),
  shape: string('label'),
};

export const ALERT_DEFAULTS: Readonly<Record<string, Value>> = {
  id: string(''),
  title: string(''),
  frequency: string('oncePerBar'),
};

/** `stdlib.md` 13.2, the arguments every input kind accepts. */
export const INPUT_DEFAULTS: Readonly<Record<string, Value>> = {
  group: string(''),
  tooltip: string(''),
};

/** `language.md` 10.7 and 7.4, carried by `limits` whether or not it was written. */
export const LOOP_BUDGET = 2_000_000;
