/**
 * What one fill was charged, and what the declaration's own commission is.
 *
 * **Every figure here is asserted against a number worked out by hand**, not
 * against the module's own arithmetic spelled a second way. A test that
 * recomputes what it is testing passes for any implementation that is
 * self-consistent, including one that is wrong in the same way twice, and this
 * is the module where being wrong twice is undetectable: a charge is a small
 * number beside a large one, and a report is still plausible when it is out by a
 * factor of the point value.
 *
 * The arrangements a schedule is refused for are next door, in
 * `schedules.test.ts`. They are the other half of one model and they are split
 * because one file would be past the length this repository allows, not because
 * they are two subjects.
 *
 * Everything is imported from `src/core/index.js`, the door a host reaches for,
 * so a call the accounting door or the core door does not name fails this file
 * at compile time rather than in somebody else's integration.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { chargeFor, scheduleFromDeclaration } from '../../src/core/index.js';
import type { Money } from '../../src/core/index.js';
import { CONTRACT, FILL, amountOf, contractOf, fillOf, lineOf, scheduleOf } from './charges-support.js';

/**
 * The four bases are measured against four different things.
 *
 * Turnover is units times price times the point value, a per unit line is the
 * rate times the units, a per fill line is the rate itself however many units
 * moved, and a line levied on charges is a fraction of the lines it names and of
 * no others.
 *
 * Catches an implementation that leaves the point value out of turnover, which
 * charges a fiftieth of what it should on this contract and is invisible on a
 * contract whose point value is 1. Catches one that charges a per unit line once
 * per fill, or a per fill line once per unit, which are the same number whenever
 * a test happens to use a single unit. And catches one that levies the charge on
 * a charge over every earlier line rather than over the names the line carries,
 * which is the shape a real tax on a tax has and the reason `of` exists.
 */
test('the four bases are measured against four different things', () => {
  const schedule = scheduleOf([
    lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
    lineOf({ name: 'clearing', base: 'units', rate: 0.25 }),
    lineOf({ name: 'handling', base: 'order', rate: 3 }),
    lineOf({ name: 'levy', base: 'charges', rate: 0.5, of: ['brokerage'] }),
  ]);

  const charged = chargeFor(schedule, FILL, CONTRACT);

  assert.equal(amountOf(charged, 'brokerage'), 10);
  assert.equal(amountOf(charged, 'clearing'), 0.5);
  assert.equal(amountOf(charged, 'handling'), 3);
  assert.equal(amountOf(charged, 'levy'), 5);
  assert.equal(charged.total, 18.5);
});

/**
 * A line levied on charges reads what the cap left, not what the rate asked for.
 *
 * Brokerage is a hundredth of a turnover of 10000, which is 100, capped at 20.
 * The levy is half of brokerage, and half of what was actually charged is 10.
 *
 * Catches an implementation that keeps the unbounded amount for later lines to
 * read and applies the floor and the cap on the way out, which charges 50 here:
 * the common brokerage plan is a percentage under a cap, and every charge levied
 * on it in a real stack is levied on the capped figure.
 */
test('a line levied on charges reads the amount the cap left', () => {
  const schedule = scheduleOf([
    lineOf({ name: 'brokerage', base: 'turnover', rate: 0.01, max: 20 }),
    lineOf({ name: 'levy', base: 'charges', rate: 0.5, of: ['brokerage'] }),
  ]);

  const charged = chargeFor(schedule, FILL, CONTRACT);

  assert.equal(amountOf(charged, 'brokerage'), 20);
  assert.equal(amountOf(charged, 'levy'), 10);
  assert.equal(charged.total, 30);
});

/**
 * A floor lifts a charge that came to less than it, per line.
 *
 * A ten thousandth of a turnover of 10000 is 1, and the line has a floor of 5.
 *
 * Catches an implementation that ignores the floor altogether, which is the half
 * of the bound nothing else in this file would notice, and one that applies the
 * bounds to the rate rather than to the amount, which would charge a rate of 5
 * against the turnover and produce fifty thousand.
 */
