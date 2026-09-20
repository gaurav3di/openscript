/**
 * The gate, run twice: as a history load and as a live feed.
 *
 * Every comparison in this gate hands the engine a dataset. That is one of the
 * two ways `host-interface.md` 6.4 says a host delivers bars, and it is the
 * easy one: each bar arrives once, confirmed, and is executed once. The other
 * is a live feed, where the newest bar arrives unconfirmed, is executed again
 * on every tick, and is confirmed when its interval elapses.
 *
 * **The rollback rule exists to make the difference between the two
 * invisible**, and until now nothing measured it over the studies. The gate
 * computed its references in dataset mode only, so a study whose picture
 * depended on being loaded rather than watched was outside what the gate could
 * see. One was: an outline drawn on the newest bar and never deleted is one
 * object over a dataset and one object per bar on a feed, its own comment said
 * it was one object, and the engine was right both times.
 *
 * So this file runs every study of the phase three gate both ways over the same
 * bars and compares what they publish:
 *
 * - every channel the program writes, bar for bar, absence included;
 * - the drawing objects the script is holding at the end, in creation order;
 * - the grids and their cells at the end.
 *
 * **Alerts are not compared, and that is not an omission.** `stdlib.md` 16.2
 * makes a watched condition fire on a live bar and not on history the study was
 * added to, and the fact that separates the two is `isRealtime`, which a host
 * states. The two deliveries differ there by design, and that difference has
 * its own comparisons in `frames.test.ts`.
 *
 * What this catches, which nothing else can: an object created on the newest
 * bar and never deleted, state that a re-execution does not roll back, and a
 * study whose numbers depend on how many bars the host has supplied so far
 * rather than on the bars themselves.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

import type { Drawing, Engine, Grid, Value } from '../../src/core/engine/index.js';
import { driveWith } from '../hosts/index.js';
import type { PageBar } from '../hosts/index.js';

import { GATE_ROOT } from './support.js';
import { HOST_WITH_READS, STUDY_BARS, loadStudy } from './studies/surface.js';

const SCRIPT = '.oscript';

/** The studies of this gate, read from the tree rather than listed by hand. */
function studies(): readonly string[] {
  return readdirSync(new URL('tests/gate/studies/scripts/', GATE_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(SCRIPT))
    .map((entry) => entry.name.slice(0, -SCRIPT.length))
    .sort();
}

/**
 * The gate's fixture as the page describes a bar, 3.1.
 *
 * The same bars the rest of this gate runs on, read back out of the fixture
 * rather than built a second time, so a study compared here is compared over
 * the prices every other comparison uses.
 */
const BARS: readonly PageBar[] = STUDY_BARS.map((bar) => ({
  time: bar.time as number,
  open: bar.open as number,
  high: bar.high as number,
  low: bar.low as number,
  close: bar.close as number,
  volume: bar.volume as number,
}));

/** Everything one delivery published, spelled so a mismatch reads as a picture. */
interface Published {
  readonly columns: readonly (readonly string[])[];
  readonly drawings: readonly string[];
  readonly grids: readonly string[];
}

function spellValue(value: Value | undefined): string {
  if (value === undefined || value === null) return 'none';
  if (typeof value === 'object' && 'tag' in value && value.tag === 'color') {
    return `${value.r}:${value.g}:${value.b}:${value.a}`;
  }
  return String(value);
}

function spellDrawing(one: Drawing): string {
  const anchors = one.anchors
    .map((anchor) => `${spellValue(anchor.time)}@${spellValue(anchor.price)}`)
    .join(' ');
  const style = Object.keys(one.style)
    .sort()
    .map((key) => `${key}=${spellValue(one.style[key])}`)
    .join(' ');
  return `${one.kind}[${anchors}] ${style}`;
}

function spellGrid(grid: Grid): string {
  const cells = grid.cells
    .map(
      (cell) =>
        `${cell.row},${cell.col}=${spellValue(cell.text)}` +
        `|${spellValue(cell.textColor)}|${spellValue(cell.bgColor)}|${spellValue(cell.align)}`,
    )
    .join(';');
  return `${grid.key}[${grid.rows}x${grid.cols}] ${cells}`;
}

function published(engine: Engine): Published {
  return {
    columns: engine.program.channels.map((_channel, index) =>
      engine.column(index).map(spellValue),
    ),
    drawings: engine.drawings().map(spellDrawing),
    grids: engine.tables().map(spellGrid),
  };
}

/**
 * One study, run both ways, with nothing reported on any hand-over.
 *
 * The live feed executes each bar four times where the history load executes it
 * once, so a failure names the hand-over rather than the bar: a study that
 * stopped on the third execution of bar forty stopped on a moving bar, which is
 * a different fault from one that stopped on bar forty.
 */
function bothWays(name: string): { history: Published; feed: Published } {
  const out: { history?: Published; feed?: Published } = {};
  for (const delivery of ['history', 'feed'] as const) {
    const engine = loadStudy(name, {}, { host: HOST_WITH_READS });
    const results = driveWith(engine, BARS, delivery);
    const stopped = results.find((result) => result.diagnostic !== undefined);
    assert.equal(
      stopped?.diagnostic?.code,
      undefined,
      `${name} stopped as a ${delivery} on bar ${stopped?.index ?? -1}`,
    );
    out[delivery] = published(engine);
  }
  return { history: out.history as Published, feed: out.feed as Published };
}

test('every study of the gate publishes the same picture on a feed as on a load', () => {
  const names = studies();
  assert.equal(names.length >= 100, true, `the gate holds ${names.length} studies, not a hundred`);

  for (const name of names) {
    const { history, feed } = bothWays(name);
    assert.equal(
      feed.columns.length,
      history.columns.length,
      `${name}: the two deliveries wrote a different number of channels`,
    );
    for (let channel = 0; channel < history.columns.length; channel += 1) {
      assert.deepEqual(
        feed.columns[channel],
        history.columns[channel],
        `${name}: channel ${channel} differs between a live feed and a history load`,
      );
    }
    assert.deepEqual(
      feed.drawings,
      history.drawings,
      `${name}: the objects it holds on a live feed are not the objects it holds on a load. ` +
        `An object drawn on the newest bar is drawn on every bar of a feed, so one that is ` +
        `never deleted is one object in a backtest and one per bar on a running chart.`,
    );
    assert.deepEqual(
      feed.grids,
      history.grids,
      `${name}: the panel it shows on a live feed is not the panel it shows on a load`,
    );
  }
});
