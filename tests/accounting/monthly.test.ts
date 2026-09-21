/**
 * The month by month table, and the two ways a month's return goes wrong.
 *
 * **A return is a gain over what it was earned on**, so the denominator is
 * where the month started and not where it ended up. The table divided by the
 * equity at the month's own first point, which is the equity *after* the move
 * into that month had already been counted into the numerator: a February that
 * took a thousand to two thousand reported fifty percent. The `netProfit`
 * column was right throughout, so the two columns of one row disagreed about
 * the same month and neither looked wrong on its own.
 *
 * **And a bar time is not always a bar time.** A finite number outside the
 * range a calendar date can hold decomposes to NaN rather than throwing, a NaN
 * year never equals the next one, so every point opened a month of its own and
 * the canonical writer then threw a bare error with no code on the NaNs, out of
 * core, on a path a host could not tell from an internal fault. The mistake
 * that gets there is the ordinary one: bar times in nanoseconds.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { monthlyOver } from '../../src/core/accounting/index.js';
import type { EquityPoint, Trade } from '../../src/core/accounting/index.js';

const JAN_31 = Date.UTC(2025, 0, 31);
const FEB_1 = Date.UTC(2025, 1, 1);
const FEB_2 = Date.UTC(2025, 1, 2);

function point(barIndex: number, time: number, equity: number): EquityPoint {
  return {
    barIndex,
    time,
    realised: 0,
    charges: 0,
    openProfit: 0,
    cash: equity,
    equity,
    exposure: 0,
    drawdown: 0,
    drawdownPercent: 0,
    runUp: 0,
    runUpPercent: 0,
  };
}

const NO_TRADES: readonly Trade[] = [];

test('a month earns its return on what it started with', () => {
  // A long opened on the January bar and closed at double on the first February
  // bar. February took the account from a thousand to two thousand, which is a
  // hundred percent; the table used to say fifty, because it divided the
  // thousand it made by the two thousand it had already made.
  const rows = monthlyOver(
    [point(0, JAN_31, 1000), point(1, FEB_1, 2000), point(2, FEB_2, 2000)],
    NO_TRADES,
  );
  const february = rows.find((row) => row.month === 2);
  assert.ok(february, 'February is in the table');
  assert.equal(february.netProfit, 1000, 'the money is what it always was');
  assert.equal(february.returnPercent, 1, 'and the return is now over what it started from');
});

test('the first month earns its return on where the curve begins', () => {
  // There is no previous month to have left the account anywhere, so the first
  // point is the only basis there is.
  const rows = monthlyOver([point(0, JAN_31, 1000), point(1, Date.UTC(2025, 0, 15) + 0, 1100)], NO_TRADES);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.returnPercent, 0.1);
});

test('a month that lost reports a negative return, over the same basis', () => {
  const rows = monthlyOver(
    [point(0, JAN_31, 1000), point(1, FEB_1, 800), point(2, FEB_2, 800)],
    NO_TRADES,
  );
  const february = rows.find((row) => row.month === 2);
  assert.equal(february?.netProfit, -200);
  assert.equal(february?.returnPercent, -0.2);
});

test('a bar time no calendar can hold names no month at all', () => {
  // Nanoseconds where milliseconds were meant. It used to produce one row per
  // bar, every field NaN, and then throw a bare error out of core when the
  // record was written.
  const rows = monthlyOver(
    [point(0, 1_748_736_000_000_000_000, 1000), point(1, 1_748_736_003_600_000_000, 1100)],
    NO_TRADES,
  );
  assert.deepEqual(rows, [], 'no month, rather than a month called NaN');
});

test('an impossible time among real ones leaves the real months alone', () => {
  // The direction that matters: a guard that threw the whole table away on one
  // bad time would lose a report over a single malformed bar.
  const rows = monthlyOver(
    [point(0, JAN_31, 1000), point(1, 1e18, 1000), point(2, FEB_1, 1200)],
    NO_TRADES,
  );
  assert.ok(
    rows.some((row) => row.month === 1) && rows.some((row) => row.month === 2),
    'January and February are both still reported',
  );
});
