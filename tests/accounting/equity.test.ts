/**
 * The equity curve, measured rather than quoted.
 *
 * Every figure this file asserts is a figure `spec/backtest.md` prints, and the
 * rule of this repository is that a figure a document prints is measured by a
 * test. So the cases here are the sentences of that page turned back into
 * arithmetic: the mark is the close, the charges land at the open, the gross
 * lands at the close, the peak starts at the capital, and a bar the host had no
 * price for carries the last price there was.
 *
 * Each test says the wrong implementation it exists to catch. That is not
 * decoration: a test whose wrong implementation nobody wrote down is a test
 * that passes against every implementation, and this file was written by
 * breaking each rule in turn and checking that the test beside it went red.
 *
 * The module is imported by its own file rather than through the accounting
 * door. The door names `equityOver` and nothing else of this module, which is
 * the whole point of a door; the boundary rule and the sweep beside it are
 * behind it, and they are what half of this file is about.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { barsInMarketOver, equityOver, openOnBar } from '../../src/core/accounting/equity.js';
import type { EquityPoint } from '../../src/core/accounting/equity.js';
import type { BarMark, Contract, Money } from '../../src/core/accounting/shapes.js';
import type { Trade } from '../../src/core/accounting/trades.js';
import { CONTRACT, corpus, marksOf, timeOf, tradeOf } from './metrics-support.js';

const CAPITAL = 1000;

test('a point for every report bar, and none for a warmup bar', () => {
  // Catches a fold that reports every mark it swept. Warmup bars execute and
  // their orders are real, so they have to be folded; reporting them would put
  // a point in the curve for a bar the report window does not contain, and
  // every count taken over the curve would be long by the warmup.
  const points = equityOver([], marksOf([100, 101, 102, 103, 104], 2), CONTRACT, CAPITAL);

  assert.deepEqual(
    points.map((point) => point.barIndex),
    [2, 3, 4],
  );
  assert.deepEqual(
    points.map((point) => point.time),
    [timeOf(2), timeOf(3), timeOf(4)],
  );
});

test('a trade pays its charges at the bar it opened and realises at the bar it closed', () => {
  // Catches both halves of the accrual being put on one bar. Charges landing at
  // the close report a run that carried a position for a hundred bars as having
  // paid nothing for it, and leave a trade that never closed paying nothing at
  // all; a gross landing at the open reports a profit on the bar the trade was
  // taken on, which is a look-ahead of exactly the trade's own length.
  const trades = [tradeOf({ openedOnBar: 1, closedOnBar: 3, grossProfit: 8, charges: 2 })];
  const points = equityOver(trades, marksOf([100, 100, 100, 100, 100]), CONTRACT, CAPITAL);

  assert.deepEqual(
    points.map((point) => point.charges),
    [0, 2, 2, 2, 2],
  );
  assert.deepEqual(
    points.map((point) => point.realised),
    [0, 0, 0, 8, 8],
  );
});

test('cash and equity are the two sums the type states', () => {
  // Catches a cash that leaves the charges out and an equity that leaves the
  // open profit out. Both are figures a reader adds up by hand against the
  // trade list, and both are wrong by an amount that looks plausible.
  const trades = [
    tradeOf({ index: 1, openedOnBar: 0, closedOnBar: 2, exitPrice: 104, units: 2, charges: 1.5 }),
    tradeOf({ index: 2, openedOnBar: 3, units: 4, entryPrice: 90, charges: 0.5 }),
  ];
  const points = equityOver(trades, marksOf([100, 101, 104, 92, 88]), CONTRACT, CAPITAL);

  assert.equal(points.length, 5);
  for (const point of points) {
    assert.equal(point.cash, CAPITAL + point.realised - point.charges);
    assert.equal(point.equity, point.cash + point.openProfit);
  }
  assert.deepEqual(
    points.map((point) => point.equity),
    [1000 - 1.5, 1002 - 1.5, 1008 - 1.5, 1008 - 2 + 8, 1008 - 2 - 8],
  );
});

test('open profit is marked to this bar close and carries the side of the trade', () => {
  // Catches three separate defects with one pair of runs: a fold that marks at
  // the entry (every open profit zero), a fold that marks at the last close of
  // the run (a look-ahead that makes every curve monotone towards the end), and
  // a fold that ignores the side, which reports a short in a falling market as
  // losing money.
  const closes = [100, 101, 99];
  const long = equityOver(
    [tradeOf({ side: 'long', units: 2, entryPrice: 100 })],
    marksOf(closes),
    CONTRACT,
    CAPITAL,
  );
  const short = equityOver(
    [tradeOf({ side: 'short', units: 2, entryPrice: 100 })],
    marksOf(closes),
    CONTRACT,
    CAPITAL,
  );

  assert.deepEqual(
    long.map((point) => point.openProfit),
    [0, 2, -2],
  );
  assert.deepEqual(
    short.map((point) => point.openProfit),
    [0, -2, 2],
  );
});

test('a bar with no close carries the mark rather than substituting a zero', () => {
  // Catches the `close ?? 0` that is the natural way to write this: a position
  // marked at zero reports the whole notional as a loss on that bar and a full
  // recovery on the next, which is a drawdown the run never had and which the
  // summary would then report as its worst figure.
  const points = equityOver(
    [tradeOf({ units: 1, entryPrice: 100 })],
    marksOf([100, null, 103]),
    CONTRACT,
    CAPITAL,
  );

  assert.deepEqual(
    points.map((point) => point.openProfit),
    [0, 0, 3],
  );
  assert.deepEqual(
    points.map((point) => point.exposure),
    [100, 100, 103],
  );
});

test('a trade opened during the warmup is already in the fold at the first point', () => {
  // Catches a fold that starts at the first report bar. The trade is open, its
  // charges are paid and its position is marked, and a curve that began later
  // would show none of the three while reporting an exposure of zero on a bar
  // the run was holding four units.
  const points = equityOver(
    [tradeOf({ openedOnBar: 0, units: 4, entryPrice: 100, charges: 3 })],
    marksOf([100, 101, 102], 2),
    CONTRACT,
    CAPITAL,
  );

  assert.equal(points.length, 1);
  assert.deepEqual(points[0]?.charges, 3);
  assert.deepEqual(points[0]?.exposure, 408);
  assert.deepEqual(points[0]?.openProfit, 8);
});

test('the running peak starts at the capital, so a run down from its first bar is in drawdown', () => {
  // Catches a peak seeded from the first point, which reports every run as
  // having begun at its high and therefore reports a drawdown of zero on the
  // first bar however much the entry cost. On a run that never recovers, that
  // is the whole of its worst figure understated.
  const points = equityOver(
    [tradeOf({ openedOnBar: 0, charges: 10 })],
    marksOf([100, 100]),
    CONTRACT,
    CAPITAL,
  );

  assert.deepEqual(
    points.map((point) => point.drawdown),
    [-10, -10],
  );
  assert.deepEqual(
    points.map((point) => point.drawdownPercent),
    [-0.01, -0.01],
  );
});

test('drawdown is the distance below the running peak and is never positive', () => {
  // Catches the sign written the other way round, `peak - equity`, which is the
  // spelling most reports use and which contradicts the type beside it, and a
  // peak that follows the equity down instead of holding its high, which
  // reports every drawdown as zero.
  const points = equityOver(
    [tradeOf({ units: 1, entryPrice: 100 })],
    marksOf([100, 110, 105, 108, 120]),
    CONTRACT,
    CAPITAL,
  );

  assert.deepEqual(
    points.map((point) => point.drawdown),
    [0, 0, -5, -2, 0],
  );
  for (const point of points) assert.ok(point.drawdown <= 0, 'a drawdown above the peak');
});

test('a peak that is not positive has no fraction to state', () => {
  // Catches the unguarded division. A run declaring no capital and holding
  // nothing gives a peak of zero, and `0 / 0` is a value JSON writes as null:
  // the report would come back from a round trip with a hole in it, and the
  // conformance comparison would fail on absence rather than on arithmetic.
  const points = equityOver([], marksOf([100, 101]), CONTRACT, 0);

  for (const point of points) {
    assert.equal(point.drawdownPercent, 0);
    assert.ok(Number.isFinite(point.drawdownPercent), 'a fraction that is not a number');
  }
});

test('no bars is no curve, and no trades is a flat line at the capital', () => {
  // Catches a fold that reaches for the first trade or the first bar without
  // asking whether there is one, and one that pushes a point per trade rather
  // than per bar. The empty run is the case a driver hits first, on the day
  // somebody backtests a script that never entered.
  assert.deepEqual(equityOver([], [], CONTRACT, CAPITAL), []);

  const flat = equityOver([], marksOf([100, 101, 102]), CONTRACT, CAPITAL);
  assert.deepEqual(
    flat.map((point) => point.equity),
    [CAPITAL, CAPITAL, CAPITAL],
  );
  assert.deepEqual(
    flat.map((point) => point.exposure),
    [0, 0, 0],
  );
  assert.deepEqual(
    flat.map((point) => point.drawdown),
    [0, 0, 0],
  );
});

test('a trade opened and closed inside one bar leaves its cost, its gross and no position', () => {
  // Catches a fold that takes closes off before it takes opens on. Written that
  // way the trade is never in the fold to be closed, so its gross is realised a
  // bar late or not at all, and it sits in the open set for the rest of the run
  // reporting an exposure the account never had.
  const points = equityOver(
    [tradeOf({ openedOnBar: 1, closedOnBar: 1, grossProfit: 5, charges: 1 })],
    marksOf([100, 100, 100]),
    CONTRACT,
    CAPITAL,
  );

  assert.deepEqual(
    points.map((point) => point.realised),
    [0, 5, 5],
  );
  assert.deepEqual(
    points.map((point) => point.charges),
    [0, 1, 1],
  );
  assert.deepEqual(
    points.map((point) => point.exposure),
    [0, 0, 0],
  );
  assert.deepEqual(
    points.map((point) => point.openProfit),
    [0, 0, 0],
  );
});

test('the point value scales the open profit and the exposure', () => {
  // Catches a fold that marks in price rather than in money, which is correct
  // for every instrument whose point value is one and wrong by two orders of
  // magnitude for the ones it is not. A contract fact the report ignores is the
  // kind of defect that only shows up on the instrument nobody tested with.
  const contract: Contract = { ...CONTRACT, pointValue: 50 };
  const points = equityOver(
    [tradeOf({ units: 2, entryPrice: 100, grossProfit: 0 })],
    marksOf([101]),
    contract,
    CAPITAL,
  );

  assert.equal(points[0]?.openProfit, 100);
  assert.equal(points[0]?.exposure, 10100);
});

test('the swept fold agrees with the plain reading of it over every arrangement', () => {
  // Catches the pointer sweep going wrong in the ways a pointer sweep goes
  // wrong: a comparison that is strict where it should not be, so a trade
  // opening on the bar another one opens on is missed; a trade left in the open
  // set after it closed; a trade never taken on because the one before it
  // opened later. The oracle recomputes each bar from the whole trade list,
  // which is the reading the specification is written in and the reading nobody
  // would ship.
  const marks = marksOf([100, 101, null, 103, 99, 100, 105, 98], 1);
  let checked = 0;
  for (const trades of corpus()) {
    assert.deepStrictEqual(
      equityOver(trades, marks, CONTRACT, CAPITAL),
      plainly(trades, marks, CONTRACT, CAPITAL),
      `the arrangement ${describe(trades)}`,
    );
    checked += 1;
  }
  assert.ok(checked > 400, `only ${checked} arrangements were compared`);
});

test('bars in market counts the bars the boundary rule counts', () => {
  // Catches the two sweeps disagreeing about a boundary. The count is taken
  // from sorted opens and closes and the curve is taken from a pointer over the
  // trades, so an off-by-one at either end gives a summary whose bars in market
  // cannot be reconciled with the exposure column beside it, which is a figure
  // a reader checks by counting.
  const marks = marksOf([100, 101, null, 103, 99, 100, 105, 98], 1);
  for (const trades of corpus()) {
    const points = equityOver(trades, marks, CONTRACT, CAPITAL);
    const held = points.filter((point) =>
      trades.some((trade) => openOnBar(trade, point.barIndex)),
    ).length;
    assert.equal(barsInMarketOver(trades, points), held, `the arrangement ${describe(trades)}`);
  }
});

test('a position is held at the close of the bar it opened on and not of the bar it closed on', () => {
  // Catches the boundary rule being written either way round. Held from the
  // close of the closing bar counts a flat bar as in the market and marks a
  // position that is gone; not held at the close of the opening bar loses the
  // first bar of every trade, which on a strategy that holds for two bars is a
  // third of its exposure.
  const trade = tradeOf({ openedOnBar: 2, closedOnBar: 4 });

  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((bar) => openOnBar(trade, bar)),
    [false, false, true, true, false, false],
  );
  assert.equal(openOnBar(tradeOf({ openedOnBar: 2, closedOnBar: 2 }), 2), false);
  assert.equal(openOnBar(tradeOf({ openedOnBar: 2 }), 9), true);
});

/** How a failing arrangement is named, so a corpus failure can be reproduced. */
function describe(trades: readonly Trade[]): string {
  return trades
    .map((trade) => `${trade.index}: ${trade.openedOnBar} to ${trade.closedOnBar ?? 'open'}`)
    .join(', ');
}

