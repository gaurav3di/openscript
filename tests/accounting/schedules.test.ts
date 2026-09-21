/**
 * The arrangements a run cannot be carried out under, OS6021.
 *
 * **A cost model that quietly charges nothing is a backtest that lies in the
 * strategy's favour**, and that is what every arrangement here would produce if
 * it were accepted. A line levied on a line declared after it has no single
 * evaluation order, so two engines charge two different amounts and both are
 * defensible. A slippage in ticks with no tick size measures nothing and costs
 * nothing. A schedule in another currency charges money the contract is not
 * priced in. None of them is a number a reader could explain afterwards, and all
 * of them are refused before the first bar, while nothing has been computed and
 * correcting the setting costs one run.
 *
 * What is asserted is the code and the position, never the sentence. The
 * schedule of each row differs from a sound one by exactly one thing, so the row
 * that stops failing when a rule is removed names the rule.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { scheduleFromDeclaration, scheduleProblem } from '../../src/core/index.js';
import type { ChargeSchedule, Contract } from '../../src/core/index.js';
import { CONTRACT, SOUND, contractOf, lineOf, scheduleOf } from './charges-support.js';

/** One arrangement, and whether the contract is part of what makes it one. */
interface Refused {
  readonly where: string;
  readonly schedule: ChargeSchedule;
  readonly contract?: Contract;
}

/**
 * A schedule that can be carried out is refused for nothing.
 *
 * This is the test that keeps the rest of the file honest. A check that refused
 * everything would satisfy every assertion below, and this is the one it fails,
 * so the refusals cannot quietly become a rule that says no.
 *
 * The declaration's own schedule is put through the same check, because a
 * schedule this module builds and then refuses would be a cost model that cannot
 * state the language's own commission.
 */
test('a schedule that can be carried out is refused for nothing', () => {
  assert.equal(scheduleProblem(scheduleOf(SOUND)), null);
  assert.equal(scheduleProblem(scheduleOf(SOUND), CONTRACT), null);
  assert.equal(scheduleProblem(scheduleOf(SOUND, { slippageTicks: 2 }), CONTRACT), null);
  assert.equal(
    scheduleProblem(scheduleFromDeclaration(20, 'perTrade', 1, 'CUR', 2), CONTRACT),
    null,
  );
});

/**
 * Every arrangement a run cannot be carried out under is refused as OS6021.
 *
 * The defect is the second or the third line of a row wherever the row has more
 * than one, because an implementation that checks the first line and stops is one
 * of the shapes this table exists to catch, and it would pass a table that put
 * every defect first.
 *
 * Catches, row by row: an implementation that resolves a levy against every name
 * in the schedule rather than against the names declared before the line, which
 * admits a schedule with no single evaluation order; one that lets a line be
 * levied on itself, which is a charge that depends on its own answer; one that
 * accepts a name no line carries, so the charge is levied on nothing and comes to
 * nothing; one that reads the names on a line whose base does not use them, which
 * is a fact in the record that nothing acts on; one that lets two lines share a
 * name, so a levy on that name has two answers; one that accepts a negative rate,
 * a floor above a cap or a bound that is not money, each of which pays the
 * strategy to trade; one that accepts a slippage in ticks with no tick to measure
 * it in, which charges nothing and flatters every run; one that lets the schedule
 * and the contract disagree about the currency or the digits, which is the same
 * fact stated twice and left to drift; and one that takes a schedule derived
 * from the declaration as already checked, which it is not: nothing in the
 * language refuses a declared commission below zero, so a run under one would
 * pay the strategy for trading.
 */
