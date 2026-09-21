/**
 * Driving the shipped strategy examples through a backtest, as the Phase 5
 * gate does.
 *
 * Two scripts run the shipped strategies over the same fixture and for
 * different reasons. `check-reproducible.mjs` runs them to prove a stored run
 * is reproducible from its own document; `harvest-cases.mjs` runs them to write
 * the conformance cases the second engine is measured against. A case has to
 * be a run the gate reproduces, or the suite would hold numbers no gate here
 * stands behind, and that is only true while the two drive the same contract
 * over the same bars. Written out twice, it would be the second copy that
 * quietly changed a tick size.
 *
 * ## The fixture
 *
 * A placeholder instrument, priced in a currency nobody issues. The examples
 * name no symbol and neither script is about a market: what matters is that
 * every machine uses these same facts.
 *
 * Bars from a fixed formula, not from a market. A wave with a trend under it
 * and a range around each close: enough shape for a crossing strategy to take
 * trades on both sides, and identical on every machine that runs this, which is
 * the only property either script needs of them. No random number generator
 * anywhere, because a gate that runs over different bars each time is a gate
 * that fails for a different reason each time, and a case harvested from them
 * would be a different case each time.
 *
 * ## What is read from the tree
 *
 * The examples, sorted, with their line endings normalised. A checkout on one
 * machine carries a carriage return where another does not, and a record
 * carries the script's own text, so the bytes of a case would otherwise depend
 * on which machine harvested it. The compiler reads either spelling the same
 * way; the normalisation is for the record, not for the compiler.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where the shipped examples live, named from the repository root. */
export const EXAMPLES = 'examples';

/** The extension a shipped example carries. */
const SCRIPT = '.oscript';

/** A placeholder instrument, priced in a currency nobody issues. */
export const CONTRACT = {
  symbol: 'AAA',
  exchange: 'XX',
  currency: 'CUR',
  tickSize: 0.05,
  lotSize: 1,
  pointValue: 1,
  digits: 2,
};

/** How many bars a run covers: enough for a slow average to warm up and cross often. */
export const BAR_COUNT = 400;

const HOUR = 3_600_000;
const START = 1_748_736_000_000;

/** Two digits, so the input is a price and not a float nobody can read back. */
function round(value) {
  return Math.round(value * 100) / 100;
}

/** Hourly bars from the formula above, from a fixed instant. */
export function formulaBars(count) {
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const close = 100 + index * 0.05 + Math.sin(index / 7) * 6 + Math.sin(index / 23) * 11;
    out.push({
      time: START + index * HOUR,
      open: round(close - 0.3),
      high: round(close + 1.1),
      low: round(close - 1.2),
      close: round(close),
      volume: 1000 + (index % 17) * 25,
      oi: null,
    });
  }
  return out;
}

/**
 * Every shipped example, sorted, with its text as a record should carry it.
 *
 * Sorted so two runs and two machines see the examples in one order, which is
 * what lets a report be compared with the one before it.
 */
export function shippedExamples() {
  return readdirSync(EXAMPLES)
    .filter((name) => name.endsWith(SCRIPT))
    .sort()
    .map((name) => {
      const path = join(EXAMPLES, name).split('\\').join('/');
      return { name, path, text: readFileSync(path, 'utf8').replace(/\r\n/g, '\n') };
    });
}

/**
 * Whether a compiled program is a strategy.
 *
 * A study places no orders, so it has no run to reproduce and no case of this
 * kind to harvest. A caller counts and names what it passes over rather than
 * skipping it: a suite that silently skipped every file would report a green
 * gate over nothing at all.
 */
export function isStrategy(program) {
  return program.meta?.kind === 'strategy';
}

/**
 * The capability a run asked for and this driver does not have, or null.
 *
 * OS6006 is the program asking for a capability this engine does not offer,
 * which is a fact about the driver's host and not about the run. A strategy
 * that reads another instrument needs a provider a backtest over one series of
 * bars does not have. `conformance.md` section 8 has the rule for it: reported
 * with the feature named, not a pass, not a failure, counted and printed
 * separately.
 */
export function missingCapability(diagnostic) {
  if (diagnostic.code !== 'OS6006') return null;
  return String(diagnostic.values?.tag ?? diagnostic.code);
}
