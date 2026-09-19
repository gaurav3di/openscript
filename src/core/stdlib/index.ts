/**
 * The numeric library: the calculations of `stdlib.md` sections 4 to 9.
 *
 * **It depends on nothing else in this repository.** Not the lexer, not the
 * checker, not the engine. A moving average is a moving average, and keeping
 * this tier independently testable is what makes a gate on it worth anything:
 * a number that matches a reference implementation here matches it because the
 * arithmetic is right, not because the rest of the compiler agreed with itself.
 *
 * Three properties hold across everything below, and each has a file that
 * explains it at the place it is implemented:
 *
 * - **Absence is not zero and never becomes zero** (`values/value.ts`). A
 *   warmup bar is absent, anything computed from an absent value is absent, and
 *   the three functions that deliberately ignore absent bars say so in their
 *   names.
 * - **The accumulation order is part of the contract** (`values/lookback.ts`).
 *   Binary64 addition is not associative, so two engines that sum a lookback two
 *   ways disagree in the last bits. Lookbacks are summed fresh, oldest bar first,
 *   and where a formula could be arranged two ways the file that implements it
 *   says which way and why.
 * - **Every function is written as a tail** (`values/tail.ts`): a small piece of
 *   state and a step that takes one bar. The whole-series form is that step
 *   folded over the series, so the live path and the history path cannot
 *   disagree, because there is only one of them.
 *
 * **What this library does not do: raise.** A length outside its contract is
 * OS3004 at compile time or OS4003 at run time, raised before a call reaches
 * here. Nothing below throws, so nothing below can throw a diagnostic without a
 * code.
 *
 * Two arguments appear here that no script writes, and both are host facts
 * rather than numeric ones: the tick size `roundToTick` rounds to, and the
 * per-bar flag that says where a trading session begins for `vwap`. An engine
 * supplies them.
 */

export type { Bar, Flag, Flags, Lookback, Series, Tail, Value } from './values/index.js';
export {
  NONE,
  at,
  fold,
  hl2,
  hlc3,
  hlcc4,
  isLength,
  isPresent,
  makeLookback,
  ohlc4,
  result,
} from './values/index.js';

export {
  E,
  PI,
  abs,
  acos,
  asin,
  atan,
  atan2,
  boolOf,
  ceil,
  clamp,
  cos,
  exp,
  floor,
  hypot,
  isNone,
  log,
  log2,
  log10,
  max,
  min,
  mod,
  orElse,
  pow,
  round,
  roundHalfAway,
  roundTo,
  roundToStep,
  roundToTick,
  sign,
  sin,
  sqrt,
  tan,
  toDegrees,
  toRadians,
  trunc,
} from './maths/index.js';

export type { MaType, Weighted } from './averages/index.js';
export {
  alma,
  almaTail,
  dema,
  demaTail,
  ema,
  emaTail,
  hma,
  hmaTail,
  linreg,
  linregTail,
  ma,
  maTail,
  rma,
  rmaTail,
  sma,
  smaTail,
  swma,
  swmaTail,
  tema,
  temaTail,
  vwma,
  vwmaTail,
  wma,
  wmaTail,
} from './averages/index.js';

export type { Occasion, Pair } from './series/index.js';
export {
  avgSkip,
  avgSkipTail,
  barsSince,
  barsSinceTail,
  change,
  changeTail,
  correlation,
  correlationTail,
  count,
  countPresent,
  countPresentTail,
  countTail,
  covariance,
  covarianceTail,
  cross,
  crossDown,
  crossDownTail,
  crossEitherTail,
  crossUp,
  crossUpTail,
  cum,
  cumTail,
  falling,
  fallingTail,
  highest,
  highestBars,
  highestBarsTail,
  highestTail,
  history,
  historyTail,
  lowest,
  lowestBars,
  lowestBarsTail,
  lowestTail,
  median,
  medianTail,
  percentRank,
  percentRankTail,
  percentile,
  percentileTail,
  pivotHigh,
  pivotHighTail,
  pivotLow,
  pivotLowTail,
  rising,
  risingTail,
  sum,
  sumSkip,
  sumSkipTail,
  sumTail,
  valueWhen,
  valueWhenTail,
} from './series/index.js';

export {
  atr,
  atrTail,
  bbPercent,
  bbPercentTail,
  bbWidth,
  bbWidthTail,
  bollinger,
  bollingerTail,
  chop,
  chopTail,
  donchian,
  donchianTail,
  gapTrueRange,
  gapTrueRangeTail,
  hv,
  hvTail,
  keltner,
  keltnerTail,
  meanDeviation,
  meanDeviationTail,
  natr,
  natrTail,
  stdev,
  stdevTail,
  trueRange,
  trueRangeTail,
  variance,
  varianceTail,
} from './volatility/index.js';

export {
  awesomeOsc,
  awesomeOscTail,
  cci,
  cciTail,
  cmo,
  cmoTail,
  dpo,
  dpoTail,
  macd,
  macdTail,
  mom,
  momTail,
  ppo,
  ppoTail,
  roc,
  rocTail,
  rsi,
  rsiTail,
  stoch,
  stochRsi,
  stochRsiTail,
  stochTail,
  trix,
  trixTail,
  tsi,
  tsiTail,
  ultimateOsc,
  ultimateOscTail,
  williamsR,
  williamsRTail,
} from './momentum/index.js';

export {
  adx,
  adxTail,
  aroon,
  aroonTail,
  ichimoku,
  ichimokuTail,
  psar,
  psarTail,
  supertrend,
  supertrendTail,
} from './trend/index.js';

export type { Anchored } from './volume/index.js';
export {
  ad,
  adOsc,
  adOscTail,
  adTail,
  cmf,
  cmfTail,
  eom,
  eomTail,
  forceIndex,
  forceIndexTail,
  mfi,
  mfiTail,
  moneyFlow,
  obv,
  obvTail,
  pvt,
  pvtTail,
  relativeVolume,
  relativeVolumeTail,
  vwap,
  vwapAnchor,
  vwapAnchorTail,
  vwapTail,
} from './volume/index.js';
