/** Drive changing inputs through the actual built registry and copied state. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, fromBits } from '../stateful-numerics/index.mjs';
import { executeCase } from './execution.mjs';

export async function loadEngine(root) {
  if (resolve(root) !== resolve(fileURLToPath(new URL('../../../', import.meta.url)))) {
    throw new Error('engine: audit root must contain this gate and its built runtime');
  }
  const registry = await import('../../../dist/core/engine/library/index.js');
  const values = await import('../../../dist/core/engine/values/index.js');
  const state = await import('../../../dist/core/stdlib/index.js');
  const checker = await import('../../../dist/core/check/index.js');
  return { ...registry, Heap: values.Heap, isRef: values.isRef, newState: state.newState, copyState: state.copyState,
    libraryEntries: checker.libraryEntries };
}

export function drive(c, built) {
  const entry = built.manifestEntry(c.name, c.arity);
  const guard = new Proxy({}, { get: (_object, name) => () => { throw new Error(`Unexpected input guard: ${String(name)}`); } });
  const host = new Proxy({}, { get: (_object, name) => () => c.host?.[name] == null ? null : fromBits(c.host[name]) });
  const position = new Proxy({}, { get: () => () => null });
  return executeCase(c, {
    newState: built.newState, copyState: built.copyState,
    invoke: (state, at, input) => {
      const heap = new built.Heap();
      const bar = new Proxy({}, { get: (_object, name) => name === 'index' ? c.barIndices?.[at] ?? at
        : c.bar?.[name] ? decode(c.bar[name], input) : null });
      const result = entry.call({ state, heap, bar, host, position, guard, span: {}, nameOf: () => 'audit' },
        c.args.map(column => decode(column, input)));
      return (built.isRef(result) ? heap.get(result.id).items : [result]).map(encode);
    },
  });
}
