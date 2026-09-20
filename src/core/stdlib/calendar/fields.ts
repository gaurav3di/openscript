/**
 * The calendar reads of `stdlib.md` section 12.2, each one an instant and a
 * zone in and a number out.
 *
 * Every one of them is absent rather than a guess when the zone is not one the
 * runtime holds or the instant is not a number. An unknown zone is OS6005, and
 * raising it is the engine's to do at the call site, where there is a span to
 * point at; this tier raises nothing, for the reason the library's own index
 * gives.
 */
import type { Value } from '../values/index.js';
import { NONE, result } from '../values/index.js';

import type { Civil } from './civil.js';
import { dateOfDay, dayNumber, dayOfYearOf, weekOfYearOf, weekdayOfDay } from './civil.js';
import { fieldsIn, instantOf } from './zone.js';

/** Which field of a civil date a read wants. */
export type DateField =
  | 'year'
  | 'month'
  | 'day'
  | 'dayOfWeek'
  | 'dayOfYear'
  | 'hour'
  | 'minute'
  | 'second'
  | 'weekOfYear';

/** One calendar field of an instant, read in a zone. */
export function dateField(instant: Value, zone: string | null, field: DateField): Value {
  const fields = civilAt(instant, zone);
  if (fields === null) return NONE;
  switch (field) {
    case 'year':
      return result(fields.year);
    case 'month':
      return result(fields.month);
    case 'day':
      return result(fields.day);
    case 'hour':
      return result(fields.hour);
    case 'minute':
      return result(fields.minute);
    case 'second':
      return result(fields.second);
    case 'dayOfWeek':
      return result(weekdayOfDay(dayNumber(fields.year, fields.month, fields.day)));
    case 'dayOfYear':
      return result(dayOfYearOf(fields.year, fields.month, fields.day));
    default:
      return result(weekOfYearOf(fields.year, fields.month, fields.day));
  }
}

/** Which boundary `startOfDay`, `startOfWeek` and `startOfMonth` round back to. */
export type Boundary = 'day' | 'week' | 'month';

/**
 * Midnight at the start of the day, the Monday or the first of the month that
 * holds an instant, in a zone.
 *
 * The answer is built as a wall clock reading and then turned back into an
 * instant, rather than by subtracting a count of milliseconds. Subtracting is
 * wrong across a clock change, where a local day is twenty three or twenty five
 * hours long, and it is wrong in a way that shows up twice a year on one chart
 * and never on another.
 */
export function startOf(instant: Value, zone: string | null, boundary: Boundary): Value {
  const fields = civilAt(instant, zone);
  if (fields === null || zone === null) return NONE;
  const midnight = { hour: 0, minute: 0, second: 0 };
  let civil: Civil;
  if (boundary === 'month') {
    civil = { year: fields.year, month: fields.month, day: 1, ...midnight };
  } else if (boundary === 'day') {
    civil = { year: fields.year, month: fields.month, day: fields.day, ...midnight };
  } else {
    const days = dayNumber(fields.year, fields.month, fields.day);
    const monday = days - (weekdayOfDay(days) - 1);
    civil = { ...dateOfDay(monday), ...midnight };
  }
  const at = instantOf(civil, zone);
  return at === null ? NONE : result(at);
}

/** Whether two instants fall on one calendar day in a zone. */
export function sameDay(a: Value, b: Value, zone: string | null): boolean | null {
  const left = civilAt(a, zone);
  const right = civilAt(b, zone);
  if (left === null || right === null) return null;
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/** An instant built from calendar fields in a zone, `date.from`. */
export function instantFrom(
  year: Value,
  month: Value,
  day: Value,
  hour: Value,
  minute: Value,
  second: Value,
  zone: string | null,
): Value {
  if (zone === null) return NONE;
  if (year === null || month === null || day === null) return NONE;
  const fields: Civil = {
    year,
    month,
    day,
    hour: hour ?? 0,
    minute: minute ?? 0,
    second: second ?? 0,
  };
  if (!Object.values(fields).every((one) => Number.isInteger(one))) return NONE;
  const at = instantOf(fields, zone);
  return at === null ? NONE : result(at);
}

/** The civil fields of an instant, or nothing when either side is unusable. */
export function civilAt(instant: Value, zone: string | null): Civil | null {
  if (instant === null || zone === null) return null;
  return fieldsIn(instant, zone);
}
