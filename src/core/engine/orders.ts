/**
 * The order path at step 9: what the run's ledger is built from, and what an
 * applied order call becomes.
 *
 * Two things live here rather than in the bar cycle, because neither is about
 * the cycle. **A ledger is built from the declaration**, whose `product`,
 * `qtyType` and `qty` are fixed before bar 0 like every other declaration
 * field, and **an order call becomes intents** at the one step that is allowed
 * to reach the outside world.
 *
 * The ledger module knows nothing about a compiled program, which is what keeps
 * the fold of a frame free of the shape of the file it came from, so the
 * reading of the declaration is here, on the engine's side of that door.
 */
import type { PendingEffect } from './channels.js';
import type { RoutedEffect } from './host.js';
import type { Instrument } from './host.js';
import { fieldValue } from './inputs.js';
import type { ResolvedInput } from './inputs.js';
import { Ledger } from './ledger/index.js';
import type { IntentBar } from './ledger/index.js';
import type { CompiledProgram, Field } from './types.js';

/**
 * One field of the `strategy()` declaration, resolved the way every other
 * declaration field is: once, at load, against the inputs.
 *
 * The fallback is the documented default rather than a guess. A study has no
 * strategy declaration at all and never places an order, so the values it takes
 * here are never read.
 */
function declared(field: Field | undefined, inputs: readonly ResolvedInput[]): unknown {
  return field === undefined ? null : fieldValue(field, inputs);
}

export function ledgerFor(
  program: CompiledProgram,
  inputs: readonly ResolvedInput[],
  instrument: Instrument | undefined,
): Ledger {
  const strategy = program.meta.strategy;
  const product = declared(strategy?.product, inputs);
  const qtyType = declared(strategy?.qtyType, inputs);
  const qty = declared(strategy?.qty, inputs);
  return new Ledger({
    // The file's only leg is the instrument its chart is showing (`stdlib.md`
    // 17.1), and its identity is the host's own, carried and never parsed. The
    // leg declarations that name any other contract are planned.
    instrument: { symbol: instrument?.symbol ?? null, exchange: instrument?.exchange ?? null },
    product: typeof product === 'string' ? product : 'intraday',
    qtyType: typeof qtyType === 'string' ? qtyType : 'units',
    declaredQty: typeof qty === 'number' ? qty : 1,
  });
}

/**
 * The effects a bar applied, each carrying what it sent.
 *
 * An order call becomes intents here and nowhere else, because the ledger is
 * what mints the id every frame about the order carries back, and a call an
 * execution threw away never reached this step at all.
 */
export function routedEffects(
  ledger: Ledger,
  applied: readonly PendingEffect[],
  at: IntentBar,
): readonly RoutedEffect[] {
  return applied.map((effect) => ({
    ...effect,
    intents: effect.effect === 'order' ? ledger.place(effect.name, effect.args, at) : [],
  }));
}