test('a floor lifts a charge that came to less than it', () => {
  const schedule = scheduleOf([
    lineOf({ name: 'brokerage', base: 'turnover', rate: 0.0001, min: 5 }),
  ]);

  const charged = chargeFor(schedule, FILL, CONTRACT);

  assert.equal(amountOf(charged, 'brokerage'), 5);
  assert.equal(charged.total, 5);
});

/**
 * A line on one side charges that side and is absent on the other.
 *
 * Catches an implementation that ignores the side and charges both fills, which
 * is the by hand workaround the documentation currently teaches and is wrong by
 * a factor of two over a round trip. Catches one that charges half the rate to
 * each side, the other workaround, which is wrong on every run where the two
 * fills are at different prices. And catches one that puts the line in the
 * breakdown with a zero on the side it did not apply to, which reads as a charge
 * that was levied and came to nothing.
 */
test('a line on one side charges that side and is absent on the other', () => {
  const schedule = scheduleOf([
    lineOf({ name: 'levy', base: 'turnover', side: 'sell', rate: 0.001 }),
  ]);

  const bought = chargeFor(schedule, fillOf({ side: 'buy' }), CONTRACT);
  const sold = chargeFor(schedule, fillOf({ side: 'sell' }), CONTRACT);

  assert.equal(amountOf(bought, 'levy'), undefined);
  assert.equal(bought.lines.length, 0);
  assert.equal(bought.total, 0);
  assert.equal(amountOf(sold, 'levy'), 10);
  assert.equal(sold.total, 10);
});

/**
 * A charge levied on a line that did not apply is levied on nothing.
 *
 * The levy is a sell side line and the tax is levied on it from both sides, so
 * on a buy the tax has nothing to be levied on and comes to zero.
 *
 * Catches an implementation that resolves a name to the line as declared rather
 * than to what that line charged on this fill, which would tax the buy on a levy
 * the buy never paid. Catches one that treats an unmatched name as the whole of
 * the charges so far, which is the shortcut that looks right whenever a schedule
 * has one line before the tax.
 */
test('a charge levied on a line that did not apply is levied on nothing', () => {
  const schedule = scheduleOf([
    lineOf({ name: 'levy', base: 'turnover', side: 'sell', rate: 0.001 }),
    lineOf({ name: 'tax', base: 'charges', rate: 0.5, of: ['levy'] }),
  ]);

  const bought = chargeFor(schedule, fillOf({ side: 'buy' }), CONTRACT);
  const sold = chargeFor(schedule, fillOf({ side: 'sell' }), CONTRACT);

  assert.equal(amountOf(bought, 'tax'), 0);
  assert.equal(bought.total, 0);
  assert.equal(amountOf(sold, 'levy'), 10);
  assert.equal(amountOf(sold, 'tax'), 5);
  assert.equal(sold.total, 15);
});

/**
 * The total is rounded once, halves to even.
 *
 * Every rate below is a sum of halves, so the scaled figure lands exactly on a
 * half and the rule decides it rather than the representation. Two of the four
 * rows separate half to even from halves away from zero, which is the rounding
 * the language itself uses for prices, and the other two separate it from a half
 * that always goes down.
 *
 * Catches an implementation that reaches for the language's own rounding, which
 * is the likely mistake because it is in the same repository and is right for
 * the question it answers. Away from zero biases every exact half upward, and
 * over a long run that bias is a charge nobody was charged.
 */
test('the total is rounded once, halves to even', () => {
  const rows: readonly (readonly [number, Money])[] = [
    [0.125, 0.12],
    [0.375, 0.38],
    [0.625, 0.62],
    [0.875, 0.88],
  ];

  for (const [rate, expected] of rows) {
    const schedule = scheduleOf([lineOf({ name: 'handling', base: 'order', rate })]);
    const charged = chargeFor(schedule, FILL, CONTRACT);
    assert.equal(charged.total, expected, `a charge of ${rate}`);
    assert.equal(amountOf(charged, 'handling'), rate, `the line of ${rate}`);
  }
});

