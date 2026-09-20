/**
 * Loading a compiled program, which is everything that happens before bar 0.
 *
 * Separate from the bar cycle because it is a different job with a different
 * failure. A load either refuses, with a code and a reason, or hands back an
 * engine that has already been proved able to run: verification in full
 * (`compiled-program.md` 3.5), then the refusals a host makes, then the
 * settings. Nothing is executed until all three pass, so a program that cannot
 * run says so before a chart has drawn anything, rather than halfway through
 * bar four thousand with half a study on the screen.
 */
import type { Diagnostic } from '../diagnostics/index.js';
import type { SourceFile } from '../source/index.js';
import { BAR_FIELDS } from './bars.js';
import { limitsWith } from './budget.js';
import type { Clock, EngineLimits } from './budget.js';
import { Engine } from './engine.js';
import { malformed } from './errors.js';
import type { EngineHost } from './host.js';
import { resolveInputs, utcTime } from './inputs.js';
import type { TimeResolver } from './inputs.js';
import { planRequests } from './request-plan.js';
import { capabilitiesFor, verify } from './verify.js';

export interface LoadOptions {
  /** The host's settings, keyed by input `key`. */
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly limits?: Partial<EngineLimits>;
  /** The source, so a diagnostic's span can carry an offset as well as a line. */
  readonly source?: SourceFile;
  readonly host?: EngineHost;
  /** A reading of the wall clock, for the per bar time budget. */
  readonly clock?: Clock;
  /** How a `"time"` input's stored wall clock string becomes a timestamp. */
  readonly time?: TimeResolver;
}

export type LoadResult =
  | { readonly ok: true; readonly engine: Engine }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/**
 * Loads a compiled program.
 *
 * Verification runs first and in full (3.5), then the refusals a host makes,
 * then input resolution. Nothing is executed until all three pass, so a program
 * that cannot run says so before a chart has drawn anything.
 */
export function load(program: unknown, options: LoadOptions = {}): LoadResult {
  const limits = limitsWith(options.limits);
  const host = options.host ?? {};
  const checked = verify(program, {
    capabilities: capabilitiesFor(host.route !== undefined, host.requestBars !== undefined),
    limits,
  });
  if (!checked.ok) return { ok: false, diagnostic: checked.diagnostic };

  const unknownField = checked.program.series.find(
    (one) => one.kind === 'bar' && (one.field === null || !BAR_FIELDS.includes(one.field)),
  );
  if (unknownField !== undefined) {
    return {
      ok: false,
      diagnostic: malformed(
        `series[${unknownField.id}].field`,
        `${String(unknownField.field)} is not a bar field this engine can fill`,
      ),
    };
  }

  const resolved = resolveInputs(
    checked.program,
    options.settings ?? {},
    options.time ?? utcTime,
  );
  if (!resolved.ok) return { ok: false, diagnostic: resolved.diagnostic };

  // 2.16: a request's identity is fixed before bar 0, so it is settled here,
  // along with the two refusals that are facts about the program and the chart
  // rather than answers from the host: a timeframe the language does not know,
  // and one that cannot be folded onto this chart's bars.
  const planned = planRequests(checked.program.requests, resolved.inputs, host);
  if (!planned.ok) return { ok: false, diagnostic: planned.diagnostic };

  return {
    ok: true,
    engine: new Engine(checked.program, resolved.inputs, options, limits, planned.plans),
  };
}
