/**
 * Drawing objects: creation, mutation, deletion, rollback and the ceiling.
 *
 * `stdlib.md` 14.4 and `language.md` 5.4 decide the lifetime rules, and every
 * one of them is a thing an engine can get wrong while still drawing something
 * that looks right:
 *
 * - An object created on the moving bar and not rolled back gives a live chart
 *   one object per tick and a backtest of the same data one per bar. The two
 *   would disagree about the same script, which is the disagreement the whole
 *   rollback design exists to prevent, so it is tested against a second engine
 *   that saw the same bars once rather than against a count.
 * - A setter that answers nothing for a deleted object leaves a drawing that
 *   quietly stopped moving, and a script that cannot tell that from a drawing
 *   that is where it asked for.
 * - An anchor resolved against a bar index survives until somebody loads more
 *   history, and then every object on the chart is in the wrong place.
 * - A ceiling that drops the oldest object produces a study that is correct on
 *   the right of the chart and wrong on the left.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { Drawing, EngineLimits } from '../../src/core/engine/index.js';
import { namedColour } from '../../src/core/engine/library/index.js';
import { flat, running } from './support.js';

const BASE_TIME = 1_748_736_000_000;

/** A script with its declaration, so each case below is only its own lines. */
function study(...lines: readonly string[]): string {
  return ['version 1', '', 'study("Objects")', '', ...lines, '', 'plot(close, "c", aqua)'].join(
    '\n',
  );
}

/** A bar at a price, an hour after the one before it. */
function bar(index: number, close: number) {
  return flat(close, BASE_TIME + index * 3_600_000);
}

/** Runs `count` confirmed bars and hands back the engine. */
function over(source: string, count: number, limits?: Partial<EngineLimits>) {
  const engine = running(source, limits === undefined ? {} : { limits });
  const results = [];
  for (let i = 0; i < count; i += 1) results.push(engine.append(bar(i, 100 + i), { isConfirmed: true }));
  return { engine, results };
}

function only(drawings: readonly Drawing[]): Drawing {
  assert.equal(drawings.length, 1, 'exactly one object');
  return drawings[0] as Drawing;
}

test('each of the four calls creates an object anchored in time and price', () => {
  const { engine } = over(
    study(
      'if bar.isFirst',
      '    draw.line(time, low, time + 3600000, high)',
      '    draw.label(time, close, "here")',
      '    draw.box(time, low, time + 3600000, high)',
      '    draw.polyline([time, time + 3600000], [low, high])',
    ),
    2,
  );
  const drawn = engine.drawings();
  assert.deepEqual(
    drawn.map((one) => one.kind),
    ['line', 'label', 'box', 'polyline'],
    'creation order, which is the order a host draws them in',
  );
  assert.deepEqual(drawn[0]?.anchors, [
    { time: BASE_TIME, price: 100 },
    { time: BASE_TIME + 3_600_000, price: 100 },
  ]);
  assert.deepEqual(drawn[1]?.anchors, [{ time: BASE_TIME, price: 100 }]);
  assert.deepEqual(drawn[3]?.anchors, [
    { time: BASE_TIME, price: 100 },
    { time: BASE_TIME + 3_600_000, price: 100 },
  ]);
});

/**
 * Catches the emitter leaving an omitted argument absent.
 *
 * Absence on a drawing surface means nothing is drawn (`language.md` 6.7), so a
 * line whose width and style were left out would be a line with no thickness
 * and no line style rather than the one `stdlib.md` 14.4 describes. The values
 * are the specification's, and the colour is compared against the engine's own
 * table rather than against four numbers typed here.
 */
test('an argument a script leaves out arrives as the default the library declares', () => {
  const { engine } = over(study('if bar.isFirst', '    draw.line(time, low, time, high)'), 1);
  assert.deepEqual(only(engine.drawings()).style, {
    color: namedColour('gray'),
    width: 1,
    style: 'solid',
    extendLeft: false,
    extendRight: false,
  });
});