/**
 * Rounding happens once, on the total, and not line by line.
 *
 * Two charges of an eighth are a quarter, and a quarter is a figure two decimals
 * hold exactly. Rounded one line at a time they are twelve hundredths each and
 * come to twenty four.
 *
 * Catches the implementation that rounds every line as it charges it, which is
 * the natural way to write this and produces a report that is out by a hundredth
 * per line per fill: right to eleven digits, wrong in the twelfth, and a failed
 * conformance comparison months later on somebody else's engine.
 */
test('rounding happens once, on the total, and not line by line', () => {
  const schedule = scheduleOf([
    lineOf({ name: 'handling', base: 'order', rate: 0.125 }),
    lineOf({ name: 'carriage', base: 'order', rate: 0.125 }),
  ]);

  const charged = chargeFor(schedule, FILL, CONTRACT);

  assert.equal(amountOf(charged, 'handling'), 0.125);
  assert.equal(amountOf(charged, 'carriage'), 0.125);
  assert.equal(charged.total, 0.25);
});

/**
 * The declaration's three spellings are three bases, and the fill tells them apart.
 *
 * The fill is two units, so a flat fee and a per unit fee cannot come to the same
 * number, and its turnover at a point value of 1 is two hundred, so a percentage
 * cannot either.
 *
 * Catches an implementation that swaps the per unit and per fill spellings, which
 * every test using a single unit would pass. And catches one that reads the
 * percentage as a fraction, which charges a hundred times too much: the
 * declaration states a percentage and a line's rate is a fraction, and the
 * conversion between them is the kind of fact that is written once or wrong.
 */
test('the declaration is three spellings of one line', () => {
  const contract = contractOf({ pointValue: 1 });
  const totalFor = (commission: number, commissionType: string): Money =>
    chargeFor(scheduleFromDeclaration(commission, commissionType, 0, 'CUR', 2), FILL, contract)
      .total;

  assert.equal(totalFor(7, 'perTrade'), 7);
  assert.equal(totalFor(7, 'perUnit'), 14);
  assert.equal(totalFor(0.1, 'percent'), 0.2);
});

/**
 * A commission of zero is no line at all.
 *
 * Catches an implementation that always emits a line, which puts a name and a
 * zero in every breakdown of every run that declares no commission, and which
 * makes a declaration that states a cost model indistinguishable from one that
 * does not. That distinction is what a run needs before it can accept a schedule
 * from the host as well as a commission from the script.
 */
test('a commission of zero is no line at all', () => {
  const schedule = scheduleFromDeclaration(0, 'perTrade', 0, 'CUR', 2);
  const charged = chargeFor(schedule, FILL, CONTRACT);

  assert.equal(schedule.lines.length, 0);
  assert.equal(charged.lines.length, 0);
  assert.equal(charged.total, 0);
});

/**
 * A derived schedule carries the slippage as ticks and says where it came from.
 *
 * Catches an implementation that turns the declared slippage into a charge line,
 * which would take it as money out of the same fill whose price the destination
 * is already worsening, and charge it twice over. And catches one that marks a
 * derived schedule as supplied, which would put it in the record: what the
 * program states is stored once, as the program, and is derived again on replay.
 */
test('a derived schedule carries the slippage as ticks and says so', () => {
  const schedule = scheduleFromDeclaration(20, 'perTrade', 3, 'CUR', 2);

  assert.equal(schedule.slippageTicks, 3);
  assert.equal(schedule.source, 'declaration');
  assert.equal(schedule.currency, 'CUR');
  assert.equal(schedule.digits, 2);
  assert.equal(schedule.lines.length, 1);
  assert.equal(chargeFor(schedule, FILL, CONTRACT).total, 20);
});
