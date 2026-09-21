"""A strategy case driven through the ledger, without an interpreter in the room.

The library that computes a crossing and the interpreter that executes a bar are
other stages' work. What this stage owns is what happens after a bar has decided:
the call becomes intents, the intents become rows, the destination's frames fold
into them, and the fills become money. All of that is reachable with no program
at all, because ``Ledger.place`` takes a call by name and its arguments, which is
exactly what step 9 hands it (``compiled-program.md`` 5.4).

So a case is replayed here rather than run. The bars, the frames and the
destination's answers are the case's own bytes; what is reconstructed is the
sequence of calls, and it is reconstructed from the case rather than from the
script's text:

- **A row is a call.** A row on the buy side is an entry at its own quantity and
  under its own tag; a row on the sell side carrying no tag is a bare ``close()``,
  which is what this suite's strategy cases send, and the case's own notes say so.
- **A gap in the ordinals is an intent that appended no row.** ``stdlib.md`` 17.7
  says a bracket and a cancellation carry an id and append nothing, so the run
  placed more intents than the ledger has rows and the ordinals say how many. The
  gaps are filled with brackets, which is what the gaps are, and a bracket stating
  distances rather than prices is used so that the filler cannot itself be
  refused on a level's side (OS7010) and change what the case proves.

**What a mismatch means.** If the reconstruction is wrong the ordinals, the
position references and the placement bars stop lining up with the recorded ones
at the first row that differs, which is the assertion rather than a risk to it.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from tests.recorded import Case, RecordedBar

from openscript.adapter.reporting import schedule_lines
from openscript.accounting import BarMark, Contract, ChargeSchedule, schedule_from_declaration
from openscript.diagnostics import Position
from openscript.strategy import (
    Fills,
    Identity,
    IntentBar,
    Intents,
    Ledger,
    LedgerOptions,
    LedgerRow,
    OrderFrame,
)

#: Where a replayed call is written. A case records no source position for an
#: order call, and nothing this stage computes turns on one.
AT = Position(1, 1)

#: The distances the filler bracket states. Any two would do: a bracket appends
#: no row, so the only thing it changes is the ordinal after it.
FILLER = 1.0


@dataclass(frozen=True)
class Replayed:
    """What one replay produced, beside the case it was replayed from."""

    ledger: Ledger
    intents: Intents
    fills: Fills
    rows: Tuple[LedgerRow, ...]
    refusals: Tuple[Any, ...]


def options_for(case: Case) -> LedgerOptions:
    """The declaration and the chart, as the case's own two files state them."""
    instrument = case.instrument
    declared = case.declaration
    return LedgerOptions(
        instrument=Identity(instrument.get("symbol"), instrument.get("exchange")),
        product=declared.get("product", "intraday"),
        qty_type=declared.get("qtyType", "units"),
        declared_qty=declared.get("qty", 1.0),
        tick_size=instrument.get("tickSize"),
        pyramiding=declared.get("pyramiding", 1.0),
    )


def contract_for(case: Case) -> Contract:
    """The contract the run was carried out under, which is two files and no default.

    The instrument facts are the host's record and the digit count is the run's,
    which is why ``conformance.md`` section 3 puts one in ``instrument.json`` and
    the other in ``backtest.json``.
    """
    instrument = case.instrument
    return Contract(
        currency=instrument.get("currency", "CUR"),
        symbol=instrument.get("symbol"),
        exchange=instrument.get("exchange"),
        tick_size=instrument.get("tickSize"),
        lot_size=instrument.get("lotSize"),
        point_value=instrument.get("pointValue", 1.0),
        digits=case.backtest["digits"],
    )


def schedule_for(case: Case) -> Optional[ChargeSchedule]:
    """The cost model the run was carried out under.

    The host's schedule where it supplied one, and otherwise the declaration's own
    commission as the one kind of schedule the money layer evaluates.
    """
    supplied = case.backtest.get("costs")
    if supplied is not None:
        return ChargeSchedule(
            currency=supplied["currency"],
            digits=supplied["digits"],
            slippage_ticks=supplied.get("slippageTicks", 0.0),
            lines=schedule_lines(supplied),
            source="supplied",
        )
    contract = contract_for(case)
    declared = case.declaration
    return schedule_from_declaration(
        declared.get("commission", 0.0),
        declared.get("commissionType", "perTrade"),
        declared.get("slippage", 0.0),
        contract.currency,
        contract.digits,
    )


