/**
 * Functions whose bits are the host's rather than this engine's.
 *
 * **A vector is a bit pattern a second engine is written to match**, so a
 * function whose last bit depends on the machine underneath cannot have one:
 * publishing it hands the second engine a test it cannot pass and this engine
 * cannot keep.
 *
 * `compiled-program.md` 8.3 requires that the transcendental functions not use
 * the platform's maths library, and `src/core/stdlib/maths/elementary.ts`
 * records that they call it anyway until the portable algorithm 8.3 names
 * exists. Its transcendental calls are therefore provisional in the last bit.
 * `sqrt` is correctly rounded under IEEE-754, and `hypot` uses the exact integer
 * algorithm of `stdlib.md` 20.10.1.
 *
 * **This list holds what has actually been measured to differ, not everything
 * that might.** `pow` returns different bits on two runtimes of the same
 * virtual machine, found when a release built on one was verified on the other.
 * The rest of that file agreed across the same pair, so they keep their vectors
 * and their exposure is written down here rather than acted on: this is where
 * the next one goes when it is measured, and the whole group leaves when the
 * portable implementation lands.
 */
export const HOST_ARITHMETIC = new Set(['pow/2']);

export const HOST_ARITHMETIC_WHY =
  'the last bit comes from the host maths library rather than from this engine: compiled-program.md 8.3 ' +
  'requires a portable algorithm, src/core/stdlib/maths/elementary.ts records that there is none yet, and ' +
  'this one was measured returning different bits on two runtimes of the same virtual machine';


/**
 * The entries with the host's own arithmetic taken out, recorded as not reached.
 *
 * `refuse` is passed in rather than imported so this module knows nothing about
 * how the script it serves reports a problem.
 */
export function withoutHostArithmetic(reached, notReached, refuse) {
  const held = reached.filter((one) => HOST_ARITHMETIC.has(`${one.name}/${one.arity}`));
  if (held.length !== HOST_ARITHMETIC.size) {
    refuse(
      `HOST_ARITHMETIC names ${[...HOST_ARITHMETIC].join(', ')}, and the manifest reached ` +
        `${held.map((one) => `${one.name}/${one.arity}`).join(', ') || 'none of them'}. A name that ` +
        'reaches nothing is a hole left open after the function it was about was renamed or removed.',
    );
  }
  if (held.length === 0) return reached;
  notReached.push({ why: HOST_ARITHMETIC_WHY, functions: held.map((one) => `${one.name}/${one.arity}`) });
  return reached.filter((one) => !HOST_ARITHMETIC.has(`${one.name}/${one.arity}`));
}
