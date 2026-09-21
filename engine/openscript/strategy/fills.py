"""What a run keeps about its intents: which one a frame names, and what settled.

Two things a run holds beside the ledger, because neither is the ledger's.

**An ordinal is how a case names an intent.** ``conformance.md`` section 3 says a
frame names its intent by ordinal and never by an engine's own id: 1 is the first
intent the run placed, 2 the second, and a case cannot know the id another engine
minted, so it must not depend on its spelling. An ordinal greater than the number
of intents the run placed is how a case hands an engine a frame naming an order
its ledger does not hold, and that is step 1 of the fold rather than a mistake
here, so the map answers with nothing and lets the ledger refuse it.

**A fill is what the money is folded from**, and the two sizes of a position
either side of the settlement are kept here rather than read back from the leg.
The leg reports a net and a fill settles against one position reference, and the
two are different numbers whenever a leg holds more than one position, which is
every flip. They are folded in the order the frames were folded in, from the same
deltas, so they are the same arithmetic the position book did rather than a second
reading of its result.

A refused frame settles nothing and is not a fill.
"""

from typing import Dict, List, Optional, Sequence, Tuple

from ..accounting.shapes import RecordedFill
from .intents import OrderIntent
from .rows import FrameOutcome


class Intents:
    """Every intent a run has placed, in the order it placed them.

    The ordinal is the position in that order, counting from one, and it counts
    every intent rather than every ledger row: a bracket and a cancellation take
    an ordinal and append no row, because an ordinal names what the engine handed
    over and a row records what was ordered.
    """

    def __init__(self) -> None:
        self._placed: List[OrderIntent] = []
        self._by_id: Dict[int, OrderIntent] = {}

    def record(self, intents: Sequence[OrderIntent]) -> None:
        """The intents one bar handed over, in the order the bar applied them."""
        for intent in intents:
            self._placed.append(intent)
            self._by_id[intent.intent_id] = intent

    def count(self) -> int:
        return len(self._placed)

    def at_ordinal(self, ordinal: int) -> Optional[OrderIntent]:
        """The intent a case's ordinal names, or nothing where it names none."""
        if ordinal < 1 or ordinal > len(self._placed):
            return None
        return self._placed[ordinal - 1]

    def by_id(self, intent_id: int) -> Optional[OrderIntent]:
        return self._by_id.get(intent_id)

    def ordinal_of(self, intent_id: int) -> int:
        """Which intent of the run this is, or ``0`` for one this run never placed.

        What a record writes beside a ledger row, so that a case names an order by
        a number every engine agrees about.
        """
        for at, intent in enumerate(self._placed):
            if intent.intent_id == intent_id:
                return at + 1
        return 0


class Fills:
    """The fills a run has settled, in fold order, with what each moved."""

    def __init__(self) -> None:
        self._fills: List[RecordedFill] = []
        self._sizes: Dict[int, float] = {}
        self._seq = 0

    def settled(self) -> Tuple[RecordedFill, ...]:
        return tuple(self._fills)

    def record(
        self,
        outcomes: Sequence[FrameOutcome],
        intents: Intents,
        bar_index: int,
        bar_time: Optional[float],
        refs: Optional[Dict[int, str]] = None,
    ) -> Tuple[RecordedFill, ...]:
        """The fills one bar's fold settled, appended in the order they folded.

        The bar is the bar the fold happened at, which is the bar the position
        exists from. Where the fill itself traded is the bar before it or this
        bar's own open, and neither is a bar the strategy could have acted on it
        in.
        """
        made: List[RecordedFill] = []
        for outcome in outcomes:
            if outcome.refused is not None:
                continue
            if outcome.delta <= 0 or outcome.price is None:
                continue
            intent = intents.by_id(outcome.intent_id)
            if intent is None or intent.side is None:
                continue

            before = self._sizes.get(intent.position_ref, 0.0)
            after = before + (-outcome.delta if intent.side == "sell" else outcome.delta)
            self._sizes[intent.position_ref] = after
            self._seq += 1

            fill = RecordedFill(
                seq=self._seq,
                intent_id=outcome.intent_id,
                order_ref="" if refs is None else refs.get(outcome.intent_id, ""),
                tag=intent.tag,
                position_ref=intent.position_ref,
                side=intent.side,
                units=outcome.delta,
                price=outcome.price,
                bar_index=bar_index,
                bar_time=bar_time,
                ref_size_before=before,
                ref_size_after=after,
            )
            self._fills.append(fill)
            made.append(fill)
        return tuple(made)
