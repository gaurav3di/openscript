/**
 * The declaration's own half of a run, read once and read here.
 *
 * **What the program states is stored once, as the program**, so none of these
 * figures is a setting a host chooses and none of them travels in the record
 * beside the settings. They are read back out of the compiled program every
 * time a run is driven or replayed, which is what makes a replay of a stored
 * record the same run rather than a run under today's defaults.
 *
 * Every field of `meta.strategy` is written into the program with the value it
 * resolved to, defaults included (`compiled-program.md` 2.3), so nothing here
 * carries a table of defaults and a default that changes in a later language
 * version cannot silently change an old program. A field a script wrote with an
 * `input()` is resolved against the run's own settings, by the engine, at load,
 * and `fieldValue` reads what that resolution produced: the rule lives in the
 * engine and is applied here rather than repeated.
 *
 * A study has no strategy declaration at all. It places no order and has no
 * money, and it reads here as the absence it is rather than as a zero capital
 * somebody would divide by.
 */
import type { CompiledProgram } from '../emit/index.js';
import { fieldValue } from '../engine/index.js';
import type { ResolvedInput, Value } from '../engine/index.js';

/** The money and the fill the declaration fixed before bar 0. */
export interface RunDeclaration {
  /** False for a study, which declares none of this. */
  readonly isStrategy: boolean;
  readonly capital: number;
  readonly currency: string;
  /** Where a market order is priced, `language.md` 13.3. */
  readonly fillOn: string;
  readonly slippage: number;
  readonly commission: number;
  readonly commissionType: string;
  /**
   * The unit the declaration's quantity is stated in, `language.md` 13.3.
   *
   * Read here because the destination is the party that has to convert it, and
   * a destination that cannot convert the unit a strategy sizes in has to
   * refuse the run rather than fill a number in the wrong unit.
   */
  readonly qtyType: string;
}

/**
 * What one program's declaration says about money, after its inputs.
 *
 * The inputs are the ones the engine resolved at load, handed back by `load`
 * for this reader. A caller with none reads the literals, which is every
 * program that did not write a declaration field with an `input()`.
 */
export function declarationOf(
  program: CompiledProgram,
  inputs: readonly ResolvedInput[] = [],
): RunDeclaration {
  const strategy = program.meta.strategy;
  if (strategy === undefined) {
    return {
      isStrategy: false,
      capital: 0,
      currency: '',
      fillOn: '',
      slippage: 0,
      commission: 0,
      commissionType: '',
      qtyType: '',
    };
  }
  return {
    isStrategy: true,
    capital: numberOf(fieldValue(strategy.capital, inputs)),
    currency: stringOf(fieldValue(strategy.currency, inputs)),
    fillOn: stringOf(fieldValue(strategy.fillOn, inputs)),
    slippage: numberOf(fieldValue(strategy.slippage, inputs)),
    commission: numberOf(fieldValue(strategy.commission, inputs)),
    commissionType: stringOf(fieldValue(strategy.commissionType, inputs)),
    qtyType: stringOf(fieldValue(strategy.qtyType, inputs)),
  };
}

/**
 * A number the declaration states, or zero where it states something else.
 *
 * Zero rather than absence, and only here: every one of these fields is written
 * into the program with a number, so anything else is a program this engine
 * would already have refused at load. The fallback is what keeps this reader
 * total rather than a second place a malformed program is diagnosed.
 */
function numberOf(value: Value): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringOf(value: Value): string {
  return typeof value === 'string' ? value : '';
}