test('a box takes its own defaults, which are not the line defaults', () => {
  const { engine } = over(study('if bar.isFirst', '    draw.box(time, low, time, high)'), 1);
  const style = only(engine.drawings()).style;
  assert.equal(style['opacity'], 0.12);
  assert.equal(style['width'], 1);
  assert.equal(style['text'], '');
  assert.deepEqual(style['textColor'], namedColour('white'));
  assert.equal(style['color'], null, 'an omitted box border is absent, which is a box with none');
});

test('the setters move, extend and restyle the object they are given', () => {
  const { engine } = over(
    study(
      'var held = none',
      'if bar.isFirst',
      '    held = draw.line(time, low, time, high)',
      'if bar.index == 1',
      '    draw.setBounds(held, time, 10, time + 60000, 20)',
      '    draw.setColor(held, red)',
      '    draw.setWidth(held, 3)',
      '    draw.setStyle(held, "dashed")',
      '    draw.setExtend(held, false, true)',
      '    draw.setTooltip(held, "moved")',
    ),
    2,
  );
  const line = only(engine.drawings());
  assert.deepEqual(line.anchors, [
    { time: BASE_TIME + 3_600_000, price: 10 },
    { time: BASE_TIME + 3_600_000 + 60_000, price: 20 },
  ]);
  assert.deepEqual(line.style, {
    color: namedColour('red'),
    width: 3,
    style: 'dashed',
    extendLeft: false,
    extendRight: true,
    tooltip: 'moved',
  });
});

test('setFrom and setTo move one end each, and setAt moves a label', () => {
  const { engine } = over(
    study(
      'var held = none',
      'var tag = none',
      'if bar.isFirst',
      '    held = draw.box(time, low, time, high)',
      '    tag = draw.label(time, close, "here")',
      'if bar.index == 1',
      '    draw.setFrom(held, 1, 2)',
      '    draw.setTo(held, 3, 4)',
      '    draw.setAt(tag, 5, 6)',
      '    draw.setText(tag, "moved")',
    ),
    2,
  );
  const drawn = engine.drawings();
  assert.deepEqual(drawn[0]?.anchors, [
    { time: 1, price: 2 },
    { time: 3, price: 4 },
  ]);
  assert.deepEqual(drawn[1]?.anchors, [{ time: 5, price: 6 }]);
  assert.equal(drawn[1]?.style['text'], 'moved');
});

/**
 * An anchor is a time and a price, and the engine resolves neither against the
 * bars.
 *
 * Catches an engine that clamps an anchor to the newest bar, which would put
 * every projected line back on the chart's right edge, and one that stores a
 * bar index, which would move every object on the chart the next time more
 * history loaded.
 */
test('an anchor past the newest bar is kept, and an old one does not move as bars arrive', () => {
  const { engine } = over(
    study(
      'if bar.isFirst',
      '    draw.line(time, low, time + 864000000, high)',
    ),
    40,
  );
  assert.deepEqual(only(engine.drawings()).anchors, [
    { time: BASE_TIME, price: 100 },
    { time: BASE_TIME + 864_000_000, price: 100 },
  ]);
});

test('a polyline keeps the path it was given, and setPoints replaces it', () => {
  const { engine } = over(
    study(
      'var times = []',
      'var prices = []',
      'var path = none',
      'if bar.isFirst',
      '    push(times, time)',
      '    push(prices, close)',
      '    path = draw.polyline(times, prices)',
      'if bar.index == 1',
      // Pushing to the arrays the polyline was built from changes nothing: the
      // object read them once, at the call.
      '    push(times, time)',
      '    push(prices, close)',
      'if bar.index == 2',
      '    draw.setPoints(path, times, prices)',
    ),
    2,
  );
  assert.deepEqual(only(engine.drawings()).anchors, [{ time: BASE_TIME, price: 100 }]);

  const { engine: after } = over(
    study(
      'var times = []',
      'var prices = []',
      'var path = none',
      'if bar.isFirst',
      '    push(times, time)',
      '    push(prices, close)',
      '    path = draw.polyline(times, prices)',
      'if bar.index == 1',
      '    push(times, time)',
      '    push(prices, close)',
      '    draw.setPoints(path, times, prices)',
    ),
    2,
  );
  assert.deepEqual(only(after.drawings()).anchors, [
    { time: BASE_TIME, price: 100 },
    { time: BASE_TIME + 3_600_000, price: 101 },
  ]);
});

