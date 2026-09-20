/**
 * Compiling and running a catalogue example, as a host would.
 *
 * The compiler and the engine are the built ones rather than a reading of their
 * source, for the same reason the defaults check and the chart check use them:
 * what is being checked is what a host is handed, and a transcription of the
 * pipeline here would be a second compiler whose first defect would be hiding
 * one in the first.
 *
 * The three modules are handed in rather than loaded here. A dynamic load
 * resolves its specifier against the file doing the loading, so `../dist/...`
 * is correct in `scripts/` and is a path into nowhere one directory deeper;
 * `built.mjs` says so at length and this file is that directory deeper.
 *
 * ## Two venues, not one
 *
 * A before block is run twice, on two destinations that differ in one fact:
 * whether an order fills. Both are honest hosts, and the difference is not a
 * convenience, it is two halves of the order catalogue. OS7008, the pyramiding
 * refusal, needs a position, so it needs a venue that fills. OS7013, two
 * opposite orders on one bar, is refused before anything is filled, and on a
 * venue that fills the entry the next signal is refused by pyramiding first, so
 * the code that entry is about never happens. One venue would prove one of the
 * two and quietly not the other.
 *
 * Both venues run for every entry, which is what keeps this from being a
 * per-entry setting: the check asks whether the code appeared on either.
 *
 * ## The bars
 *
 * One dataset, from a fixed formula, the same on every machine and every run.
 * Two waves at different periods, so that a crossing, a pivot and a range each
 * occur several times: a fixture where nothing ever crosses proves nothing
 * about a strategy, and would report one that never trades as one with no
 * defects. The formula is `tests/engine/support.ts`'s, because a second shape
 * of fixture data is a second thing to keep true.
 */

/**
 * How many bars a before block is run over.
 *
 * Long enough for a twenty bar average to warm up and cross several times, and
 * for a hundred bar history read to be a read of a bar that exists rather than
 * of absence. Every bar costs one execution of every example, so this is a
 * budget as well as a fixture, and a ceiling measured in millions of elements
 * is not reachable from here at any length. The entries about one say so in the
 * catalogue rather than being chased with a longer run.
 */
export const BAR_COUNT = 140;

const BASE_TIME = 1_748_736_000_000;

/** The two venues, in the order the report names them. */
export const VENUES = ['a venue that fills', 'a venue that leaves an order working'];

function fixtureBars(count) {
  const out = [];
  let price = 100;
  for (let i = 0; i < count; i += 1) {
    price = price + Math.sin(i / 3) * 1.5 + Math.cos(i / 7);
    out.push({
      time: BASE_TIME + i * 60_000,
      open: price,
      high: price + 1.2,
      low: price - 1.1,
      close: price + Math.sin(i / 5) * 0.6,
      volume: 1000 + (i % 37) * 11,
    });
  }
  return out;
}

/**
 * The harness, built over the three modules the check loaded.
 *
 * `core` is the compiler surface, `emitter` is the emitter behind its own door,
 * and `hosts` is the page-built host the engine suite drives, which is the only
 * host in this repository written from the interface document rather than
 * against the engine.
 */
export function harnessWith(core, emitter, hosts) {
  const bars = fixtureBars(BAR_COUNT);

  /**
   * Source text through the whole front end, to the program a host is handed.
   *
   * The stages are called one at a time rather than through one door, so that a
   * block the emitter refused is distinguishable from one the checker refused,
   * and a block that never reached the emitter from one it could not carry.
   */
  function compile(name, text) {
    const file = core.sourceFile(name, text);
    const bag = new core.DiagnosticBag();
    const tokens = core.lex(file, bag);
    const script = core.parseTokens(file, tokens, bag);
    const checked = core.check(file, script, bag);
    const result = emitter.emit(file, checked, bag, {});
    return { file, diagnostics: bag.ordered(), program: result.program };
  }

  /**
   * Every code one program raised on one venue: at load, or on a bar.
   *
   * A run stops at the first bar that fails, which is what the engine does to a
   * study, so the list is short by design. Nothing here throws on a diagnostic:
   * a refusal is a value the engine returns, and an exception out of this is a
   * defect in the engine, which the caller reports as one.
   */
  function codesFromRun(program, venue) {
    const fills = venue === 0;
    const host = hosts.pageHost({
      bars,
      now: BASE_TIME,
      destination: fills ? { bars } : {},
    });
    // The wire form, not the emitter's own object: an engine in another
    // language is handed text, and a field that survives only because both
    // sides share one object is a field a second engine never sees.
    const loaded = hosts.loadOn(JSON.parse(JSON.stringify(program)), host);
    if (loaded.engine === undefined) return loaded.code === undefined ? [] : [loaded.code];

    const codes = [];
    for (const result of hosts.runOn(loaded.engine, host)) {
      if (result.diagnostic !== undefined) codes.push(result.diagnostic.code);
    }
    return codes;
  }

  /** Every code one program raised on either venue, each with the venue. */
  function runEverywhere(program) {
    const found = [];
    for (let venue = 0; venue < VENUES.length; venue += 1) {
      for (const code of codesFromRun(program, venue)) found.push({ code, venue });
    }
    return found;
  }

  return { compile, codesFromRun, runEverywhere, bars };
}
