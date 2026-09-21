/**
 * The instruction engine: a compiled program and bars in, values out.
 *
 * It walks an instruction list. There is no `eval`, no `Function` constructor
 * and nothing built from text anywhere behind this door, which is what lets the
 * language run under a content security policy that forbids turning text into
 * code and what lets a platform run many customers' scripts in one process.
 *
 * Three guarantees a host is buying, each enforced by a counter in the loop
 * rather than by hoping a script behaves:
 *
 * - **A runaway script stops.** The loop budget is the program's own
 *   `limits()` and is counted in `TICK` executions, so two engines fail at the
 *   same iteration of the same loop on the same bar. A step ceiling derived
 *   from the program and an optional wall clock stop a bar that somehow passes
 *   what verification proved about it.
 * - **One script failing takes nothing else down.** Nothing on this surface
 *   throws. A failure is a diagnostic with a catalogue code and a source
 *   position, returned on the bar that produced it.
 * - **A moving bar is idempotent.** The newest bar rolls back to the start of
 *   itself before it runs again, so a live chart and a backtest of the same
 *   data produce the same numbers.
 */
export { Engine } from './engine.js';
export type { BarResult, RunResult } from './results.js';

export { load } from './load.js';
export type { LoadOptions, LoadResult } from './load.js';

export type { AlertFiring } from './alerts.js';

export type { Grid } from './grids.js';

export type { BarFacts, BarState, HostBar } from './bars.js';
export { BAR_FIELDS, barField, isBarField } from './bars.js';

export type { Clock, EngineLimits } from './budget.js';
export { DEFAULT_LIMITS, stepBound } from './budget.js';

export type { Anchor, Drawing, DrawingKind } from './drawings.js';

export type { PendingEffect } from './channels.js';

export type {
  EffectRoute,
  EngineHost,
  Instrument,
  RequestAnswer,
  RequestProvider,
  RequestQuery,
  RequestRefusal,
  RoutedEffect,
} from './host.js';

export type {
  FrameOutcome,
  FrameRefusal,
  Identity,
  IntentBar,
  IntentKind,
  LedgerRow,
  OrderFrame,
  OrderIntent,
  OrderSide,
  OrderStatus,
  OrderType,
} from './ledger/index.js';

export type { SessionFacts, SessionHours } from './session/index.js';

export type { Timeframe, TimeframeUnit } from './timeframe.js';
export { bucketKeyOf, isIntraday, minutesOf, nominalMinutes, parseTimeframe } from './timeframe.js';

export type { ResolvedInput, SettingCheck, TimeResolver } from './inputs.js';
export { checkSetting, constantValue, fieldValue, utcTime } from './inputs.js';

export { LANGUAGE_VERSIONS, capabilitiesFor, verify } from './verify.js';
export type { VerifyOptions, VerifyResult } from './verify.js';

export type {
  ArrayObject,
  ColourValue,
  DrawingObject,
  GridCell,
  HeapObject,
  Reference,
  TableObject,
  Value,
} from './values/index.js';
export { isAbsent, isColour, isRef, tagOf, valuesEqual } from './values/index.js';

export type { BarView, CallContext, Effect, ManifestEntry, StateRecord } from './library/index.js';
export { COLOUR_NAMES, manifestEntries, manifestEntry, namedColour, spell } from './library/index.js';
