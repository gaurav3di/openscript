/**
 * Function bodies, and the call sites that give one body many pieces of state.
 *
 * `compiled-program.md` 2.12 allocates state per **call path** rather than per
 * syntactic call, so a stateful helper called from two places keeps two
 * independent counters. A body addresses its cells and its state regions
 * relative to the frame's bases and the call site supplies them, which is what
 * lets one body serve both.
 *
 * There is one place where that arrangement does not close, and it is the
 * reason this file is not four lines long. A `CALL_FN` names a call site by an
 * absolute index into `callSites`, so a body holding a call to another function
 * names one site and not one per path. A body that calls nothing therefore
 * serves every path and is emitted once; a body that calls something is emitted
 * once per path, so that its inner `CALL_FN` can name the site belonging to that
 * path. Both are legal: nothing in the format says two entries of `functions`
 * may not share a name. The emitter reports the tension rather than leaving a
 * reader to find it.
 */
import { leavesValue } from './calls.js';
import type { Emitter, Site } from './context.js';
import { Frame } from './context.js';
import { emitExpression } from './expressions.js';
import { emitBlock } from './statements.js';

/** The `functions` entry a call site should name, emitting the body if needed. */
export function bodyFor(e: Emitter, checkedFunction: number, site: Site): number {
  const shared = e.shareableBody(checkedFunction);
  if (shared !== undefined) {
    site.frame = e.functionFrames[shared];
    return shared;
  }

  const declared = e.checked.functions[checkedFunction];
  if (declared === undefined) return 0;

  if (e.emitting.has(checkedFunction)) {
    // Recursion is an error the checker reports, and the call graph it leaves
    // is acyclic. A cycle reaching here is a defect, not a program.
    e.gap(
      'a function reaches itself, so the set of call paths is not finite and no call site ' +
        'table can enumerate it',
      'compiled-program.md 2.12, against language.md 11.4',
      declared.declaration.span,
      true,
    );
    return 0;
  }

  e.emitting.add(checkedFunction);
  try {
    return emitBody(e, checkedFunction, site);
  } finally {
    e.emitting.delete(checkedFunction);
  }
}

function emitBody(e: Emitter, checkedFunction: number, site: Site): number {
  const declared = e.checked.functions[checkedFunction];
  if (declared === undefined) return 0;
  const f = new Frame(false);

  // Parameters occupy slots 0 to params - 1, in declaration order (2.12).
  declared.parameters.forEach((parameter, index) => {
    f.layout.slotFor(parameter);
    f.parameters.set(parameter.id, index);
  });

  const body = declared.declaration.body;
  if (body.kind === 'block') {
    // The last statement of a body, when it is a bare expression, is the return
    // value (`language.md` 11.3). So it is emitted and returned rather than
    // emitted and discarded, which is what every other expression statement is.
    const statements = body.statements;
    const last = statements[statements.length - 1];
    const returns =
      last !== undefined && last.kind === 'expressionStatement' && leavesValue(e, last.expression)
        ? last
        : undefined;

    emitBlock(e, f, returns === undefined ? body : { ...body, statements: statements.slice(0, -1) });
    if (returns !== undefined) {
      emitExpression(e, f, returns.expression);
      f.builder.at(returns.span);
      f.builder.push('RET');
    }

    const emitted = f.builder.code[f.builder.code.length - 1];
    if (emitted?.[0] !== 'RET') {
      // A body that ends without an expression returns absent, so every
      // function returns a value and `RET` never has to decide (4.10).
      f.builder.at(declared.declaration.span);
      f.builder.push('CONST', e.pool.absent());
      f.builder.push('RET');
    }
  } else {
    emitExpression(e, f, body);
    f.builder.at(declared.declaration.span);
    f.builder.push('RET');
  }

  const index = e.functions.length;
  e.functions.push({
    name: declared.declaration.name.text,
    params: declared.parameters.length,
    slots: f.layout.slotCount,
    code: f.builder.code,
  });
  e.functionFrames.push(f.layout);
  e.functionPos.push([index, f.builder.pos]);

  site.frame = f.layout;
  site.children = f.sites;

  if (f.sites.length === 0) {
    e.rememberShareableBody(checkedFunction, index);
  } else {
    e.gap(
      'a function body holding a call to another function is emitted once per call path, ' +
        'because a CALL_FN names a call site by an absolute index and a shared body could ' +
        'only name one',
      'compiled-program.md 2.12 and 4.10',
      declared.declaration.span,
      false,
    );
  }
  return index;
}

/**
 * The cell and state base of every call site, once the top level's own totals
 * are known.
 *
 * A body numbers its cells and its state regions from zero and the site adds
 * the base, so the only requirement is that the blocks do not overlap. Walking
 * the sites depth first with one counter is the whole of it: a site's own block
 * is taken, then the blocks of every site its body reaches.
 */
export function assignBases(e: Emitter, topCells: number, topStates: number): void {
  let cell = topCells;
  let state = topStates;
  const done = new Set<number>();

  const assign = (index: number): void => {
    if (done.has(index)) return;
    done.add(index);
    const site = e.sites[index];
    if (site === undefined) return;
    site.cellBase = cell;
    site.stateBase = state;
    cell += site.frame?.cellNames.length ?? 0;
    state += site.frame?.stateFns.length ?? 0;
    for (const child of site.children) assign(child);
  };

  for (let i = 0; i < e.sites.length; i += 1) assign(i);
}
