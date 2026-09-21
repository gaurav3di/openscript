/**
 * The identity each shipped strategy is harvested under.
 *
 * Here and nowhere else, because a record does not know why it was kept. The
 * id names a row of `feature-matrix.md`, the description is the failure
 * message a runner prints (`conformance.md` section 2), and the other two
 * sentences are what `notes.md` exists to say. A shipped strategy the harvest
 * can run and this table does not name fails the run rather than being passed
 * over, so adding a strategy is also choosing the row it proves, and a row
 * chosen here is one `scripts/harvest-cases.mjs` holds to `implemented` on
 * every run.
 *
 * Each `why` and `defends` is read by whoever opens the case directory when
 * the case fails on an engine somebody else wrote, which is the one moment the
 * sentence is worth anything, so each says what the case proves and, in the
 * same breath, what it does not.
 */
export const IDENTITIES = [
  {
    example: '10-strategy-ema-cross.oscript',
    id: 'order/buy',
    description:
      'A strategy that enters long with buy on a crossing of two averages, sized from the ' +
      'distance to its stop, and flattens with close on the crossing back produces the ' +
      'recorded ledger, trades and summary.',
    why:
      '`feature-matrix.md` row `order/buy` says `buy(...)` enters or adds to a long position, ' +
      'and this run is the entry half proved end to end: the script decides the bar, the tag ' +
      'and the quantity, the ledger records what was sent and what filled, and the trades and ' +
      'the summary are folded from those fills. Pyramiding is one in this script, so the ' +
      'adding half of the row is not exercised here and no case claims it.',
    defends:
      'A second engine that enters on another bar, sizes the entry differently from the same ' +
      'average and range readings, folds the frames in `frames.csv` to another ledger, or ' +
      'works the trades and the summary out from the fills differently disagrees with ' +
      '`expected.json` at the first row that differs. Two things it does not defend, said ' +
      'here rather than discovered: the bracket the script attaches with `exit(...)` reaches ' +
      'the destination as a protective instruction that no destination in this repository ' +
      'fills yet, so every exit in the ledger is one `close()` sent; and the fill prices are ' +
      "the destination's, delivered as input through `frames.csv`, so their timing and " +
      'slippage are facts of this case rather than claims about the engine under test.',
  },
  {
    example: '11-strategy-opening-range.oscript',
    id: 'order/sell',
    description:
      'A strategy that enters long with buy above an opening range and short with sell below ' +
      'it, sized in lots, and flattens by the clock produces the recorded ledger, trades and ' +
      'summary.',
    why:
      '`feature-matrix.md` row `order/sell` says `sell(...)` enters or adds to a short ' +
      'position, and this run is the entry half proved beside the long side: the range formed ' +
      "on each session's first bar decides whether the entry is a buy or a sell, so a sell " +
      'here is a short entry and not a close, and the position goes short, flat and long over ' +
      'the run. Pyramiding is one, so the adding half of the row is not exercised and no case ' +
      'claims it.',
    defends:
      "A second engine that reads the session's first bar on another bar, enters on the " +
      'wrong side of the range, folds the frames in `frames.csv` to another ledger, or works ' +
      'the trades and the summary out from the fills differently disagrees with ' +
      '`expected.json` at the first row that differs. What it does not defend: the stop and ' +
      "the target travel as a bracket the destination does not fill, so every exit in the " +
      "ledger is the clock's, and the fill prices are the destination's, delivered as input " +
      'through `frames.csv`, so their timing and slippage are facts of this case rather than ' +
      'claims about the engine under test.',
  },
];
