/**
 * Check 1 of `compiled-program.md` 3.5 over the program's own tables, and check
 * 10's key half.
 *
 * `verify-shape.ts` answers "is this field a number"; this walks the whole
 * program asking it, table by table, and checks every index into a table is in
 * range: constant pool, slots, cells, states, registers, channels, library
 * functions, call sites, loops and functions. Separate from `verify.ts` because
 * it is one long traversal with no decisions in it, and because the decisions
 * there, which version, which capability, which budget, are what a reader comes
 * looking for.
 */
import type { ShapeCheck } from './verify-shape.js';
import { checkConstant, checkField } from './verify-shape.js';

const META_KINDS = ['study', 'strategy'] as const;
const CHANNEL_TYPES = ['number', 'string', 'color', 'bool'] as const;
const CELL_KINDS = ['var', 'live'] as const;
const REGISTER_KINDS = ['bar', 'computed', 'argument'] as const;
const LOOP_KINDS = ['for', 'forIn', 'while'] as const;
const EFFECTS = ['none', 'signal', 'order', 'draw', 'log'] as const;

/** Check 1 over every table the machine indexes, and every declaration field. */
export function checkTables(shape: ShapeCheck, raw: Readonly<Record<string, unknown>>): boolean {
  for (const name of ['requires', 'inputs', 'channels', 'consts', 'series', 'cells', 'states',
    'functions', 'callSites', 'loops', 'code']) {
    if (!shape.array(raw[name], name)) return false;
  }
  for (const name of ['compiler', 'source', 'meta', 'limits', 'lib', 'outputs', 'frame', 'debug']) {
    if (!shape.object(raw[name], name)) return false;
  }

  const limits = raw['limits'] as Readonly<Record<string, unknown>>;
  if (!shape.whole(limits['loops'], 'limits.loops')) return false;
  if (limits['history'] !== null && !shape.whole(limits['history'], 'limits.history')) return false;

  const frame = raw['frame'] as Readonly<Record<string, unknown>>;
  if (!shape.whole(frame['slots'], 'frame.slots')) return false;

  const lib = raw['lib'] as Readonly<Record<string, unknown>>;
  if (!shape.whole(lib['manifest'], 'lib.manifest')) return false;
  if (!shape.array(lib['functions'], 'lib.functions')) return false;
  for (let i = 0; i < lib['functions'].length; i += 1) {
    const entry = lib['functions'][i];
    const path = `lib.functions[${i}]`;
    if (!shape.object(entry, path)) return false;
    if (!shape.string(entry['name'], `${path}.name`)) return false;
    if (!shape.whole(entry['arity'], `${path}.arity`)) return false;
    if (!shape.bool(entry['state'], `${path}.state`)) return false;
    if (!shape.one(entry['effect'], `${path}.effect`, EFFECTS)) return false;
  }

  const consts = raw['consts'] as readonly unknown[];
  for (let i = 0; i < consts.length; i += 1) {
    if (!checkConstant(shape, consts[i], `consts[${i}]`)) return false;
  }

  const keys = new Set<string>();
  const inputs = raw['inputs'] as readonly unknown[];
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    const path = `inputs[${i}]`;
    if (!shape.object(input, path)) return false;
    if (!shape.string(input['key'], `${path}.key`)) return false;
    if (!shape.string(input['kind'], `${path}.kind`)) return false;
    if (!shape.index(input['slot'], `${path}.slot`, Number(frame['slots']), 'the frame')) {
      return false;
    }
    if (!checkConstant(shape, input['default'], `${path}.default`)) return false;
    keys.add(input['key']);
  }

  const channels = raw['channels'] as readonly unknown[];
  for (let i = 0; i < channels.length; i += 1) {
    const channel = channels[i];
    const path = `channels[${i}]`;
    if (!shape.object(channel, path)) return false;
    if (channel['id'] !== i) return shape.fail(`${path}.id`, 'a channel id is its position');
    if (!shape.one(channel['type'], `${path}.type`, CHANNEL_TYPES)) return false;
    if (!shape.bool(channel['defer'], `${path}.defer`)) return false;
    if (!shape.bool(channel['once'], `${path}.once`)) return false;
  }

  const series = raw['series'] as readonly unknown[];
  for (let i = 0; i < series.length; i += 1) {
    const register = series[i];
    const path = `series[${i}]`;
    if (!shape.object(register, path)) return false;
    if (register['id'] !== i) return shape.fail(`${path}.id`, 'a register id is its position');
    if (!shape.one(register['kind'], `${path}.kind`, REGISTER_KINDS)) return false;
    if (register['kind'] === 'bar' && !shape.string(register['field'], `${path}.field`)) {
      return false;
    }
  }

  const cells = raw['cells'] as readonly unknown[];
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const path = `cells[${i}]`;
    if (!shape.object(cell, path)) return false;
    if (!shape.one(cell['kind'], `${path}.kind`, CELL_KINDS)) return false;
  }

  const states = raw['states'] as readonly unknown[];
  for (let i = 0; i < states.length; i += 1) {
    const state = states[i];
    const path = `states[${i}]`;
    if (!shape.object(state, path)) return false;
    if (!shape.index(state['fn'], `${path}.fn`, lib['functions'].length, 'lib.functions')) {
      return false;
    }
  }

  const functions = raw['functions'] as readonly unknown[];
  for (let i = 0; i < functions.length; i += 1) {
    const one = functions[i];
    const path = `functions[${i}]`;
    if (!shape.object(one, path)) return false;
    if (!shape.string(one['name'], `${path}.name`)) return false;
    if (!shape.whole(one['params'], `${path}.params`)) return false;
    if (!shape.whole(one['slots'], `${path}.slots`)) return false;
    if (!shape.array(one['code'], `${path}.code`)) return false;
    if (Number(one['params']) > Number(one['slots'])) {
      return shape.fail(`${path}.slots`, 'a frame cannot be smaller than its parameter list');
    }
  }

  const sites = raw['callSites'] as readonly unknown[];
  for (let i = 0; i < sites.length; i += 1) {
    const site = sites[i];
    const path = `callSites[${i}]`;
    if (!shape.object(site, path)) return false;
    if (!shape.index(site['fn'], `${path}.fn`, functions.length, 'functions')) return false;
    if (!shape.whole(site['argc'], `${path}.argc`)) return false;
    if (!shape.whole(site['cellBase'], `${path}.cellBase`)) return false;
    if (!shape.whole(site['stateBase'], `${path}.stateBase`)) return false;
    if (!shape.array(site['series'], `${path}.series`)) return false;
    const target = functions[Number(site['fn'])] as Readonly<Record<string, unknown>>;
    if (site['argc'] !== target['params']) {
      return shape.fail(`${path}.argc`, 'a site passes exactly the function\'s parameter count');
    }
    for (let k = 0; k < site['series'].length; k += 1) {
      const bound = site['series'][k];
      if (bound === -1) continue;
      if (!shape.index(bound, `${path}.series[${k}]`, series.length, 'series')) return false;
    }
  }

  const loops = raw['loops'] as readonly unknown[];
  for (let i = 0; i < loops.length; i += 1) {
    const loop = loops[i];
    const path = `loops[${i}]`;
    if (!shape.object(loop, path)) return false;
    if (!shape.one(loop['kind'], `${path}.kind`, LOOP_KINDS)) return false;
    if (!shape.whole(loop['line'], `${path}.line`)) return false;
    if (!shape.whole(loop['col'], `${path}.col`)) return false;
  }

  const meta = raw['meta'] as Readonly<Record<string, unknown>>;
  if (!shape.one(meta['kind'], 'meta.kind', META_KINDS)) return false;
  for (const field of ['title', 'short', 'overlay', 'precision', 'format', 'range', 'scale',
    'group', 'onUnconfirmed']) {
    if (!checkField(shape, meta[field], `meta.${field}`, keys)) return false;
  }

  const debug = raw['debug'] as Readonly<Record<string, unknown>>;
  if (!shape.array(debug['pos'], 'debug.pos')) return false;
  if (!shape.array(debug['fnPos'], 'debug.fnPos')) return false;

  return checkOutputs(shape, raw['outputs'] as Readonly<Record<string, unknown>>,
    channels.length, Number(frame['slots']), keys);
}

