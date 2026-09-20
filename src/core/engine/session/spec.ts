/**
 * `session.isIn(spec, zone)`: the session range spec of `stdlib.md` 12.5.
 *
 * The spec is a string a script writes: `"0915-1530"`, with an optional day
 * list after a colon, `"0915-1530:12345"`. Days number Monday as 1 through
 * Sunday as 7, matching `date.dayOfWeek`. This file is the spelling and nothing
 * else: what the hours then mean is `hours.ts`, which the instrument's own
 * session reads through as well, so a script's range and an instrument's
 * session cannot come to differ about midnight or about a day list.
 *
 * A malformed spec is OS3008 at compile time when it is a literal. A computed
 * one that is malformed is absence here rather than a refusal: the alternative
 * would stop a chart on a string the script built on one bar out of forty
 * thousand, and absence is a value a script can test.
 */
import type { Civil } from '../../stdlib/index.js';
import { standingIn } from './hours.js';
import type { Hours } from './hours.js';

/** `HHMM-HHMM` with an optional `:` and a run of day digits. */
const SPEC = /^(\d{2})(\d{2})-(\d{2})(\d{2})(?::([1-7]{1,7}))?$/;

function parse(spec: string): Hours | null {
  const parts = SPEC.exec(spec);
  if (parts === null) return null;
  const fromHour = Number(parts[1]);
  const fromMinute = Number(parts[2]);
  const toHour = Number(parts[3]);
  const toMinute = Number(parts[4]);
  // "2400" is midnight at the end of the day, and it is the one hour past 23
  // the spec allows.
  if (fromHour > 23 || fromMinute > 59 || toMinute > 59) return null;
  if (toHour > 24 || (toHour === 24 && toMinute !== 0)) return null;
  const listed = parts[5];
  const days = listed === undefined ? null : [...listed].map((one) => Number(one));
  return { from: fromHour * 60 + fromMinute, to: toHour * 60 + toMinute, days };
}

/** Whether a bar's wall clock reading falls inside the hours a spec names. */
export function sessionHolds(spec: string | null, at: Civil | null): boolean | null {
  if (spec === null || at === null) return null;
  const hours = parse(spec);
  if (hours === null) return null;
  return standingIn(hours, at).inside;
}