/**
 * A point with no price is a gap rather than a point that was never asked for.
 *
 * Catches an engine that pairs the two arrays over the shorter of them, which
 * would draw a shape the script did not describe and say nothing about it.
 */
test('a path whose arrays are different lengths keeps every point it was given', () => {
  const { engine } = over(
    study('if bar.isFirst', '    draw.polyline([1.0, 2.0, 3.0], [10.0, 20.0])'),
    1,
  );
  assert.deepEqual(only(engine.drawings()).anchors, [
    { time: 1, price: 10 },
    { time: 2, price: 20 },
    { time: 3, price: null },
  ]);
});

/** A script whose one plot is the object count, so `columns[0]` is that count. */
function counting(...lines: readonly string[]): string {
  return [
    'version 1',
    '',
    'study("Objects")',
    '',
    ...lines,
    '',
    'plot(draw.count(), "n", red)',
  ].join('\n');
}

test('deleting removes the object, and deleting twice is not an error', () => {
  const { engine, results } = over(
    counting(
      'var held = none',
      'if bar.isFirst',
      '    held = draw.box(time, low, time, high)',
      'if bar.index == 1',
      '    draw.delete(held)',
      '    draw.delete(held)',
    ),
    2,
  );
  assert.equal(results[1]?.diagnostic, undefined, 'the second delete is not an error');
  assert.deepEqual(engine.drawings(), []);
  assert.equal(results[0]?.columns[0], 1, 'draw.count() sees the object on the bar that made it');
  assert.equal(results[1]?.columns[0], 0, 'and not after it was deleted');
});

test('deleteAll removes every object the script holds and leaves it able to draw more', () => {
  const { engine, results } = over(
    counting(
      'if bar.index < 3',
      '    draw.line(time, low, time, high)',
      'if bar.index == 3',
      '    draw.deleteAll()',
      '    draw.label(time, close, "after")',
    ),
    5,
  );
  assert.equal(results[2]?.columns[0], 3);
  assert.equal(results[3]?.columns[0], 1);
  assert.deepEqual(
    engine.drawings().map((one) => one.kind),
    ['label'],
  );
});

/**
 * Every setter, against an object the script already deleted.
 *
 * One of these was already covered and thirteen were not, and a setter is
 * wrong one setter at a time: the refusal lives in a helper that each of them
 * calls, and a new setter that forgets to call it looks exactly like the
 * thirteen that do until somebody deletes an object.
 */
const SETTERS: readonly (readonly [string, string])[] = [
  ['draw.line(time, low, time, high)', 'draw.setFrom(held, time, low)'],
  ['draw.line(time, low, time, high)', 'draw.setTo(held, time, high)'],
  ['draw.line(time, low, time, high)', 'draw.setBounds(held, time, low, time, high)'],
  ['draw.line(time, low, time, high)', 'draw.setColor(held, red)'],
  ['draw.line(time, low, time, high)', 'draw.setWidth(held, 2)'],
  ['draw.line(time, low, time, high)', 'draw.setStyle(held, "dotted")'],
  ['draw.line(time, low, time, high)', 'draw.setExtend(held, true, true)'],
  ['draw.line(time, low, time, high)', 'draw.setTooltip(held, "x")'],
  ['draw.label(time, close, "a")', 'draw.setAt(held, time, close)'],
  ['draw.label(time, close, "a")', 'draw.setText(held, "b")'],
  ['draw.label(time, close, "a")', 'draw.setTextColor(held, red)'],
  ['draw.box(time, low, time, high)', 'draw.setFillColor(held, red)'],
  ['draw.polyline([1.0], [2.0])', 'draw.setPoints(held, [3.0], [4.0])'],
];

