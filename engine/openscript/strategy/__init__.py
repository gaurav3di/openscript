"""Orders, frames, fills and the ledger: ``stdlib.md`` section 17, in Python.

What a strategy decided, what the destination said became of it, and the position
every figure in the language is folded from. Nothing here decides where an order
goes: a destination is the host's, and the minute on it in ``spec/decisions.md``
says the engine learns nothing about it.

What is here, by the page it is written from:

- ``statuses``   17.7's vocabulary: the seven words, the four that end an order
- ``intents``    ``host-interface.md`` 7.1 and 7.2, the two shapes that cross over
- ``rows``       17.7's row and 17.8's fold, which is where double counting happens
- ``positions``  the position book: what settled, per reference, and at what price
- ``holdings``   17.1, which position an order is sent against
- ``closable``   17.1 and 17.2, what is left to reduce and which side reduces it
- ``calls``      17.2 and 17.3's signatures, read once into named fields
- ``sizing``     how much each order sends, and the split that crosses no zero
- ``placing``    what each of the nine calls means
- ``refusals``   OS7002 to OS7013 and OS7017, asked before anything is sent
- ``ledger``     the run's own record, and the one way a frame gets in
- ``fills``      what settled, and the ordinal a case names an intent by

**Two things this package will not do.** It reaches no destination: an intent
leaves through the caller, and a frame arrives through ``Ledger.deliver``, which
is the only way in (``host-interface.md`` 7.4). And it holds no money. What a run
made is ``accounting``'s, computed after the fact from the fills, and the two are
separate so that a stored record can be reported again with no engine present.
"""

from .calls import ORDER_CALLS, OrderCall, call_of
from .closable import Closable, closable, closable_units, closing_for, closing_side
from .fills import Fills, Intents
from .holdings import Holding, holdings, joining, opposing, outgoing_for, protecting
from .intents import Identity, IntentBar, OrderFrame, OrderIntent, Placement
from .ledger import Ledger, LedgerOptions, PlacedCall
from .positions import Positions
from .rows import FrameOutcome, LedgerRow, Reduction, fold_frame, working_units
from .sizing import MappedOrder
from .statuses import HOST_SENDABLE, STATUSES, TERMINAL, is_terminal, status_from

__all__ = [
    "Closable",
    "Fills",
    "HOST_SENDABLE",
    "Holding",
    "Identity",
    "IntentBar",
    "Intents",
    "Ledger",
    "LedgerOptions",
    "LedgerRow",
    "MappedOrder",
    "ORDER_CALLS",
    "OrderCall",
    "OrderFrame",
    "OrderIntent",
    "Placement",
    "PlacedCall",
    "Positions",
    "Reduction",
    "FrameOutcome",
    "STATUSES",
    "TERMINAL",
    "call_of",
    "closable",
    "closable_units",
    "closing_for",
    "closing_side",
    "fold_frame",
    "holdings",
    "is_terminal",
    "joining",
    "opposing",
    "outgoing_for",
    "protecting",
    "status_from",
    "working_units",
]
