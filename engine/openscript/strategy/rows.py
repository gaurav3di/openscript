"""One row of the ledger, and the fold of one frame into it, ``stdlib.md`` 17.7 and 17.8.

**A row is appended when the order is sent and is never rewritten by
guesswork.** Every change to it comes from a frame the destination sent, so the
sequence that produced a position can be replayed rather than inferred.

**The fold is where double counting happens**, which is why it is written once,
here, and why every step of it is the numbered step 17.8 gives. Frames repeat,
cross in flight and arrive after the order they are about has ended, and an
engine that added each frame's quantity to a running total would report a
position the strategy never held. Taking the greatest cumulative quantity
instead makes a repeat cost nothing and makes a terminal frame that overtook a
partial one carry the whole remainder in one piece.

**A row also carries what its order takes out of the position**, because that is
the only record of it that outlives the bar the order was sent on. A position
moves when a fill settles, so an order that has been sent and not answered has
moved nothing and is invisible to every position figure; the row is where it is
visible. ``closable`` reads the reduction back, and what makes the reading work
is that a row already says whether the order is still going: an order neither
terminal nor fully filled is one the destination still has.

Steps 1 and 6 are not here. Locating a row is a question about the whole ledger
and settling a fill is the position book's, so this file says how many units
settled and at what price, and the ledger says where.
"""

from dataclasses import dataclass, field
from typing import Optional

from .intents import Identity
from .statuses import PLACED, is_terminal, rank_of, status_from

#: Why a frame was refused, ``stdlib.md`` 17.14. Both are the host's mistake and
#: both are recorded rather than raised: a frame naming an order this strategy
#: never placed is a fact about the host, and one reporting a fill with no price
#: cannot be marked against anything.
UNKNOWN_INTENT = "unknownIntent"
FILL_WITH_NO_PRICE = "fillWithNoPrice"


@dataclass(frozen=True)
class Reduction:
    """What one order claimed of the part it reduces, in units, when it was sent.

    Absent on an order that adds to a position, and absent on one whose quantity
    the engine cannot count in units, which are two different facts with the
    same consequence: neither subtracts anything from what is left to close.

    ``claimed`` is a claim and not a size. On an order the engine sized itself
    the two are the same number; on one it could not read they are not, and
    there it is the whole of what was left to close at the moment the order
    left, which is the reading ``stdlib.md`` 17.1 makes for an order it cannot
    count.
    """

    #: The tag the close named, or absent where it reduces the leg as a whole.
    part: Optional[str]
    #: The units of that part this order claimed when it was sent.
    claimed: float
    #: Whether ``claimed`` is the order's own quantity or the most it could have
    #: been. False on an order whose quantity the engine cannot read in units.
    counted: bool


@dataclass
class LedgerRow:
    """A row of the ledger, ``stdlib.md`` 17.7's own field list."""

    intent_id: int
    tag: str
    leg: str
    position_ref: int
    instrument: Identity
    product: str
    side: str
    qty: float
    order_type: str
    price: Optional[float]
    trigger: Optional[float]
    placed_at: Optional[float]
    updated_at: Optional[float]
    #: What this order claimed of the position, absent where it claimed nothing.
    #: Fixed when the order was sent and never rewritten, because it is a record
    #: of what the engine measured at that moment and not a running total.
    reduces: Optional[Reduction] = None
    #: This order's own quantity in units, absent where the engine cannot read
    #: it. ``reduces`` says what an order takes out of a position and this says
    #: what it puts into one.
    units: Optional[float] = None
    #: The destination's own reference, recorded, shown, and never parsed.
    order_ref: str = ""
    status: str = PLACED
    filled_qty: float = 0.0
    avg_fill_price: Optional[float] = None
    rejection: str = ""