test('every setter refuses an object the script deleted, with OS4005 and the bar it went on', () => {
  for (const [create, mutate] of SETTERS) {
    const { results } = over(
      study(
        'var held = none',
        'if bar.isFirst',
        `    held = ${create}`,
        'if bar.index == 1',
        '    draw.delete(held)',
        'if bar.index == 2',
        `    ${mutate}`,
      ),
      3,
    );
    const diagnostic = results[2]?.diagnostic;
    assert.equal(diagnostic?.code, 'OS4005', mutate);
    assert.equal(diagnostic?.span.line, 11, `${mutate}: the line of the setter, not of the delete`);
    assert.equal(diagnostic?.values['bar'], 1, `${mutate}: the bar the object was deleted on`);
  }
});

test('deleteAll makes every handle to it stale in the same way', () => {
  const { results } = over(
    study(
      'var held = none',
      'if bar.isFirst',
      '    held = draw.line(time, low, time, high)',
      'if bar.index == 1',
      '    draw.deleteAll()',
      'if bar.index == 2',
      '    draw.setColor(held, red)',
    ),
    3,
  );
  assert.equal(results[2]?.diagnostic?.code, 'OS4005');
});

/**
 * A setter given absence does nothing, which is what the fix for OS4005 asks a
 * script to produce.
 *
 * Catches an engine that treats an absent handle as a stale one: the catalogue
 * tells a reader to assign `none` beside the delete, and a script that did as
 * it was told would then stop on the next bar.
 */
test('a setter given an absent handle is a gap rather than a refusal', () => {
  const { results, engine } = over(
    study(
      'var held = none',
      'if bar.isFirst',
      '    held = draw.line(time, low, time, high)',
      'if bar.index == 1',
      '    draw.delete(held)',
      '    held = none',
      'if bar.index == 2',
      '    draw.setColor(held, red)',
    ),
    3,
  );
  assert.equal(results[2]?.diagnostic, undefined);
  assert.deepEqual(engine.drawings(), []);
});

const PER_BAR = study(
  'var held = none',
  'if bar.isFirst',
  '    held = draw.box(time, low, time, high)',
  'if not bar.isFirst',
  '    draw.setTo(held, time, high)',
  '    draw.label(time, close, "tick " + text(bar.index, 0))',
);

/**
 * The invariant the rollback design exists for, stated as the specification
 * states it: executing the moving bar many times leaves what executing it once
 * leaves.
 *
 * Compared against a second engine over the same bars rather than against a
 * count, because a count catches an engine that accumulates objects and misses
 * one that accumulates mutations: the box below is moved on every execution,
 * and a re-execution that did not roll back would move it from where the
 * discarded one left it.
 */
test('five updates to the newest bar then a confirm leave exactly what one pass leaves', () => {
  const once = running(PER_BAR);
  for (let i = 0; i < 4; i += 1) once.append(bar(i, 100 + i), { isConfirmed: true });

  const many = running(PER_BAR);
  for (let i = 0; i < 3; i += 1) many.append(bar(i, 100 + i), { isConfirmed: true });
  many.append(bar(3, 120), { isConfirmed: false });
  for (let update = 0; update < 5; update += 1) {
    many.update(bar(3, 90 + update), { isConfirmed: false });
  }
  many.update(bar(3, 103), { isConfirmed: true });

  assert.deepEqual(many.drawings(), once.drawings());
});

