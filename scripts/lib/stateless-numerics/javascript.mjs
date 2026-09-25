/** Scalar calls receive independent state and the current chronological index. */
import { decode, encode, fromBits } from '../stateful-numerics/index.mjs';

export function selectNumericalEntries(entries, keys) {
  const selected = entries.filter((entry) => keys.includes(`${entry.name}/${entry.arity}`));
  const actual = selected.map((entry) => `${entry.name}/${entry.arity}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort()) || selected.some((entry) => entry.state !== false || entry.effect !== 'none')) {
    throw new Error('denominator: every declared numerical entry must exist once with state=false and effect=none');
  }
  return selected;
}

export function driveStateless(item, built) {
  const binding = built.manifestEntry(item.name, item.arity);
  const rows = [];
  let exception = null;
  for (let index = 0; index < item.bars; index++) {
    try {
      const bar = new Proxy({}, { get: (_object, key) => key === 'index' ? index
        : item.bar?.[key] ? decode(item.bar[key], index) : null });
      const host = new Proxy({}, { get: (_object, key) => () => item.host?.[key] == null ? null : fromBits(item.host[key]) });
      const guard = new Proxy({}, { get: (_object, key) => () => { throw new Error(`Unexpected scalar input guard: ${String(key)}`); } });
      const context = { heap: new built.Heap(), state: {}, span: {}, bar, host, position: {}, guard, nameOf: () => 'audit' };
      const value = binding.call(context, item.args.map((argument) => decode(argument, index)));
      rows.push([encode(value)]);
    } catch (error) {
      exception = { bar: index, type: error.name, message: error.message, traceback: error.stack };
      break;
    }
  }
  return { id: item.id, key: item.key, rows, exception };
}
