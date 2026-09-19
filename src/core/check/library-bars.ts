/**
 * The part of the library that reads a bar, an instrument, a clock or a string:
 * `stdlib.md` sections 3, 8.2, 10 and 12, plus the nineteen colour names of
 * section 11.1.
 *
 * Nothing here computes across bars, so nothing here has a warmup of its own.
 * The two exceptions state theirs: a session's start and end are known from the
 * session's first bar, which is a fact about the data rather than a length.
 */
import { DATA_DRIVEN, entry } from './library.js';
import type { LibraryEntry } from './library.js';

/** The colour names of stdlib.md 11.1, each an ordinary global of type `color`. */
export const COLOUR_NAMES: readonly string[] = [
  'aqua',
  'black',
  'blue',
  'brown',
  'fuchsia',
  'gray',
  'green',
  'lime',
  'maroon',
  'navy',
  'olive',
  'orange',
  'pink',
  'purple',
  'red',
  'silver',
  'teal',
  'white',
  'yellow',
];

/** The built-in series of stdlib.md 3.1, the only names with a bar's history. */
export const BAR_SERIES: readonly string[] = [
  'open',
  'high',
  'low',
  'close',
  'volume',
  'hl2',
  'hlc3',
  'ohlc4',
  'hlcc4',
  'oi',
  'time',
];

const colours: readonly LibraryEntry[] = COLOUR_NAMES.map((name) => entry(`${name} -> color`));

const series: readonly LibraryEntry[] = [
  ...BAR_SERIES.map((name) => entry(`${name} -> series number`)),
  entry('timeClose -> series number', { planned: true }),
];

const bar: readonly LibraryEntry[] = [
  entry('bar.index -> series number'),
  entry('bar.count -> series number'),
  entry('bar.isFirst -> series bool'),
  entry('bar.isLast -> series bool'),
  entry('bar.isConfirmed -> series bool'),
  entry('bar.isRealtime -> series bool'),
  entry('bar.isNew -> series bool'),
  entry('bar.updates -> series number'),
];

const chart: readonly LibraryEntry[] = [
  entry('chart.symbol -> string'),
  entry('chart.exchange -> string'),
  entry('chart.interval -> string'),
  entry('chart.intervalMinutes -> number'),
  entry('chart.isIntraday -> bool'),
  entry('chart.timezone -> string'),
  entry('chart.tickSize -> number'),
  entry('chart.lotSize -> number'),
  entry('chart.pointValue -> number'),
  entry('chart.currency -> string'),
  entry('chart.instrumentType -> string'),
  entry('chart.hasVolume -> bool'),
  entry('chart.hasOpenInterest -> bool'),
  entry('chart.now() -> number'),
  entry('chart.isReplay -> bool', { planned: true }),
  entry('chart.expiry -> number', { planned: true }),
  entry('chart.strike -> number', { planned: true }),
  entry('chart.optionType -> string', { planned: true }),
];

const session: readonly LibraryEntry[] = [
  entry('session.isOpen -> series bool'),
  entry('session.isFirstBar -> series bool'),
  entry('session.isLastBar -> series bool'),
  entry('session.startTime -> series number', { warmup: DATA_DRIVEN }),
  entry('session.endTime -> series number', { warmup: DATA_DRIVEN }),
  entry('session.barIndex -> series number'),
  entry('session.isIn(spec: string, zone?: string) -> series bool'),
  entry('session.isHoliday(t: number) -> bool', { planned: true }),
  entry('session.nextOpen -> series number', { planned: true }),
];

const date: readonly LibraryEntry[] = [
  entry('date.year(t: number, zone?: string) -> number'),
  entry('date.month(t: number, zone?: string) -> number'),
  entry('date.day(t: number, zone?: string) -> number'),
  entry('date.dayOfWeek(t: number, zone?: string) -> number'),
  entry('date.dayOfYear(t: number, zone?: string) -> number'),
  entry('date.hour(t: number, zone?: string) -> number'),
  entry('date.minute(t: number, zone?: string) -> number'),
  entry('date.second(t: number, zone?: string) -> number'),
  entry('date.weekOfYear(t: number, zone?: string) -> number'),
  entry(
    'date.from(year: number, month: number, day: number, hour?: number, minute?: number, second?: number, zone?: string) -> number',
  ),
  entry('date.startOfDay(t: number, zone?: string) -> number'),
  entry('date.startOfWeek(t: number, zone?: string) -> number'),
  entry('date.startOfMonth(t: number, zone?: string) -> number'),
  entry('date.isSameDay(a: number, b: number, zone?: string) -> bool'),
  entry('date.format(t: number, pattern: string, zone?: string) -> string'),
  entry('date.add(t: number, unit: string, count: number, zone?: string) -> number', {
    planned: true,
  }),
];

const maths: readonly LibraryEntry[] = [
  entry('math.pi -> number'),
  entry('math.e -> number'),
  entry('math.log2(x: number) -> number'),
  entry('math.hypot(x: number, y: number) -> number'),
  entry('math.toDegrees(x: number) -> number'),
  entry('math.toRadians(x: number) -> number'),
  entry('math.sin(x: number) -> number'),
  entry('math.cos(x: number) -> number'),
  entry('math.tan(x: number) -> number'),
  entry('math.asin(x: number) -> number'),
  entry('math.acos(x: number) -> number'),
  entry('math.atan(x: number) -> number'),
  entry('math.atan2(y: number, x: number) -> number'),
  entry('math.sinh(x: number) -> number', { planned: true }),
  entry('math.cosh(x: number) -> number', { planned: true }),
  entry('math.tanh(x: number) -> number', { planned: true }),
];

const strings: readonly LibraryEntry[] = [
  entry('str.length(s: string) -> number'),
  entry('str.upper(s: string) -> string'),
  entry('str.lower(s: string) -> string'),
  entry('str.trim(s: string) -> string'),
  entry('str.contains(s: string, part: string) -> bool'),
  entry('str.startsWith(s: string, part: string) -> bool'),
  entry('str.endsWith(s: string, part: string) -> bool'),
  entry('str.indexOf(s: string, part: string) -> number'),
  entry('str.substring(s: string, from: number, to?: number) -> string'),
  entry('str.replace(s: string, find: string, with: string) -> string'),
  entry('str.replaceAll(s: string, find: string, with: string) -> string'),
  entry('str.split(s: string, separator: string) -> array<string>'),
  entry('str.join(parts: array<string>, separator: string) -> string'),
  entry('str.padLeft(s: string, width: number, fill?: string) -> string'),
  entry('str.padRight(s: string, width: number, fill?: string) -> string'),
  entry('str.repeat(s: string, n: number) -> string'),
  entry('str.format(template: string, values: array<string>) -> string', { planned: true }),
  entry('str.match(s: string, pattern: string) -> bool', { planned: true }),
];

export const BAR_ENTRIES: readonly LibraryEntry[] = [
  ...colours,
  ...series,
  ...bar,
  ...chart,
  ...session,
  ...date,
  ...maths,
  ...strings,
];
