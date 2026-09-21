/**
 * The identity each shipped strategy is harvested under, and the run it is
 * harvested from.
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
 *
 * ## One example, more than one case
 *
 * A case is a run, and a run is a script and what the host chose to run it
 * under, so two identities naming one example under different choices are two
 * cases rather than one case written twice. `run` is what the host chose
 * beyond the gate's own: a money rounding digit count, a report window, or
 * values for the script's inputs, which are the three facts
 * `conformance.md` section 3 gives a case a file for and the fixture states
 * the same way in every other case. An identity with no `run` is the run the
 * gate drives everywhere else, which is what keeps the first two cases the
 * bytes they were harvested as.
 *
 * A fourth choice is how the destination behaved, which is `schedule`: acts
 * naming the nth order the destination took, the boundary each falls on and
 * what it does there (`simulate.ts`). It reaches the case as its frames rather
 * than as a file of its own, because what a destination decided is the frames,
 * and those are `frames.csv`. It is what lets a case carry a partial fill, an
 * order that ends carrying nothing and a fill that arrives after its order has
 * ended, none of which the destination this suite was harvested from ever did
 * on its own. `scripts/lib/venue-schedule.mjs` holds a schedule to the run it
 * produced, because an act names an order by ordinal and the run decides how
 * many orders there are.
 *
 * A window is stated as two bar indices and not as two instants. The bars are
 * a formula's, and an instant written here would have to be worked out again
 * by hand the day that formula moves, by somebody who would have no way of
 * knowing which bar it was meant to name. The indices are resolved against the
 * bars the harvest drives, and one naming a bar the fixture does not have
 * refuses the case rather than harvesting a run over a bound of absence.
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
  {
    example: '10-strategy-ema-cross.oscript',
    id: 'perf/report-window',
    run: { window: { fromBar: 150, toBar: 300 } },
    description:
      'A strategy run reported over a window inside the bars supplied, with a position open at ' +
      'each end of it, produces the recorded ledger, trades and summary.',
    why:
      '`feature-matrix.md` row `perf/report-window` says which of the bars supplied a run is ' +
      'reported over, and `conformance.md` section 3 carries the window in `backtest.json` ' +
      'because the host chooses it and the script never states it. This is the run of ' +
      '`order/buy`, the same script over the same bars, reported over bars 150 to 300 by their ' +
      "own times. The ledger, the trades and the realised profit are that case's to the " +
      'last bit and the report is not: 151 bars are reported rather than 400, 90 of them ' +
      'holding a position rather than 187, and the deepest drawdown is the deepest one inside ' +
      'the window. The window opens during the third trade and closes during the fifth, so a ' +
      'position opened before the first reported bar is carried into the window rather than ' +
      'appearing from nowhere, and one still open at the last reported bar is carried out of it.',
    defends:
      'A second engine that executes only the bars inside the window warms its averages from ' +
      'bar 150 and crosses on other bars, and the frames this case holds then arrive after ' +
      'bars it never ran, which is where it stops. One that reports every bar supplied reports ' +
      '400 where the summary says 151, and measures the drawdown over bars the window ' +
      'excludes. One that counts only the trades that opened and closed inside the window ' +
      'counts fewer than the six `expected.json` lists, two of which are over before the ' +
      'window opens, and works another expectancy out from them. What it does not defend: ' +
      'both bounds ' +
      'are the times of bars this fixture holds, so a bound falling between two bars or outside ' +
      'them is not a shape this case has, and neither is the refusal of a window holding no bar ' +
      'at all (OS6020), which no harvested case can carry because a case is a run that happened.',
  },
  {
    example: '11-strategy-opening-range.oscript',
    id: 'perf/money-digits',
    run: { digits: 0 },
    description:
      'A strategy run folded under a money rounding digit count other than two produces the ' +
      'recorded ledger, trades and summary.',
    why:
      '`conformance.md` section 3 says the digit count is a fact of the run rather than of the ' +
      'instrument, which is why `backtest.json` carries it and `instrument.json` does not. This ' +
      'is the run of `order/sell` under a count of zero rather than two. Every figure in ' +
      "`expected.json` is that case's figure unchanged, and that is the assertion: the " +
      "count reaches the total of one fill's charges, rounded half to even, and no other " +
      'figure of the report. Every charge in this run is twenty currency units for a fill, a ' +
      'whole number under any count, so what this case fixes is where the rounding does not ' +
      'reach rather than the rounding itself.',
    defends:
      'A second engine that reads section 3 as every money figure being rounded to the stated ' +
      'count writes a net profit of -654 where this case says -653.55, an average loss of 38 ' +
      'where it says 38.44411764705882, and disagrees on most of the summary. That is the ' +
      'reading the sentence invites, which is the whole reason this case is here. What it does ' +
      'not defend, and the reason a stronger case cannot be harvested from a shipped strategy: ' +
      'a charge that is not a whole number, where the rounding itself decides a digit. That ' +
      'needs a schedule the host supplies, and a supplied schedule beside a declared commission ' +
      'is refused before the first bar (OS6023), so it needs a strategy that declares none.',
  },
  {
    example: '10-strategy-ema-cross.oscript',
    id: 'input/host-values',
    run: { inputs: { fastLen: 5, slowLen: 34, riskAmount: 2500 } },
    description:
      'A strategy run under the values a host stored for three of its inputs produces the ' +
      'recorded ledger, trades and summary.',
    why:
      "`host-interface.md` 8.1 keys a stored value by the input's own name and never by " +
      'its position, and `conformance.md` section 2 is where those values reach a case: ' +
      '`settings.json`, keyed the same way. This is the crossing strategy of `order/buy` over ' +
      'the same bars with three inputs set, a faster fast average, a slower slow one and half ' +
      'the amount risked on a trade, and it is the only case in the suite carrying that file. ' +
      'The run it produces has ten ledger rows and five trades where the declared defaults ' +
      'produce thirteen and six, and every quantity in it is sized from the stored amount.',
    defends:
      'A second engine that never opens `settings.json` runs the script under its own ' +
      'defaults, crosses on other bars, and ends with a ledger that is not the one ' +
      '`expected.json` holds, which is a failure no other case in the suite can produce. One ' +
      'that keys a stored value by position rather than by name sets the wrong three inputs, ' +
      'and the value that lands outside its input\'s bounds is refused before the first bar, ' +
      'where this case records no diagnostic at all. One that applies ' +
      'the values to the averages and sizes from the declaration rather than from the stored ' +
      'amount agrees on every bar and disagrees on every quantity. What it does not defend: the ' +
      'other half of 8.1, a row keyed by its title where the input is assigned to no name, and ' +
      "the refusal of a stored value outside an input's bounds (OS6019), because every " +
      'value here is inside them and a case is a run that happened.',
  },
  {
    example: '10-strategy-ema-cross.oscript',
    id: 'order/partial-fill',
    run: {
      schedule: [
        { order: 1, afterBars: 0, does: 'fill', units: 0 },
        { order: 1, afterBars: 2, does: 'fill', units: 400 },
        { order: 1, afterBars: 5, does: 'fill' },
        { order: 2, afterBars: 0, does: 'fill', units: 0 },
        { order: 2, afterBars: 1, does: 'fill', units: 500 },
        { order: 2, afterBars: 3, does: 'fill' },
      ],
    },
    description:
      'A strategy whose first entry and the close that ends it each arrive in pieces over ' +
      'several bars produces the recorded ledger, trades and summary.',
    why:
      '`stdlib.md` 17.8 folds a frame that is cumulative: a row takes the quantity whole and ' +
      "the destination's average over it whole, and what is new in the frame is the delta " +
      'that settles as a fill. Every frame in the suite before this one carried nothing filled ' +
      'or the whole order, so the difference between a quantity and a delta could not be seen. ' +
      'This is the run of `order/buy` against a destination told to report 400 of the first ' +
      "entry's 1084 units two boundaries after it took the order and the rest five boundaries " +
      'after, and 500 of the closing order before the rest of it. Four things follow and are ' +
      'each in `expected.json`: the first trade has two entries and two exits where every ' +
      'other trade in the suite has one of each, its entry price is the average over two ' +
      'pieces filled at two prices, the run is charged for fourteen fills where the plain run ' +
      'is charged for twelve, and the two rows the destination answered late carry an ' +
      '`updatedAt` that the placement did not put there.',
    defends:
      'A second engine that reads `filledQty` as a delta and adds it to the row folds 1484 ' +
      'units onto a 1084 unit order and every figure after it is wrong. One that works an ' +
      "average out from the pieces it saw, rather than taking the destination's, writes " +
      'another entry price on the first trade. One that charges a commission per order rather ' +
      'than per fill reports 240 in charges where this case says 280. One that leaves ' +
      "`updatedAt` where the placement put it disagrees on two rows and on nothing else, and " +
      'the suite before this case could not tell that reading from the right one. What it ' +
      'does not defend: a frame whose quantity goes backwards, which is a stale frame the ' +
      'fold swallows and `order/fold-repeat` reserves, and a partial fill of a resting order, ' +
      'because this destination prices a scheduled fill at the close of the bar the act falls ' +
      'on and answers a scheduled order by the schedule alone.',
  },
  {
    example: '10-strategy-ema-cross.oscript',
    id: 'order/ended-unfilled',
    run: {
      schedule: [
        { order: 1, afterBars: 0, does: 'fill', units: 0 },
        { order: 1, afterBars: 1, does: 'reject', text: 'not enough margin' },
        { order: 2, afterBars: 0, does: 'fill', units: 0 },
        { order: 2, afterBars: 2, does: 'expire' },
        { order: 3, afterBars: 0, does: 'fill', units: 0 },
        { order: 3, afterBars: 1, does: 'cancel' },
      ],
    },
    description:
      'A strategy whose first three entries are refused, expire and are cancelled without ' +
      'filling produces the recorded ledger, trades and summary.',
    why:
      '`stdlib.md` 17.7 gives an order four terminal words and three of them end it carrying ' +
      'less than it asked for. No case in the suite carried one: every order in it filled, so ' +
      'an engine that never learned what to do with a quantity still working passed. This is ' +
      'the run of `order/buy` against a destination that refuses the first entry with its own ' +
      'text, lets the second expire and cancels the third, each after acknowledging it and ' +
      'each with nothing filled. Because nothing filled, no position opens on any of the ' +
      'three, the crossing back finds the strategy flat and sends nothing, and the run reaches ' +
      'half the trades the plain run does from the same bars. The refused row is the only row ' +
      'in the suite carrying a `rejection`.',
    defends:
      'A second engine that folds a terminal word as an ending of the whole order opens a ' +
      'position of 1084 units that nothing filled, and every trade and every money figure ' +
      'after it is a fold of that position. One that drops the text a refusal carried writes ' +
      'null where this case records the text the destination sent. One that keeps the row live ' +
      'after a terminal word lets the next crossing be refused by the pyramiding limit rather ' +
      'than entering. One that leaves `updatedAt` where the placement put it disagrees on the ' +
      'three rows the destination ended and on nothing else. What it does not defend: an ' +
      'engine raising a code for a refused order, which is OS7014 and deferred, so this case ' +
      'records the refusal in the ledger and no diagnostic beside it.',
  },
  {
    example: '10-strategy-ema-cross.oscript',
    id: 'order/fold-after-terminal',
    run: {
      schedule: [
        { order: 1, afterBars: 0, does: 'fill', units: 0 },
        { order: 1, afterBars: 1, does: 'cancel' },
        { order: 1, afterBars: 2, does: 'fill' },
      ],
    },
    description:
      'A strategy whose first entry is cancelled and then filled by a frame arriving after ' +
      'the cancellation produces the recorded ledger, trades and summary.',
    why:
      '`stdlib.md` 17.8 says a fill arriving after a terminal status is folded for its ' +
      'quantity with the status left terminal, and gives the reason: a cancellation can race ' +
      'a fill at any destination, and an engine that refuses the late frame leaves the account ' +
      'holding a position the strategy cannot see. This is the run of `order/buy` against a ' +
      'destination that acknowledges the first entry, cancels it a boundary later and reports ' +
      'it filled whole the boundary after that. The row ends `cancelled` carrying 1084 filled ' +
      'and an average price, which is the shape that sentence describes and which no other ' +
      'case in the suite has, and the position that fill opened is the one the first trade is ' +
      'folded from.',
    defends:
      'A second engine that refuses a frame because the row it names has ended folds no ' +
      'quantity: its first row reports nothing filled, the position never opens, and the ' +
      'first trade of `expected.json` has nothing to be folded from. One that lets the late ' +
      'fill move the status writes `filled` where this case says `cancelled`, which is the ' +
      'other half of the same sentence and the half an engine is likelier to get wrong. One ' +
      'that leaves `updatedAt` where the placement put it disagrees on that row and on ' +
      'nothing else. What it does not defend: a cancellation the strategy itself asked for, ' +
      'because no shipped example calls `cancel(...)` and a case is a run that happened; the ' +
      'cancellation here is the destination behaving as a destination does.',
  },
];

/** Every identity naming one example, in the order a case is harvested in. */
export function identitiesFor(example) {
  return IDENTITIES.filter((one) => one.example === example);
}

