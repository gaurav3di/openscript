/**
 * Check 1 of `compiled-program.md` 3.5 over `requests` and the bodies inside
 * it.
 *
 * A read's body holds the tables a program holds for the machine of section 3,
 * counted from zero, so it needs the same walk the program's own tables get and
 * for the same reason: every later step indexes into them, and an index out of
 * range that is not caught here is read past the end of an array during a bar.
 *
 * **A body that was not walked is the hole the whole verification exists to
 * close.** It is reached by the same interpreter, with the same instruction
 * list, over another instrument's history. Verifying the program and not the
 * expression it carries would leave exactly the failure 3.5 is written to
 * prevent, one level down where nobody would look for it.
 */
import type { ShapeCheck } from './verify-shape.js';

const READS = ['timeframe', 'symbol'] as const;
const MODES = ['confirmed', 'developing', 'lookahead'] as const;
const CHART_FACTS = ['symbol', 'exchange', 'interval'] as const;

/** The tables a machine indexes, wherever they sit in the program. */
export interface MachineTables {
  readonly series: readonly unknown[];
  readonly cells: readonly unknown[];
  readonly states: readonly unknown[];
  readonly functions: readonly unknown[];
  readonly callSites: readonly unknown[];
  readonly loops: readonly unknown[];
  readonly slots: number;
  readonly libFunctions: number;
}

// The five the format declares (compiled-program.md section 2, series[].kind).
// A verifier that listed only the kinds an engine happens to execute would
// refuse a well-formed program with a message blaming the compiler that wrote
// it, and would pre-empt the capability refusal that exists to say which
// feature is missing. Verification answers "is this a valid program", and the
// capability check answers "can I run it".
const REGISTER_KINDS = ['bar', 'computed', 'argument', 'request', 'input'] as const;
const CELL_KINDS = ['var', 'live'] as const;
const LOOP_KINDS = ['for', 'forIn', 'while'] as const;

/**
 * Every table one machine indexes, and every index into one of them.
 *
 * Shared by the program and by every request body rather than written twice,
 * because two copies of this walk would be two places for a table to gain a
 * field and only one of them to learn about it.
 */
export function checkMachineTables(
  shape: ShapeCheck,
  prefix: string,
  tables: MachineTables,
): boolean {
  for (let i = 0; i < tables.series.length; i += 1) {
    const register = tables.series[i];
    const path = `${prefix}series[${i}]`;
    if (!shape.object(register, path)) return false;
    if (register['id'] !== i) return shape.fail(`${path}.id`, 'a register id is its position');
    if (!shape.one(register['kind'], `${path}.kind`, REGISTER_KINDS)) return false;
    if (register['kind'] === 'bar' && !shape.string(register['field'], `${path}.field`)) {
      return false;
    }
  }

  for (let i = 0; i < tables.cells.length; i += 1) {
    const cell = tables.cells[i];
    const path = `${prefix}cells[${i}]`;
    if (!shape.object(cell, path)) return false;
    if (!shape.one(cell['kind'], `${path}.kind`, CELL_KINDS)) return false;
  }

  for (let i = 0; i < tables.states.length; i += 1) {
    const state = tables.states[i];
    const path = `${prefix}states[${i}]`;
    if (!shape.object(state, path)) return false;
    if (!shape.index(state['fn'], `${path}.fn`, tables.libFunctions, 'lib.functions')) return false;
  }

  for (let i = 0; i < tables.functions.length; i += 1) {
    const one = tables.functions[i];
    const path = `${prefix}functions[${i}]`;
    if (!shape.object(one, path)) return false;
    if (!shape.string(one['name'], `${path}.name`)) return false;
    if (!shape.whole(one['params'], `${path}.params`)) return false;
    if (!shape.whole(one['slots'], `${path}.slots`)) return false;
    if (!shape.array(one['code'], `${path}.code`)) return false;
    if (Number(one['params']) > Number(one['slots'])) {
      return shape.fail(`${path}.slots`, 'a frame cannot be smaller than its parameter list');
    }
  }

  for (let i = 0; i < tables.callSites.length; i += 1) {
    const site = tables.callSites[i];
    const path = `${prefix}callSites[${i}]`;
    if (!shape.object(site, path)) return false;
    if (!shape.index(site['fn'], `${path}.fn`, tables.functions.length, 'functions')) return false;
    if (!shape.whole(site['argc'], `${path}.argc`)) return false;
    if (!shape.whole(site['cellBase'], `${path}.cellBase`)) return false;
    if (!shape.whole(site['stateBase'], `${path}.stateBase`)) return false;
    if (!shape.array(site['series'], `${path}.series`)) return false;
    const target = tables.functions[Number(site['fn'])] as Readonly<Record<string, unknown>>;
    if (site['argc'] !== target['params']) {
      return shape.fail(`${path}.argc`, "a site passes exactly the function's parameter count");
    }
    for (let k = 0; k < site['series'].length; k += 1) {
      const bound = site['series'][k];
      if (bound === -1) continue;
      if (!shape.index(bound, `${path}.series[${k}]`, tables.series.length, 'series')) return false;
    }
  }

  for (let i = 0; i < tables.loops.length; i += 1) {
    const loop = tables.loops[i];
    const path = `${prefix}loops[${i}]`;
    if (!shape.object(loop, path)) return false;
    if (!shape.one(loop['kind'], `${path}.kind`, LOOP_KINDS)) return false;
    if (!shape.whole(loop['line'], `${path}.line`)) return false;
    if (!shape.whole(loop['col'], `${path}.col`)) return false;
  }

  return true;
}

