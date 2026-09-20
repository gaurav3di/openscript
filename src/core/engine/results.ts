/**
 * What a host reads back from a bar and from a run.
 *
 * Declared apart from the loop that fills it, because these are the shapes an
 * adapter, a test and a second engine's harness all read, and a shape somebody
 * outside this repository depends on is worth being able to read on its own.
 *
 * Four of the six fields are about one bar's execution and two are about what
 * that execution sent and was told: the effects it applied, each carrying the
 * intents it became, and what the frames that arrived before it did to the
 * ledger. A run that places no orders carries both empty for every bar.
 */
import type { Diagnostic } from '../diagnostics/index.js';
import type { AlertFiring } from './alerts.js';
import type { RoutedEffect } from './host.js';
import type { FrameOutcome } from './ledger/index.js';
import type { Value } from './values/index.js';

/** What one execution of one bar produced. */
export interface BarResult {
  readonly index: number;
  /** One value per channel, absent where nothing wrote, in channel order. */
  readonly columns: readonly Value[];
  /** Whether step 9 applied the deferred channels and the pending effects. */
  readonly applied: boolean;
  readonly effects: readonly RoutedEffect[];
  /**
   * What the frames delivered since the previous bar did to the ledger, a
   * refused one included (`stdlib.md` 17.14).
   */
  readonly frames: readonly FrameOutcome[];
  /** The watched conditions this bar raised, empty on a bar that raised none. */
  readonly alerts: readonly AlertFiring[];
  /** The failure that stopped the bar, when one did. */
  readonly diagnostic: Diagnostic | undefined;
}

export interface RunResult {
  readonly bars: readonly BarResult[];
  readonly diagnostic: Diagnostic | undefined;
}