/**
 * The contract one case is harvested under: the gate's own, or its digit count.
 *
 * The digit count is the one fact of a run that lives on the contract and is
 * not an instrument fact, which is why `conformance.md` section 3 puts it in
 * `backtest.json` and not in `instrument.json`. A case that names one is
 * harvested under a contract that differs from the gate's in that fact and in
 * nothing else, so the difference between two such cases is the count.
 */
export function contractFor(identity, contract) {
  const digits = identity.run?.digits;
  return digits === undefined ? contract : { ...contract, digits };
}

/**
 * What the host chose for one case beyond the contract, and what stopped it.
 *
 * A window that names a bar the fixture does not hold is a problem the caller
 * reports against the case, not an exception out of a helper: the bars are a
 * formula's and a shorter fixture would otherwise harvest a run over a bound
 * of absence, which is a case nobody could read back.
 *
 * `policy` is the fill policy a run takes when the host states none, which a
 * schedule is carried on rather than beside: the two are the same kind of
 * fact, how this destination decides a fill, and `settings.ts` says why they
 * travel together. It is handed in rather than named here so that a case
 * stating no schedule is harvested under the policy the engine itself
 * defaults to, whatever that becomes, and not under a second copy of it.
 */
export function chosenFor(identity, bars, policy) {
  const chosen = {};
  const window = identity.run?.window;
  if (window !== undefined) {
    const from = bars[window.fromBar];
    const to = bars[window.toBar];
    if (from === undefined || to === undefined) {
      return {
        chosen,
        problem:
          `its window names bars ${window.fromBar} and ${window.toBar} of a fixture holding ` +
          `${bars.length}`,
      };
    }
    chosen.range = { from: from.time, to: to.time };
  }
  if (identity.run?.inputs !== undefined) chosen.inputs = identity.run.inputs;
  const schedule = identity.run?.schedule;
  if (schedule !== undefined) chosen.fill = { ...policy, schedule };
  return { chosen, problem: null };
}
