/**
 * The calendar, against the two things that can be wrong about one.
 *
 * **The day counting**, which is pure arithmetic and is asserted against its own
 * inverse and against dates whose answers are not in dispute. A day number that
 * is one out shows up as a weekday that is one out, and a study that trades on
 * Thursdays would trade on Wednesdays without anything looking wrong.
 *
 * **The zone**, which is the half nobody can reason about by reading it. Every
 * case below is either side of a seasonal clock change, because that is where a
 * fixed offset, a subtraction of milliseconds and a one pass inversion each stop
 * agreeing with the calendar, and none of the three fails anywhere else. The
 * zone chosen is one whose changes are an hour and are well known; the test
 * asserts the relationship between the readings rather than a table of offsets,
 * so it says the same thing under any runtime whose database holds that zone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dateOfDay,
  dayNumber,
  dayOfYearOf,
  fieldsIn,
  instantOf,
  isKnownZone,
  offsetAt,
  renderPattern,
  weekOfYearOf,
  weekdayOfDay,
} from '../../src/core/stdlib/index.js';

/** A zone that moves its clocks twice a year, for the cases that need one. */
const SEASONAL = 'Europe/London';

/** Its two changes in 2024, as instants, both at 01:00 UTC. */
const FORWARD = Date.UTC(2024, 2, 31, 1, 0, 0);
const BACK = Date.UTC(2024, 9, 27, 1, 0, 0);

const HOUR = 3_600_000;

test('a day number and a civil date are exact inverses of each other', () => {
  for (const [year, month, day] of [
    [1970, 1, 1],
    [1969, 12, 31],
    [2000, 2, 29],
    [1900, 3, 1],
    [2024, 12, 31],
    [1, 1, 1],
  ] as const) {
    const days = dayNumber(year, month, day);
    assert.deepEqual(dateOfDay(days), { year, month, day }, `${year}-${month}-${day}`);
  }
});

test('the epoch was a Thursday and the week numbers Monday as 1', () => {
  assert.equal(weekdayOfDay(dayNumber(1970, 1, 1)), 4);
  // A whole week, so a run of seven covers every day exactly once and the wrap
  // from Sunday back to Monday is asserted rather than assumed.
  const week = [0, 1, 2, 3, 4, 5, 6].map((step) => weekdayOfDay(dayNumber(2024, 1, 1) + step));
  assert.deepEqual(week, [1, 2, 3, 4, 5, 6, 7]);
});

test('the day of the year counts the leap day and the week is the ISO one', () => {
  assert.equal(dayOfYearOf(2024, 1, 1), 1);
  assert.equal(dayOfYearOf(2024, 12, 31), 366);
  assert.equal(dayOfYearOf(2023, 12, 31), 365);
  // The turn of a year, where the two readings of "week number" disagree by a
  // whole week: 1 January 2021 was a Friday, so it belongs to the last week of
  // 2020 and not to week 1 of 2021.
  assert.equal(weekOfYearOf(2021, 1, 1), 53);
  assert.equal(weekOfYearOf(2021, 1, 4), 1);
  // 1 January 2025 was a Wednesday, which does fall in its own year's week 1.
  assert.equal(weekOfYearOf(2025, 1, 1), 1);
});

test('a name the zone database does not hold is not a zone', () => {
  assert.equal(isKnownZone('UTC'), true);
  assert.equal(isKnownZone(SEASONAL), true);
  // An abbreviation is not a zone name, which is the whole of OS6005's cause.
  assert.equal(isKnownZone('IST'), false);
  assert.equal(isKnownZone('Nowhere/Nothing'), false);
});

test('a seasonal clock change moves the offset by an hour in each direction', () => {
  const beforeForward = offsetAt(FORWARD - HOUR, SEASONAL);
  const afterForward = offsetAt(FORWARD + HOUR, SEASONAL);
  assert.equal(afterForward, (beforeForward as number) + HOUR, 'the spring change');

  const beforeBack = offsetAt(BACK - HOUR, SEASONAL);
  const afterBack = offsetAt(BACK + HOUR, SEASONAL);
  assert.equal(afterBack, (beforeBack as number) - HOUR, 'the autumn change');
});

test('reading an instant in a zone and building it back gives the same instant', () => {
  for (const instant of [FORWARD - 86_400_000, FORWARD + 86_400_000, BACK - 86_400_000]) {
    const fields = fieldsIn(instant, SEASONAL);
    assert.ok(fields !== null);
    assert.equal(instantOf(fields, SEASONAL), instant, `round trip at ${instant}`);
  }
});

test('the hour a spring change removes resolves to where it would have been', () => {
  // The local reading inside the gap. Building it and reading it back gives a
  // reading an hour later, because the clock never showed the one asked for.
  const skipped = { year: 2024, month: 3, day: 31, hour: 1, minute: 30, second: 0 };
  const at = instantOf(skipped, SEASONAL);
  assert.ok(at !== null);
  const back = fieldsIn(at, SEASONAL);
  assert.ok(back !== null);
  assert.equal(back.hour, 2);
  assert.equal(back.minute, 30);
});

test('the hour an autumn change repeats resolves to the first of the two', () => {
  const repeated = { year: 2024, month: 10, day: 27, hour: 1, minute: 30, second: 0 };
  const at = instantOf(repeated, SEASONAL);
  assert.ok(at !== null);
  // Both readings of 01:30 are honest; the earlier is the one before the clocks
  // went back, which is half an hour before the change itself.
  assert.equal(at, BACK - 1_800_000);
  const back = fieldsIn(at, SEASONAL);
  assert.equal(back?.hour, 1);
  assert.equal(back?.minute, 30);
});

test('a pattern substitutes only the eight placeholders and copies the rest', () => {
  const fields = { year: 2024, month: 3, day: 9, hour: 7, minute: 5, second: 4 };
  assert.equal(renderPattern('yyyy-MM-dd HH:mm:ss', fields), '2024-03-09 07:05:04');
  assert.equal(renderPattern('EEE dd MMM yyyy', fields), 'Sat 09 Mar 2024');
  // A letter that starts a placeholder but does not complete one is text, and
  // the `MM` inside `MMM` is never read a second time.
  assert.equal(renderPattern('M MMM y at HH', fields), 'M Mar y at 07');
  assert.equal(renderPattern(null, fields), null);
});
