/** Exercise the built manifest with fresh call-site state for every case. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, fromBits } from './protocol.mjs';

export async function loadEngine(root) {
  if (resolve(root) !== resolve(fileURLToPath(new URL('../../../', import.meta.url)))) {
    throw new Error('engine: audit root must contain this gate and its built runtime');
  }
  const library = await import('../../../dist/core/engine/library/index.js');
  const values = await import('../../../dist/core/engine/values/index.js');
  const stdlib = await import('../../../dist/core/stdlib/index.js');
  const checker = await import('../../../dist/core/check/index.js');
  return { ...library, Heap: values.Heap, isRef: values.isRef, newState: stdlib.newState, libraryEntries: checker.libraryEntries };
}

export function drive(c, built) {
  const entry = built.manifestEntry(c.name, c.arity);
  const state = built.newState(), heap = new built.Heap(), rows = [];
  const guard = new Proxy({}, { get: (_target, method) => () => { throw new Error(`Unexpected input guard: ${String(method)}`); } });
  const host = new Proxy({}, { get: (_target, fact) => () => c.host?.[fact] == null ? null : fromBits(c.host[fact]) });
  const position = new Proxy({}, { get: () => () => null });
  let exception = null;
  for (let at = 0; at < c.bars; at++) {
    try {
      const bar = new Proxy({}, { get: (_target, key) => key === 'index' ? at : c.bar?.[key] ? decode(c.bar[key], at) : null });
      const result = entry.call({ state, heap, bar, host, position, guard, span: {}, nameOf: () => 'audit' }, c.args.map((column) => decode(column, at)));
      const values = built.isRef(result) ? heap.get(result.id).items : [result];
      rows.push(values.map(encode));
    } catch (error) {
      exception = { bar: at, type: error.name, message: error.message, traceback: error.stack };
      break;
    }
  }
  return { id: c.id, key: c.key, rows, exception };
}