/**
 * `requests` and every body inside it, 2.16.
 *
 * `series` is the register of the **enclosing** machine that the read's value
 * lands in, so it is checked against the table the caller passes; everything
 * inside `body` is the body's own and is checked against the body's.
 */
export function checkRequests(
  shape: ShapeCheck,
  prefix: string,
  requests: readonly unknown[],
  registers: number,
  libFunctions: number,
  keys: ReadonlySet<string>,
): boolean {
  const seen = new Set<number>();
  return walk(shape, prefix, requests, registers, libFunctions, keys, seen);
}

function walk(
  shape: ShapeCheck,
  prefix: string,
  requests: readonly unknown[],
  registers: number,
  libFunctions: number,
  keys: ReadonlySet<string>,
  seen: Set<number>,
): boolean {
  for (let i = 0; i < requests.length; i += 1) {
    const request = requests[i];
    const path = `${prefix}requests[${i}]`;
    if (!shape.object(request, path)) return false;
    if (!shape.whole(request['id'], `${path}.id`)) return false;
    // The id is this read's handle and is what `req.isReady` is handed, so two
    // reads sharing one would answer each other's question.
    if (seen.has(request['id'])) {
      return shape.fail(`${path}.id`, `${request['id']} is already another read's handle`);
    }
    seen.add(request['id']);
    if (!shape.one(request['read'], `${path}.read`, READS)) return false;
    if (!shape.one(request['mode'], `${path}.mode`, MODES)) return false;
    if (!shape.index(request['series'], `${path}.series`, registers, 'series')) return false;
    if (request['warmup'] !== null && !shape.whole(request['warmup'], `${path}.warmup`)) {
      return false;
    }
    for (const field of ['symbol', 'exchange', 'timeframe']) {
      if (!checkIdentity(shape, request[field], `${path}.${field}`, keys)) return false;
    }
    if (!checkBody(shape, `${path}.body.`, request['body'], libFunctions, keys, seen)) return false;
  }
  return true;
}

function checkBody(
  shape: ShapeCheck,
  prefix: string,
  raw: unknown,
  libFunctions: number,
  keys: ReadonlySet<string>,
  seen: Set<number>,
): boolean {
  const at = prefix.slice(0, -1);
  if (!shape.object(raw, at)) return false;
  for (const name of ['inputs', 'series', 'cells', 'states', 'functions', 'callSites', 'loops',
    'requests', 'code', 'pos', 'fnPos']) {
    if (!shape.array(raw[name], `${prefix}${name}`)) return false;
  }
  if (!shape.object(raw['frame'], `${prefix}frame`)) return false;
  if (!shape.whole(raw['frame']['slots'], `${prefix}frame.slots`)) return false;

  const series = raw['series'] as readonly unknown[];
  if (!checkMachineTables(shape, prefix, {
    series,
    cells: raw['cells'] as readonly unknown[],
    states: raw['states'] as readonly unknown[],
    functions: raw['functions'] as readonly unknown[],
    callSites: raw['callSites'] as readonly unknown[],
    loops: raw['loops'] as readonly unknown[],
    slots: Number(raw['frame']['slots']),
    libFunctions,
  })) {
    return false;
  }

  const inputs = raw['inputs'] as readonly unknown[];
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    const path = `${prefix}inputs[${i}]`;
    if (!shape.object(input, path)) return false;
    if (!shape.string(input['input'], `${path}.input`)) return false;
    if (!keys.has(input['input'])) {
      return shape.fail(path, `it names the input ${input['input']}, which inputs[] does not declare`);
    }
    if (!shape.index(input['series'], `${path}.series`, series.length, 'the body\'s series')) {
      return false;
    }
  }

  return walk(shape, prefix, raw['requests'] as readonly unknown[], series.length, libFunctions,
    keys, seen);
}

/**
 * One of the three forms a request's identity field takes, 2.16.
 *
 * A value, the setting that supplies it, or one of the three chart facts that
 * identify a chart rather than describe it. The rest of the `chart` namespace
 * describes the chart, and a request built from one of those would name nothing.
 */
function checkIdentity(
  shape: ShapeCheck,
  value: unknown,
  path: string,
  keys: ReadonlySet<string>,
): boolean {
  if (value === null || typeof value === 'string') return true;
  if (!shape.object(value, path)) return false;
  const named = value['input'];
  if (named !== undefined) {
    if (!shape.string(named, `${path}.input`)) return false;
    if (!keys.has(named)) {
      return shape.fail(path, `it names the input ${named}, which inputs[] does not declare`);
    }
    return true;
  }
  if (value['chart'] === undefined) {
    return shape.fail(path, 'an object here names an input or a chart fact');
  }
  return shape.one(value['chart'], `${path}.chart`, CHART_FACTS);
}
