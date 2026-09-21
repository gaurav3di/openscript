"""The three strategy channels, in the encoding ``conformance.md`` section 4 gives them.

A channel of ``expected.json`` is "an ordered list, and each element is a flat
object of named fields". ``orders`` is a ledger row of ``stdlib.md`` 17.7,
``trades`` is a round trip, and ``performance`` is a list of one flat object
holding the run's summary and nothing nested.

**An intent is named by its ordinal and never by an id.** Section 3: "a case
cannot know the id an engine minted and must not depend on its spelling". The
ordinal counts every intent the run placed, so a bracket that appended no row
still takes one, and the gaps in an ``orders`` channel are where the brackets
were.

**Nothing here computes.** Every figure is read off a row, a trade or a summary
the layers next door folded, in the order they folded them, so a difference
between two engines is a difference in the fold rather than in a projection.
"""

from typing import Any, Dict, List, Optional, Sequence

from ..accounting import Summary, Trade
from ..strategy import Intents, LedgerRow


def order_row(row: LedgerRow, ordinal: int, qty_type: str) -> Dict[str, Any]:
    """One ledger row, as a case records one.

    The rejection is absence where there is none, because absence and the empty
    string are different answers everywhere else in this language and a row a
    destination said nothing about is not a row it rejected with no words.
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


def orders_channel(rows: Sequence[LedgerRow], intents: Intents) -> List[Dict[str, Any]]:
    """Every row of the ledger, oldest first, which is the order it was sent in."""
    found: List[Dict[str, Any]] = []
    for row in rows:
        intent = intents.by_id(row.intent_id)
        found.append(
            order_row(
                row,
                intents.ordinal_of(row.intent_id),
                "" if intent is None else intent.qty_type,
            )
        )
    return found


def trade_row(trade: Trade) -> Dict[str, Any]:
    """One round trip, as a case records one."""
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


def summary_row(summary: Summary) -> Dict[str, Any]:
    """The run's summary, as a case records it: one flat object and nothing nested."""
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


def performance_channel(summary: Optional[Summary]) -> List[Dict[str, Any]]:
    """The summary as the one element of an ordered list, which is what the channel is.

    A list of one rather than an object, so that a reader and a runner need one
    shape for every channel rather than two.
    """
    return [] if summary is None else [summary_row(summary)]
