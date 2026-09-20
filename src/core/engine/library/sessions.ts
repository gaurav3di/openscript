/**
 * `session.isIn(spec, zone)`: the session range spec of `stdlib.md` 12.5.
 *
 * The spec is a string a script writes: `"0915-1530"`, with an optional day
 * list after a colon, `"0915-1530:12345"`. Days number Monday as 1 through
 * Sunday as 7, matching `date.dayOfWeek`.
 *
 * **A range whose end is before its start crosses midnight and is read that
 * way**, which is what an overnight session needs. The day list then names the
 * day the range opened on rather than the day the bar falls on, because a
 * session that opens on Friday evening and closes on Saturday morning is a
 * Friday session: reading the list against the bar's own day would drop half of
 * every overnight session and keep the wrong half.
 *
 * A malformed spec is OS3008 at compile time when it is a literal. A computed
 * one that is malformed is absence here rather than a refusal: the alternative
 * would stop a chart on a string the script built on one bar out of forty
 * thousand, and absence is a value a script can test.
 */
import type { Civil } from '../../stdlib/index.js';
import { dayNumber, weekdayOfDay } from '../../stdlib/index.js';

/** `HHMM-HHMM` with an optional `:` and a run of day digits. */
const SPEC = /^(\d{2})(\d{2})-(\d{2})(\d{2})(?::([1-7]{1,7}))?$/;

/** The hours a spec names, as minutes from midnight, and the days it applies to. */
interface Hours {
  readonly from: number;
  /** Minutes from midnight at the close, which may be at 24:00. */
  readonly to: number;
  readonly days: readonly number[] | null;
}

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

/**
 * Whether a bar's wall clock reading falls inside the hours a spec names.
 *
 * The open is inclusive and the close is exclusive, so two ranges written back
 * to back cover every minute once and no minute twice. A spec whose start and
 * end are the same minute holds nothing, which is what writing a zero length
 * range says.
 */
export function sessionHolds(spec: string | null, at: Civil | null): boolean | null {
  if (spec === null || at === null) return null;
  const hours = parse(spec);
  if (hours === null) return null;
  const minutes = at.hour * 60 + at.minute;
  const today = weekdayOfDay(dayNumber(at.year, at.month, at.day));

  if (hours.to > hours.from) {
    return minutes >= hours.from && minutes < hours.to && onADay(hours, today);
  }
  if (hours.to === hours.from) return false;

  // Crossing midnight: the evening part belongs to today's session and the
  // morning part to yesterday's, which is the day the list is read against.
  if (minutes >= hours.from) return onADay(hours, today);
  if (minutes < hours.to) return onADay(hours, today === 1 ? 7 : today - 1);
  return false;
}

function onADay(hours: Hours, weekday: number): boolean {
  return hours.days === null || hours.days.includes(weekday);
}