/**
 * The curve as the specification reads, recomputed from the whole trade list on
 * every bar.
 *
 * Deliberately the implementation nobody would ship: it is quadratic, it shares
 * no loop and no accumulator with the one under test, and it asks `openOnBar`
 * the question the fold answers by keeping a set. Two implementations that
 * agree over every arrangement of two trades over eight bars is the strongest
 * statement available here about a sweep.
 */
function plainly(
  trades: readonly Trade[],
  marks: readonly BarMark[],
  contract: Contract,
  capital: Money,
): readonly EquityPoint[] {
  const points: EquityPoint[] = [];
  let peak = capital;
  let trough = capital;
  let mark: number | null = null;

  for (const bar of marks) {
    if (bar.close !== null) mark = bar.close;
    if (!bar.inReport) continue;

    let realised = 0;
    let charges = 0;
    let openProfit = 0;
    let exposure = 0;
    for (const trade of trades) {
      if (trade.openedOnBar <= bar.barIndex) charges += trade.charges;
      if (trade.closedOnBar !== null && trade.closedOnBar <= bar.barIndex) {
        realised += trade.grossProfit;
      }
      if (!openOnBar(trade, bar.barIndex)) continue;
      const at = mark ?? trade.entryPrice;
      const direction = trade.side === 'long' ? 1 : -1;
      openProfit += direction * (at - trade.entryPrice) * trade.units * contract.pointValue;
      exposure += Math.abs(trade.units * at * contract.pointValue);
    }

    const cash = capital + realised - charges;
    const equity = cash + openProfit;
    if (equity > peak) peak = equity;
    if (equity < trough) trough = equity;
    points.push({
      barIndex: bar.barIndex,
      time: bar.time,
      realised,
      charges,
      openProfit,
      cash,
      equity,
      exposure,
      drawdown: equity - peak,
      drawdownPercent: peak > 0 ? (equity - peak) / peak : 0,
      runUp: equity - trough,
      runUpPercent: trough > 0 ? (equity - trough) / trough : 0,
    });
  }

  return points;
}
