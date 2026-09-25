import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fromBits } from './hypot-cases.js';

export interface PowerCase {
  x:string|null; y:string|null; expected:string|null;
  kind:'rational'|'algebraic'|'general'; midpoint?:boolean;
}

export const decode = (value:string|null):number|null => value === null ? null : fromBits(BigInt('0x'+value));

/** Expected values come from Decimal enclosures and exact Fraction witnesses. */
export function powerCases(): PowerCase[] {
  const python=spawnSync('python',['-m','tests.test_power','--cases'],{
    cwd:resolve('engine'),encoding:'utf8',maxBuffer:16*1024*1024,
  });
  assert.equal(python.status,0,python.stderr);
  return JSON.parse(python.stdout) as PowerCase[];
}
