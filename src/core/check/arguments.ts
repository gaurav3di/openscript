/**
 * Matching what was written at a call site against what the callee takes.
 *
 * This is the half of call checking that knows nothing about types: which
 * argument fills which parameter, and what is missing, doubled or unknown.
 * `language.md` 11.2 is the whole rule, and it is the same rule for a library
 * call and for a user function, which is why this takes a parameter list rather
 * than either kind of callee.
 *
 * Six codes live here, and each of them names the call, so the reader is told
 * which of the three calls on the line the caret is about.
 */
import type { Argument, Call } from '../ast/index.js';
import type { Checker } from './checker.js';
import { closestName } from './suggest.js';

/** What a parameter list looks like to this file, whatever declared it. */
export interface ParameterShape {
  readonly name: string;
  readonly optional: boolean;
}

/**
 * The parameters in declaration order, holding the argument that filled each.
 *
 * A hole is a parameter the call left to its default. The generator reads this
 * rather than the written order, so it never matches a label a second time.
 */
export type Binding = readonly (Argument | undefined)[];

/** `ema(src, len)`, with a `?` on the parameters that carry a default. */
export function signatureText(name: string, parameters: readonly ParameterShape[]): string {
  const written = parameters.map((one) => (one.optional ? `${one.name}?` : one.name));
  return `${name}(${written.join(', ')})`;
}

/** `2`, or `2 to 5` where some parameters have defaults. */
export function arityText(parameters: readonly ParameterShape[]): string {
  const required = parameters.filter((one) => !one.optional).length;
  return required === parameters.length ? `${required}` : `${required} to ${parameters.length}`;
}

/** A call with the required parameters written in, for OS3012's example slot. */
function exampleCall(name: string, parameters: readonly ParameterShape[]): string {
  const required = parameters.filter((one) => !one.optional).map((one) => one.name);
  return `${name}(${required.join(', ')})`;
}

/**
 * Fills the parameter list from the arguments as written.
 *
 * Positional arguments fill from the left and named ones fill by label, which
 * is the order `language.md` 11.2 allows. A positional argument after a named
 * one is OS3005 and is reported once rather than once per argument: the mistake
 * is the boundary, not each argument past it.
 */
export function bindArguments(
  checker: Checker,
  call: Call,
  name: string,
  parameters: readonly ParameterShape[],
): Binding {
  const filled: (Argument | undefined)[] = parameters.map(() => undefined);
  const names = parameters.map((one) => one.name);
  let next = 0;
  let seenNamed = false;
  let extra = 0;
  let reportedOrder = false;

  for (const argument of call.args) {
    if (argument.label === undefined) {
      if (seenNamed && !reportedOrder) {
        checker.report('OS3005', argument.span, {});
        reportedOrder = true;
      }
      if (next >= parameters.length) {
        extra += 1;
        continue;
      }
      filled[next] = argument;
      next += 1;
      continue;
    }

    seenNamed = true;
    const label = argument.label.text;
    const index = names.indexOf(label);
    if (index < 0) {
      checker.report('OS3002', argument.label.span, {
        name,
        argument: label,
        names: names.join(', '),
        suggestion: closestName(label, names),
      });
      continue;
    }
    if (filled[index] !== undefined) {
      checker.report('OS3013', argument.span, { argument: label });
      continue;
    }
    filled[index] = argument;
  }

  if (extra > 0) {
    checker.report('OS3001', call.span, {
      name,
      expected: arityText(parameters),
      found: call.args.length,
      signature: signatureText(name, parameters),
    });
  }

  for (let i = 0; i < parameters.length; i += 1) {
    const parameter = parameters[i];
    if (parameter === undefined || parameter.optional || filled[i] !== undefined) continue;
    checker.report('OS3012', call.span, {
      name,
      argument: parameter.name,
      example: exampleCall(name, parameters),
    });
  }

  return filled;
}