/** Every declaration in `outputs`, and every channel it points at. */
function checkOutputs(
  shape: ShapeCheck,
  outputs: Readonly<Record<string, unknown>>,
  channels: number,
  slots: number,
  keys: ReadonlySet<string>,
): boolean {
  for (const group of ['plots', 'fills', 'levels', 'markers', 'tables', 'alerts']) {
    if (!shape.array(outputs[group], `outputs.${group}`)) return false;
  }

  const channelField = (holder: unknown, path: string, field: string): boolean => {
    const value = (holder as Readonly<Record<string, unknown>>)[field];
    return shape.index(value, `${path}.${field}`, channels, 'channels');
  };

  const declarations: readonly (readonly [string, readonly string[], readonly string[]])[] = [
    ['plots', ['channel'], ['title', 'color', 'width', 'lineStyle', 'offset', 'overlay', 'scale']],
    ['levels', ['channel'], ['title', 'color', 'lineStyle', 'lineWidth']],
    ['markers', ['channel'], ['position', 'shape', 'color', 'textColor']],
    ['alerts', ['condChannel'], ['title', 'frequency']],
  ];
  for (const [group, channelFields, valueFields] of declarations) {
    const list = outputs[group] as readonly unknown[];
    for (let i = 0; i < list.length; i += 1) {
      const path = `outputs.${group}[${i}]`;
      if (!shape.object(list[i], path)) return false;
      for (const field of channelFields) if (!channelField(list[i], path, field)) return false;
      for (const field of valueFields) {
        const value = (list[i] as Readonly<Record<string, unknown>>)[field];
        if (!checkField(shape, value, `${path}.${field}`, keys)) return false;
      }
    }
  }

  const tables = outputs['tables'] as readonly unknown[];
  for (let i = 0; i < tables.length; i += 1) {
    const path = `outputs.tables[${i}]`;
    if (!shape.object(tables[i], path)) return false;
    const grid = tables[i] as Readonly<Record<string, unknown>>;
    if (!shape.index(grid['slot'], `${path}.slot`, slots, 'the frame')) return false;
    for (const field of ['title', 'position', 'rows', 'cols']) {
      if (!checkField(shape, grid[field], `${path}.${field}`, keys)) return false;
    }
  }

  for (const paint of ['barColor', 'background']) {
    const value = outputs[paint];
    if (value === null) continue;
    if (!shape.object(value, `outputs.${paint}`)) return false;
    if (!channelField(value, `outputs.${paint}`, 'channel')) return false;
  }

  return true;
}
