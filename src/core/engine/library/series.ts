/**
 * The series calls that hold state, `stdlib.md` sections 4 and 9.
 *
 * **Every number here is the numeric library's.** The arithmetic is computed
 * under `src/core/stdlib`, which depends on nothing else in the repository and
 * is tested against reference vectors on its own, and this file is the wiring
 * that hands it the arguments a call site supplied and the state region the
 * machine holds for that call site. A second arrangement of the same formula
 * here would be a second accumulation order waiting to drift, and
 * `compiled-program.md` section 8.3 makes that a release blocker rather than a
 * tidiness problem.
 *
 * That is possible because every function in the numeric library is written as
 * a step over a state region rather than as a closure: 2.11 requires a region
 * to be snapshottable by a mechanical copy, and a closure is not one. The key
 * each step is given is its address inside the region, so a study built from
 * three others keeps one flat record rather than a tree of them.
 */
import type { Direction } from '../../stdlib/index.js';
import {
  avgSkipStep,
  barsSinceStep,
  changeStep,
  countPresentStep,
  countStep,
  crossStep,
  cumStep,
  emaStep,
  extremeStep,
  hmaStep,
  historyStep,
  percentileStep,
  pivotStep,
  rmaStep,
  rocStep,
  runStep,
  smaStep,
  sumSkipStep,
  sumStep,
  valueWhenStep,
  wmaStep,
} from '../../stdlib/index.js';
import { boolAt, lengthAt, numberAt } from './binding.js';
import type { ManifestEntry } from './binding.js';
import { stateful } from './state.js';

/** The three crossing tests, which differ only in which direction counts. */
function crossing(name: string, direction: Direction): ManifestEntry {
  return stateful(name, 'a b', (ctx, args) =>
    crossStep(ctx.state, '', { a: numberAt(args, 0), b: numberAt(args, 1) }, direction),
  );
}

export const SERIES_ENTRIES: readonly ManifestEntry[] = [
  stateful('sma', 'src len', (ctx, args) =>
    smaStep(ctx.state, 'q', numberAt(args, 0), lengthAt(ctx, 'sma', 'len', args, 1)),
  ),
  stateful('ema', 'src len', (ctx, args) =>
    emaStep(ctx.state, 'e', numberAt(args, 0), lengthAt(ctx, 'ema', 'len', args, 1)),
  ),
  stateful('rma', 'src len', (ctx, args) =>
    rmaStep(ctx.state, 'r', numberAt(args, 0), lengthAt(ctx, 'rma', 'len', args, 1)),
  ),
  stateful('wma', 'src len', (ctx, args) =>
    wmaStep(ctx.state, 'w', numberAt(args, 0), lengthAt(ctx, 'wma', 'len', args, 1)),
  ),
  stateful('hma', 'src len', (ctx, args) =>
    hmaStep(ctx.state, '', numberAt(args, 0), lengthAt(ctx, 'hma', 'len', args, 1)),
  ),

  stateful('highest', 'src len', (ctx, args) =>
    extremeStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'highest', 'len', args, 1),
      true,
      false,
    ),
  ),
  stateful('lowest', 'src len', (ctx, args) =>
    extremeStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'lowest', 'len', args, 1),
      false,
      false,
    ),
  ),
  stateful('highestBars', 'src len', (ctx, args) =>
    extremeStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'highestBars', 'len', args, 1),
      true,
      true,
    ),
  ),
  stateful('lowestBars', 'src len', (ctx, args) =>
    extremeStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'lowestBars', 'len', args, 1),
      false,
      true,
    ),
  ),

  stateful('change', 'src', (ctx, args) => changeStep(ctx.state, 'c', numberAt(args, 0), 1)),
  stateful('change', 'src len', (ctx, args) =>
    changeStep(ctx.state, 'c', numberAt(args, 0), lengthAt(ctx, 'change', 'len', args, 1)),
  ),
  stateful('mom', 'src len', (ctx, args) =>
    changeStep(ctx.state, 'c', numberAt(args, 0), lengthAt(ctx, 'mom', 'len', args, 1)),
  ),
  stateful('roc', 'src len', (ctx, args) =>
    rocStep(ctx.state, '', numberAt(args, 0), lengthAt(ctx, 'roc', 'len', args, 1)),
  ),
  stateful('history', 'src n', (ctx, args) =>
    historyStep(ctx.state, 'h', numberAt(args, 0), lengthAt(ctx, 'history', 'n', args, 1)),
  ),

  stateful('sum', 'src len', (ctx, args) =>
    sumStep(ctx.state, 'q', numberAt(args, 0), lengthAt(ctx, 'sum', 'len', args, 1)),
  ),
  stateful('sumSkip', 'src len', (ctx, args) =>
    sumSkipStep(ctx.state, 'q', numberAt(args, 0), lengthAt(ctx, 'sumSkip', 'len', args, 1)),
  ),
  stateful('avgSkip', 'src len', (ctx, args) =>
    avgSkipStep(ctx.state, 'q', numberAt(args, 0), lengthAt(ctx, 'avgSkip', 'len', args, 1)),
  ),
  stateful('countPresent', 'src len', (ctx, args) =>
    countPresentStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'countPresent', 'len', args, 1),
    ),
  ),
  stateful('count', 'cond len', (ctx, args) =>
    countStep(ctx.state, 'q', boolAt(args, 0), lengthAt(ctx, 'count', 'len', args, 1)),
  ),

  stateful('cum', 'src', (ctx, args) => cumStep(ctx.state, 't', numberAt(args, 0))),

  stateful('rising', 'src len', (ctx, args) =>
    runStep(ctx.state, 'q', numberAt(args, 0), lengthAt(ctx, 'rising', 'len', args, 1), true),
  ),
  stateful('falling', 'src len', (ctx, args) =>
    runStep(ctx.state, 'q', numberAt(args, 0), lengthAt(ctx, 'falling', 'len', args, 1), false),
  ),

  crossing('crossUp', 'up'),
  crossing('crossDown', 'down'),
  crossing('cross', 'either'),

  stateful('barsSince', 'cond', (ctx, args) => barsSinceStep(ctx.state, 's', boolAt(args, 0))),

  // An absent occurrence is the most recent hit, which is what the declared
  // default of the call says.
  stateful('valueWhen', 'cond src occurrence', (ctx, args) =>
    valueWhenStep(
      ctx.state,
      'v',
      { cond: boolAt(args, 0), src: numberAt(args, 1) },
      numberAt(args, 2) ?? 0,
    ),
  ),

  stateful('median', 'src len', (ctx, args) =>
    percentileStep(ctx.state, 'q', numberAt(args, 0), lengthAt(ctx, 'median', 'len', args, 1), 50),
  ),
  stateful('percentile', 'src len p', (ctx, args) =>
    percentileStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'percentile', 'len', args, 1),
      numberAt(args, 2),
    ),
  ),

  stateful('pivotHigh', 'src left right', (ctx, args) =>
    pivotStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'pivotHigh', 'left', args, 1),
      lengthAt(ctx, 'pivotHigh', 'right', args, 2),
      true,
    ),
  ),
  stateful('pivotLow', 'src left right', (ctx, args) =>
    pivotStep(
      ctx.state,
      'q',
      numberAt(args, 0),
      lengthAt(ctx, 'pivotLow', 'left', args, 1),
      lengthAt(ctx, 'pivotLow', 'right', args, 2),
      false,
    ),
  ),
];