def marks_for(case: Case) -> Tuple[BarMark, ...]:
    """One mark per bar supplied, warmup included, with the window's own answer.

    A bar outside the window executes and is not reported: its orders are real and
    a position opened on it is carried in. Both bounds are inclusive and are
    compared against the bars' own times, never against a calendar.
    """
    window = case.backtest.get("range", {"from": None, "to": None})
    lower = window.get("from")
    upper = window.get("to")

    def inside(bar: RecordedBar) -> bool:
        if lower is None and upper is None:
            return True
        if lower is not None and bar.time < lower:
            return False
        if upper is not None and bar.time > upper:
            return False
        return True

    return tuple(
        BarMark(bar_index=at, time=bar.time, close=bar.close, in_report=inside(bar))
        for at, bar in enumerate(case.bars)
    )


def _calls_for(order: Dict[str, Any]) -> List[Tuple[str, List[Any]]]:
    """The call one recorded row was placed by, as its side and its tag say.

    The written argument names are the last argument of an order call
    (``compiled-program.md`` 4.10), and they are what tells an argument the script
    wrote from one it left out, so they are stated here as the script wrote them.
    """
    if order["tag"] != "":
        # An entry, on the side the row records and under the tag it carries. The
        # side is the row's rather than the tag's: this suite holds a long case
        # and a short one, and reading an entry off the side would call one of
        # them an exit.
        name = order["side"]
        return [(name, [order["qty"], None, None, order["tag"], None, "qty tag"])]
    # A bare close, which works its own quantity out: it writes no quantity, so
    # the ledger is asked for the number rather than told one.
    return [("close", [None, None, None, ""])]


def _fill_to(intents: Intents, ledger: Ledger, ordinal: int, bar: IntentBar) -> List[Any]:
    """Brackets until the run has placed as many intents as this ordinal needs."""
    refusals: List[Any] = []
    while intents.count() < ordinal - 1:
        placed = ledger.place(
            "order.bracket", ["", FILLER, FILLER, None, "profit loss"], bar, AT
        )
        if placed.refusal is not None:
            refusals.append(placed.refusal)
            break
        intents.record(placed.intents)
    return refusals


def replay(case: Case) -> Replayed:
    """The case, bar by bar, with the destination answering between the bars.

    The one ordering rule, which is ``host-interface.md`` 7.4's: deliver, then
    fold, then decide the bar, then record what the fold settled. A driver that
    folded after the bar would let a script react within the bar it was sent in,
    and one that folded during it would give two executions of a moving bar two
    different positions to read.
    """
    ledger = Ledger(options_for(case))
    intents = Intents()
    fills = Fills()
    refusals: List[Any] = []
    refs: Dict[int, str] = {}

    orders = list(case.expected.get("orders", []))
    at_time: Dict[float, List[Dict[str, Any]]] = {}
    for order in orders:
        at_time.setdefault(order["placedAt"], []).append(order)

    pending: List[Tuple[OrderFrame, int]] = []
    for index, bar in enumerate(case.bars):
        for frame, ordinal in pending:
            named = intents.at_ordinal(ordinal)
            if named is not None and frame.order_ref is not None:
                refs[named.intent_id] = frame.order_ref
            ledger.deliver(frame)
        pending = []

        outcomes = ledger.settle()

        where = IntentBar(index=index, time=bar.time)
        for order in at_time.get(bar.time, []):
            refusals.extend(_fill_to(intents, ledger, order["intent"], where))
            for name, args in _calls_for(order):
                placed = ledger.place(name, args, where, AT)
                if placed.refusal is not None:
                    refusals.append(placed.refusal)
                intents.record(placed.intents)

        fills.record(outcomes, intents, index, bar.time, refs)

        for delivered in case.frames:
            if delivered.after_bar != index:
                continue
            named = intents.at_ordinal(delivered.intent)
            pending.append(
                (
                    OrderFrame(
                        intent_id=-1 if named is None else named.intent_id,
                        status=delivered.status,
                        filled_qty=delivered.filled_qty,
                        avg_fill_price=delivered.avg_fill_price,
                        order_ref=delivered.order_ref,
                        text=delivered.text,
                    ),
                    delivered.intent,
                )
            )

    return Replayed(
        ledger=ledger,
        intents=intents,
        fills=fills,
        rows=tuple(ledger.rows()),
        refusals=tuple(refusals),
    )