test('an arrangement a run cannot be carried out under is refused', () => {
  const rows: readonly Refused[] = [
    {
      where: 'a line levied on one declared after it',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'levy', base: 'charges', rate: 0.18, of: ['clearing'] }),
        lineOf({ name: 'clearing', base: 'units', rate: 0.01 }),
      ]),
    },
    {
      where: 'a line levied on itself',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'levy', base: 'charges', rate: 0.18, of: ['levy'] }),
      ]),
    },
    {
      where: 'a line levied on a name no line carries',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'levy', base: 'charges', rate: 0.18, of: ['handling'] }),
      ]),
    },
    {
      where: 'a line levied on charges and naming none',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'levy', base: 'charges', rate: 0.18 }),
      ]),
    },
    {
      where: 'a line levied on the same line twice',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'levy', base: 'charges', rate: 0.18, of: ['brokerage', 'brokerage'] }),
      ]),
    },
    {
      where: 'names carried by a line whose base reads none',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'clearing', base: 'units', rate: 0.01, of: ['brokerage'] }),
      ]),
    },
    {
      where: 'two lines sharing one name',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'brokerage', base: 'units', rate: 0.01 }),
      ]),
    },
    {
      where: 'a line carrying no name',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: '  ', base: 'order', rate: 1 }),
      ]),
    },
    {
      where: 'a rate below zero',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'rebate', base: 'order', rate: -1 }),
      ]),
    },
    {
      where: 'a rate that is not a number',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'handling', base: 'order', rate: Number.NaN }),
      ]),
    },
    {
      where: 'a floor above the cap',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'handling', base: 'order', rate: 1, min: 10, max: 5 }),
      ]),
    },
    {
      where: 'a floor below zero',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'handling', base: 'order', rate: 1, min: -1 }),
      ]),
    },
    {
      where: 'a cap below zero',
      schedule: scheduleOf([
        lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 }),
        lineOf({ name: 'handling', base: 'order', rate: 1, max: -1 }),
      ]),
    },
    { where: 'slippage below zero', schedule: scheduleOf(SOUND, { slippageTicks: -1 }) },
    {
      where: 'slippage in ticks with no tick size',
      schedule: scheduleOf(SOUND, { slippageTicks: 2 }),
      contract: contractOf({ tickSize: null }),
    },
    {
      where: 'slippage in ticks with a tick size of zero',
      schedule: scheduleOf(SOUND, { slippageTicks: 2 }),
      contract: contractOf({ tickSize: 0 }),
    },
    {
      where: 'a currency the contract is not priced in',
      schedule: scheduleOf(SOUND, { currency: 'ZZZ' }),
      contract: CONTRACT,
    },
    {
      where: 'digits the contract does not round to',
      schedule: scheduleOf(SOUND, { digits: 4 }),
      contract: CONTRACT,
    },
    {
      where: 'a commission the declaration states below zero',
      schedule: scheduleFromDeclaration(-5, 'perTrade', 0, 'CUR', 2),
    },
    { where: 'a digit count that is not whole', schedule: scheduleOf(SOUND, { digits: 2.5 }) },
    { where: 'more digits than money is held in', schedule: scheduleOf(SOUND, { digits: 16 }) },
    { where: 'no currency at all', schedule: scheduleOf(SOUND, { currency: '' }) },
  ];

  for (const row of rows) {
    const refused = scheduleProblem(row.schedule, row.contract ?? null);
    assert.equal(refused?.code, 'OS6021', row.where);
  }
});

/**
 * The same two lines are refused in one order and carried out in the other.
 *
 * Catches an implementation that checks a levied name against the whole schedule
 * rather than against the lines declared before the line that carries it. Such a
 * check accepts both orders, and one of the two has no single evaluation order:
 * two engines would charge two different amounts and both would be defensible.
 */
test('the order the lines are declared in is what decides the levy', () => {
  const brokerage = lineOf({ name: 'brokerage', base: 'turnover', rate: 0.001 });
  const levy = lineOf({ name: 'levy', base: 'charges', rate: 0.18, of: ['brokerage'] });

  assert.equal(scheduleProblem(scheduleOf([levy, brokerage]))?.code, 'OS6021');
  assert.equal(scheduleProblem(scheduleOf([brokerage, levy])), null);
});

/**
 * The refusal points at the run rather than at a line of the script.
 *
 * A schedule is what the host stated before the first bar and nobody wrote it in
 * a strategy, so there is no line to point at and the position is the one the
 * engine gives a load-time failure.
 *
 * Catches an implementation that invents a position, which would draw a caret
 * under whatever happens to be on the first line of somebody's script and blame
 * the one party that did not choose the setting.
 */
test('the refusal points at the run rather than at a line of the script', () => {
  const refused = scheduleProblem(scheduleOf(SOUND, { currency: '' }));

  assert.equal(refused?.code, 'OS6021');
  assert.equal(refused?.span.offset, 0);
  assert.equal(refused?.span.length, 0);
  assert.equal(refused?.span.line, 0);
  assert.equal(refused?.span.column, 0);
});