test('an object deleted on a moving bar comes back when that bar runs again', () => {
  // 6.1: the checkpoint holds the object set, so a delete is undone like every
  // other change. Catches an engine that journals creation and not deletion,
  // where a tick that deleted a box would delete it for good.
  const engine = running(
    counting(
      'var held = none',
      'if bar.isFirst',
      '    held = draw.box(time, low, time, high)',
      'if close < 95',
      '    draw.delete(held)',
    ),
  );
  engine.append(bar(0, 100), { isConfirmed: true });
  assert.equal(engine.append(bar(1, 90), { isConfirmed: false }).columns[0], 0, 'deleted');
  assert.equal(engine.update(bar(1, 110), { isConfirmed: false }).columns[0], 1, 'and back');
  assert.equal(engine.drawings().length, 1);
});

test('a bar that fails leaves the objects it created rolled back with everything else', () => {
  // A bar that raises runs no further steps, and the objects it made are part
  // of what the failed execution is undone out of. Catches an engine that
  // leaves half a bar's drawings on the chart under an error message.
  const engine = running(
    study(
      'var held = none',
      'if bar.isFirst',
      '    held = draw.line(time, low, time, high)',
      'if bar.index == 1',
      '    draw.delete(held)',
      '    draw.label(time, close, "made before the failure")',
      '    draw.setColor(held, red)',
    ),
  );
  engine.append(bar(0, 100), { isConfirmed: true });
  assert.equal(engine.append(bar(1, 101), { isConfirmed: true }).diagnostic?.code, 'OS4005');
  assert.deepEqual(
    engine.drawings().map((one) => one.kind),
    ['line'],
    'the label the failed bar made is gone, and the line it deleted is back',
  );
});

/**
 * The ceiling, and the shape it exists for.
 *
 * A script that creates one object per bar over a long dataset is the whole
 * reason there is a number here at all, so the refusal is asserted on that
 * script rather than on a loop that makes ten thousand objects in one bar.
 */
test('one object per bar stops at the ceiling with OS5010, naming it and the count', () => {
  const { results } = over(
    study('draw.box(time, low, time, high)'),
    10,
    { drawingObjects: 4 },
  );
  assert.deepEqual(
    results.map((one) => one.diagnostic?.code),
    [undefined, undefined, undefined, undefined, 'OS5010', 'OS5010', 'OS5010', 'OS5010', 'OS5010', 'OS5010'],
    'the fifth object is refused, and the script stays stopped',
  );
  assert.equal(results[4]?.diagnostic?.values['max'], 4);
  assert.equal(results[4]?.diagnostic?.values['found'], 5);
});

test('a script that deletes as it goes runs past the ceiling for ever', () => {
  // The other half of the rule, and the one that decides whether the ceiling is
  // a budget or a bar count. Objects deleted are objects the ceiling has
  // forgotten, so a study that keeps a bounded set never meets it.
  const { results, engine } = over(
    study(
      'var zones = []',
      'push(zones, draw.box(time, low, time, high))',
      'if size(zones) > 3',
      '    draw.delete(element(zones, 0))',
      '    shift(zones)',
    ),
    50,
    { drawingObjects: 4 },
  );
  assert.deepEqual(
    results.filter((one) => one.diagnostic !== undefined),
    [],
    'fifty bars, a bounded set of objects, no refusal',
  );
  assert.equal(engine.drawings().length, 3);
});

test('an object rolled back off a moving bar is not charged to the ceiling', () => {
  // Catches a ceiling counted with a number the rollback does not restore: a
  // live chart would then refuse a script after enough ticks that a backtest of
  // the same bars runs perfectly.
  const engine = running(study('draw.box(time, low, time, high)'), {
    limits: { drawingObjects: 3 },
  });
  engine.append(bar(0, 100), { isConfirmed: true });
  engine.append(bar(1, 101), { isConfirmed: false });
  for (let update = 0; update < 20; update += 1) {
    const result = engine.update(bar(1, 101 + update), { isConfirmed: false });
    assert.equal(result.diagnostic, undefined, `update ${update}`);
  }
  assert.equal(engine.drawings().length, 2);
});