def recorded_order(row: LedgerRow, ordinal: int, qty_type: str) -> Dict[str, Any]:
    """One ledger row as ``expected.json``'s ``orders`` channel writes it.

    The spelling is the record's, which is ``conformance.md`` section 4's: a flat
    object of named fields, with the intent as an ordinal because no engine can
    know the id another minted, and the rejection as absence where there is none.
    """
    return {
        "intent": ordinal,
        "orderRef": row.order_ref,
        "tag": row.tag,
        "leg": row.leg,
        "positionRef": row.position_ref,
        "symbol": row.instrument.symbol,
        "exchange": row.instrument.exchange,
        "product": row.product,
        "side": row.side,
        "qty": row.qty,
        "qtyType": qty_type,
        "type": row.order_type,
        "price": row.price,
        "trigger": row.trigger,
        "status": row.status,
        "filledQty": row.filled_qty,
        "avgFillPrice": row.avg_fill_price,
        "rejection": None if row.rejection == "" else row.rejection,
        "placedAt": row.placed_at,
        "updatedAt": row.updated_at,
        "units": row.units,
    }


def recorded_orders(replayed: Replayed) -> Tuple[Dict[str, Any], ...]:
    """Every row of a replay, in the spelling a case records."""
    out = []
    for row in replayed.rows:
        intent = replayed.intents.by_id(row.intent_id)
        out.append(
            recorded_order(
                row,
                replayed.intents.ordinal_of(row.intent_id),
                "" if intent is None else intent.qty_type,
            )
        )
    return tuple(out)


def recorded_trade(trade) -> Dict[str, Any]:
    """One trade as ``expected.json``'s ``trades`` channel writes it."""
    return {
        "barsHeld": trade.bars_held,
        "charges": trade.charges,
        "closedAt": trade.closed_at,
        "closedOnBar": trade.closed_on_bar,
        "entries": trade.entries,
        "entryPrice": trade.entry_price,
        "exitPrice": trade.exit_price,
        "exits": trade.exits,
        "grossProfit": trade.gross_profit,
        "index": trade.index,
        "isOpen": trade.is_open,
        "maxAdverse": trade.max_adverse,
        "maxFavourable": trade.max_favourable,
        "netProfit": trade.net_profit,
        "openedAt": trade.opened_at,
        "openedOnBar": trade.opened_on_bar,
        "positionRef": trade.position_ref,
        "side": trade.side,
        "units": trade.units,
    }


def recorded_summary(summary) -> Dict[str, Any]:
    """The summary as ``expected.json``'s ``performance`` channel writes it."""
    return {
        "averageBarsHeld": summary.average_bars_held,
        "averageLoss": summary.average_loss,
        "averageWin": summary.average_win,
        "barCount": summary.bar_count,
        "barsInMarket": summary.bars_in_market,
        "capital": summary.capital,
        "charges": summary.charges,
        "currency": summary.currency,
        "expectancy": summary.expectancy,
        "expectancyStandardError": summary.expectancy_standard_error,
        "grossLoss": summary.gross_loss,
        "grossProfit": summary.gross_profit,
        "longestDrawdownBars": summary.longest_drawdown_bars,
        "losses": summary.losses,
        "maxDrawdown": summary.max_drawdown,
        "maxDrawdownAt": summary.max_drawdown_at,
        "maxDrawdownPercent": summary.max_drawdown_percent,
        "netProfit": summary.net_profit,
        "openTradeCount": summary.open_trade_count,
        "profitFactor": summary.profit_factor,
        "returnPercent": summary.return_percent,
        "scratches": summary.scratches,
        "tradeCount": summary.trade_count,
        "winRate": summary.win_rate,
        "wins": summary.wins,
    }


def capital_of(case: Case) -> float:
    """The starting capital the declaration states, which the report is a fraction of."""
    return case.declaration.get("capital", 0.0)


def ordinals_of(orders: Sequence[Dict[str, Any]]) -> Tuple[int, ...]:
    return tuple(order["intent"] for order in orders)
