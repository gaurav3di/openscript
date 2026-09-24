/**
 * What the chart adapter refuses rather than drops, held to the record.
 *
 * `spec/chart-narrowings.json` lists under `refused` every declaration this
 * chart has no room for, and `compiled-program.md` section 11 says a host
 * refuses such a program before any bar runs, with OS6024, instead of drawing
 * part of it. Each entry is proved here by a study that declares exactly the
 * thing and nothing else the chart cannot draw: the study is compiled, a
 * descriptor is built and asked for a calculation, and the calculation has to
 * throw the entry's code. A refusal nobody asks for is one that could have
 * stopped happening, which is the silent drop this record exists to end.
 *
 * The probes are written here, beside the check, and matched to the record by
 * key in both directions: a record entry with no probe proves nothing, and a
 * probe with no record entry is a refusal nobody wrote down.
 */

const PROBES = {
  'tables.count': `version 1
study("Two grids", overlay = true)
first = table("Summary", 1, 1)
second = table("Detail", 1, 1)
cell(first, 0, 0, "a")
cell(second, 0, 0, "b")
plot(close, "C")
`,
  'fills.colorChannel': `version 1
study("Band", overlay = true)
a = plot(high, "H")
b = plot(low, "L")
fill(a, b, colorUp = close > open ? lime : red)
`,
};

/** Every problem with the record's refusals, proved against the built adapter. */
export function refusalProblems({ core, emitter, adapter, record, recordPath, bars, ctx }) {
  const problems = [];
  const entries = record.refused ?? [];
  const keys = new Set(entries.map((one) => one.key));
  for (const key of Object.keys(PROBES)) {
    if (!keys.has(key)) problems.push(`the check probes ${key} and ${recordPath} records no refusal for it.`);
  }
  for (const entry of entries) {
    const source = PROBES[entry.key];
    if (source === undefined) {
      problems.push(`${recordPath} records the refusal ${entry.key} and nothing here probes it.`);
      continue;
    }
    if ((entry.why ?? '').trim().length === 0) problems.push(`${recordPath} refuses ${entry.key} with no reason given.`);
    const file = core.sourceFile(`${entry.key}.oscript`, source);
    const bag = new core.DiagnosticBag();
    const checked = core.check(file, core.parseTokens(file, core.lex(file, bag), bag), bag);
    const program = emitter.emit(file, checked, bag, {}).program;
    if (program === undefined) {
      problems.push(`the probe for ${entry.key} did not compile, so its refusal was not asked for.`);
      continue;
    }
    let code;
    try {
      adapter.descriptorFor(program).calc(bars, {}, {}, ctx);
    } catch (thrown) {
      code = thrown?.diagnostic?.code;
    }
    if (code !== entry.code) {
      problems.push(
        `${recordPath} says the chart refuses ${entry.key} with ${entry.code}, and a study declaring ` +
          `it ${code === undefined ? 'ran with nothing raised' : `was refused with ${code}`}.`,
      );
    }
  }
  return problems;
}