@dataclass(frozen=True)
class FrameOutcome:
    """What one frame did.

    A refused frame changes nothing and is recorded. ``after_terminal`` is the
    ``fillAfterTerminal`` of 17.11: a fill the strategy could not have expected
    is the event a trader most needs named.
    """

    intent_id: object
    refused: Optional[str] = None
    changed: bool = False
    #: Units this frame added, which is what settles against a position.
    delta: float = 0.0
    price: Optional[float] = None
    after_terminal: bool = False
    #: What ``fillAfterTerminal`` carries, and empty on every other outcome: the
    #: tag, the quantity this frame added and the terminal word it arrived after.
    #: A fill the strategy could not have expected is the event a trader most
    #: needs named, so the payload travels with the outcome rather than being
    #: rebuilt by whoever logs it.
    event: dict = field(default_factory=dict)


def working_units(row: LedgerRow) -> float:
    """How much of this row's claim on the part it reduces is still outstanding.

    Four facts decide the number, and each of them is a case a strategy meets. A
    partial fill of an order the engine counted releases what settled. A partial
    fill of one it could not count leaves the claim whole until the order ends,
    because the claim is in units and the answer is in whatever unit the order
    was written in, and subtracting one from the other is drift. An order that
    has ended releases the rest, which is how a strategy whose close was refused
    closes again. And an order that adds claims nothing at all: an entry that has
    not settled is not a position, and counting it would send a close for units
    that may never exist.
    """
    reduces = row.reduces
    if reduces is None or is_terminal(row.status):
        return 0.0
    if reduces.counted:
        return max(0.0, reduces.claimed - row.filled_qty)
    return reduces.claimed


def refused(intent_id: object, why: str) -> FrameOutcome:
    """A frame that folded nothing, carrying which of 17.14's two it was."""
    return FrameOutcome(intent_id=intent_id, refused=why)


def fold_frame(row: LedgerRow, frame) -> FrameOutcome:
    """Folds one frame into one row, ``stdlib.md`` 17.8 steps 2 to 5 and 7."""
    # A word outside the vocabulary leaves the status alone and the rest of the
    # frame folds anyway. Mapping a destination's own words onto the vocabulary
    # is the host's job under 17.7, and an engine that guessed at one would
    # decide an order was dead on a word it had never seen. Refusing the whole
    # frame instead would throw away the cumulative quantity it carries, which
    # is real whatever the word beside it says.
    status = status_from(frame.status)
    was_terminal = is_terminal(row.status)

    # Step 2. The cumulative quantity never decreases, so a frame reporting less
    # than the row already holds contributes nothing.
    filled = max(row.filled_qty, frame.filled_qty)
    delta = filled - row.filled_qty

    # Step 3. The destination computed its average over the cumulative quantity,
    # so the row takes that average whole. The engine never averages two
    # averages of its own.
    price = frame.avg_fill_price
    if delta > 0 and price is None:
        return refused(frame.intent_id, FILL_WITH_NO_PRICE)

    # Step 4, which a frame arriving at a terminal row does not run: the status
    # records how the order ended and the quantity records what traded, and the
    # two are both true.
    moved = (
        status is not None
        and status != PLACED
        and not was_terminal
        and rank_of(status) >= rank_of(row.status)
        and status != row.status
    )

    text = frame.text if frame.text is not None else ""
    new_text = text != "" and text != row.rejection

    # Step 5, and then step 7: a repeated frame and one overtaken by a later
    # frame both end here, having changed nothing. No fill, no event, no report
    # row, no recalculation.
    if not (moved or delta > 0 or new_text):
        return FrameOutcome(intent_id=frame.intent_id)

    if moved and status is not None:
        row.status = status
    if delta > 0:
        row.filled_qty = filled
        row.avg_fill_price = price
    if new_text:
        row.rejection = text
    if isinstance(frame.order_ref, str):
        row.order_ref = frame.order_ref
    if frame.sent_instrument is not None:
        row.instrument = frame.sent_instrument
    if isinstance(frame.sent_product, str):
        row.product = frame.sent_product
    if isinstance(frame.time, (int, float)) and not isinstance(frame.time, bool):
        row.updated_at = float(frame.time)

    return FrameOutcome(
        intent_id=frame.intent_id,
        changed=True,
        delta=delta,
        price=price if delta > 0 else None,
        after_terminal=was_terminal and delta > 0,
        event=(
            {"tag": row.tag, "added": delta, "after": row.status}
            if was_terminal and delta > 0
            else {}
        ),
    )
