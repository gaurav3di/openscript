import { bits, fromBits } from './hypot-cases.js';

export const kinds = ['sin','cos','tan','asin','acos','atan','atan2'] as const;
export type Kind = typeof kinds[number];
export interface TrigonometricCase { kind: Kind; first: number|null; second?: number|null }

/** Bit patterns and exponent bands, independent of any trigonometric implementation. */
export function cases(): TrigonometricCase[] {
  const out: TrigonometricCase[] = [];
  const values = [null,NaN,Infinity,-Infinity,-0,0,-1,1,0.125,0.5,2,4,
    Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,
    fromBits(0x3fefffffffffffffn),fromBits(0xbfefffffffffffffn),fromBits(0x3ff0000000000001n)];
  for (const kind of kinds) {
    if (kind === 'atan2') continue;
    for (const first of values) out.push({kind,first});
  }
  for (const exponent of [-1074,-1022,-1000,-500,-53,-1,0,1,25,80,500,1000,1023]) {
    const raw=bits(2**exponent);
    for (const first of [fromBits(raw-1n),fromBits(raw),fromBits(raw+1n)]) {
      for (const kind of ['sin','cos','tan','atan'] as const) out.push({kind,first});
      if (first <= 1) for (const kind of ['asin','acos'] as const) out.push({kind,first});
    }
  }
  for (const first of [null,NaN,Infinity,-Infinity,-0,0,-1,1]) {
    for (const second of [null,-0,0,-1,1,Number.MAX_VALUE]) out.push({kind:'atan2',first,second});
  }
  for (const odd of [1,3,5,7,31,33,63,65]) {
    for (const second of [fromBits(bits(2)-1n),2,fromBits(bits(2)+1n)]) {
      out.push({kind:'atan2',first:odd*Number.MIN_VALUE,second});
      out.push({kind:'atan2',first:-odd*Number.MIN_VALUE,second});
    }
  }
  let seed=0x57203819;
  const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  for (let i=0;i<48;i++) {
    const first=fromBits(BigInt(random())<<32n|BigInt(random()));
    const second=fromBits(BigInt(random())<<32n|BigInt(random()));
    for (const kind of ['sin','cos','tan','atan'] as const) out.push({kind,first});
    out.push({kind:'atan2',first,second});
    const inverse=(random()/2**32)*2-1;
    for (const kind of ['asin','acos'] as const) out.push({kind,first:inverse});
  }
  return out;
}
